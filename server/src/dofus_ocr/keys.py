from __future__ import annotations

import ctypes
import re
import sys
import threading
from typing import Callable

MOUNT_NAME = re.compile(r"^[MF][A-Z]{12}$")
PASTE_SETTLE_SECONDS = 0.3

WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
WM_QUIT = 0x0012
VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12
VK_V = 0x56
VK_F8 = 0x77


def key_action(vk: int, ctrl: bool, shift: bool, alt: bool) -> str | None:
    if alt:
        return None
    if vk == VK_V and ctrl and not shift:
        return "paste"
    if vk == VK_F8 and not ctrl:
        return "previous" if shift else "next"
    return None


def clipboard_sequence() -> int:
    if sys.platform != "win32":
        return 0
    return ctypes.windll.user32.GetClipboardSequenceNumber()


def get_clipboard() -> str | None:
    if sys.platform != "win32":
        return None
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = wintypes.LPVOID
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    if not user32.OpenClipboard(None):
        return None
    try:
        handle = user32.GetClipboardData(13)
        if not handle:
            return None
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            return None
        try:
            return ctypes.wstring_at(pointer)
        finally:
            kernel32.GlobalUnlock(handle)
    finally:
        user32.CloseClipboard()


class KeyHook:

    def __init__(self, on_action: Callable[[str, str | None], None], is_dofus_in_front: Callable[[], bool]) -> None:
        self._on_action = on_action
        self._is_dofus_in_front = is_dofus_in_front
        self._thread: threading.Thread | None = None
        self._thread_id = 0
        self._held: set[int] = set()

    def start(self) -> None:
        if sys.platform != "win32" or (self._thread and self._thread.is_alive()):
            return
        self._thread = threading.Thread(target=self._run, name="key-hook", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._thread and self._thread.is_alive() and self._thread_id:
            ctypes.windll.user32.PostThreadMessageW(self._thread_id, WM_QUIT, 0, 0)
        self._thread = None

    def press(self, vk: int, ctrl: bool, shift: bool, alt: bool) -> None:
        action = key_action(vk, ctrl, shift, alt)
        if action is None or not self._is_dofus_in_front():
            return
        if action != "paste":
            self._on_action(action, None)
            return

        sequence = clipboard_sequence()

        def report_paste() -> None:
            text = (get_clipboard() or "").strip()
            if clipboard_sequence() != sequence:
                return
            if MOUNT_NAME.match(text):
                self._on_action("paste", text)

        timer = threading.Timer(PASTE_SETTLE_SECONDS, report_paste)
        timer.daemon = True
        timer.start()

    def _run(self) -> None:
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        self._thread_id = kernel32.GetCurrentThreadId()

        class KBDLLHOOKSTRUCT(ctypes.Structure):
            _fields_ = [
                ("vkCode", wintypes.DWORD),
                ("scanCode", wintypes.DWORD),
                ("flags", wintypes.DWORD),
                ("time", wintypes.DWORD),
                ("dwExtraInfo", ctypes.c_size_t),
            ]

        HOOKPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
        user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
        user32.SetWindowsHookExW.restype = wintypes.HHOOK
        user32.CallNextHookEx.argtypes = [wintypes.HHOOK, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
        user32.CallNextHookEx.restype = ctypes.c_ssize_t
        user32.UnhookWindowsHookEx.argtypes = [wintypes.HHOOK]
        user32.GetAsyncKeyState.restype = ctypes.c_short

        def held(vk: int) -> bool:
            return bool(user32.GetAsyncKeyState(vk) & 0x8000)

        def callback(code: int, message: int, data: int) -> int:
            if code == 0:
                vk = ctypes.cast(data, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents.vkCode
                if message in (WM_KEYDOWN, WM_SYSKEYDOWN):
                    if vk in (VK_V, VK_F8) and vk not in self._held:
                        self._held.add(vk)
                        ctrl, shift, alt = held(VK_CONTROL), held(VK_SHIFT), held(VK_MENU)
                        if key_action(vk, ctrl, shift, alt):
                            threading.Thread(target=self.press, args=(vk, ctrl, shift, alt), daemon=True).start()
                elif message in (WM_KEYUP, WM_SYSKEYUP):
                    self._held.discard(vk)
            return user32.CallNextHookEx(None, code, message, data)

        procedure = HOOKPROC(callback)
        hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, procedure, None, 0)
        if not hook:
            return
        try:
            message = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                pass
        finally:
            user32.UnhookWindowsHookEx(hook)
            self._held.clear()
