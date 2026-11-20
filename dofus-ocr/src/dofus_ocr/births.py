"""Watches the Dofus window for the mating result card and reads the baby it shows.

The card reads « Vous avez obtenu », then GEN.n and the baby's colour, with the parents' colours
on either side and the baby's sex as a pink (♀) or blue (♂) icon in the card's top-right corner.
The colour names stay raw text here: the app matches them against its colour tree.
"""

from __future__ import annotations

import colorsys
import ctypes
import re
import sys
import time
import unicodedata
from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import Condition, Thread
from typing import Callable

from PIL import Image, ImageChops, ImageStat

from .keys import KeyHook
from .windows_ocr import recognize_image

# Captures are enlarged up to about this width before OCR: Windows OCR misreads the small card text otherwise.
# A 2000 px window is tripled (≈0.9 s per frame).
OCR_TARGET_WIDTH = 6000
MAX_UPSCALE = 3
WATCH_INTERVAL_SECONDS = 1.0
# The watcher stops this long after the app last asked for births (page closed or switch turned off).
IDLE_STOP_SECONDS = 30.0
# Below this mean pixel difference (0–255) on a thumbnail, the frame is unchanged and OCR is skipped.
UNCHANGED_FRAME_DIFFERENCE = 1.5


@dataclass(frozen=True)
class Box:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def center_x(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def center_y(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass(frozen=True)
class Line:
    text: str
    box: Box


@dataclass(frozen=True)
class BirthText:
    child: str
    generation: int | None
    left_parent: str
    right_parent: str
    anchor: Box
    # Each parent card's « GEN. » label: its sex icon sits at a fixed offset from it.
    left_gen: Box | None = None
    right_gen: Box | None = None


@dataclass(frozen=True)
class Birth:
    child: str
    generation: int | None
    left_parent: str
    right_parent: str
    sex: str | None
    # Which parent card shows ♂: the game puts the male on either side.
    father: str | None = None


@dataclass(frozen=True)
class KeyPress:
    """A queue key pressed in Dofus: « paste » (with the pasted mount name), « next » or « previous »."""

    action: str
    text: str | None = None


def normalize(text: str) -> str:
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", stripped).strip().lower()


def ocr_lines(payload: dict) -> list[Line]:
    lines = []
    for line in payload.get("lines") or []:
        boxes = [word.get("box") for word in line.get("words") or [] if isinstance(word, dict) and isinstance(word.get("box"), dict)]
        if not boxes:
            continue
        box = Box(
            min(b["x"] for b in boxes),
            min(b["y"] for b in boxes),
            max(b["x"] + b["width"] for b in boxes),
            max(b["y"] + b["height"] for b in boxes),
        )
        lines.append(Line(str(line.get("text", "")), box))
    return lines


# Windows OCR reads the « GEN. » label as « CEN. », « CCN. 1 » or « GENS » (for GEN.6):
# any three letters and a dot, or something close to « gen ».
GEN_LABEL = re.compile(r"^(?:[cg][eo]n(?:s\b|(?![a-z]))|[a-z]{3}\s*[.,]\s*\w?$)")


def _is_gen(text: str) -> bool:
    return GEN_LABEL.match(normalize(text)) is not None


def _join(lines: list[Line]) -> str:
    return " ".join(line.text.strip() for line in sorted(lines, key=lambda line: (line.box.y0, line.box.x0))).strip()


def read_birth_text(lines: list[Line]) -> BirthText | None:
    """Finds the result card around « Vous avez obtenu », or None when no card is on screen."""
    anchor = next((line.box for line in lines if "obtenu" in normalize(line.text)), None)
    if anchor is None:
        return None
    unit = anchor.height or 1.0
    card_x0 = anchor.x0 - 0.3 * anchor.width
    card_x1 = anchor.x1 + 0.3 * anchor.width
    in_card = lambda box: card_x0 <= box.center_x <= card_x1

    gen_lines = [line for line in lines if _is_gen(line.text) and line.box.y0 > anchor.y1 and in_card(line.box)]
    if not gen_lines:
        return None
    gen = min(gen_lines, key=lambda line: line.box.y0)
    digits = re.findall(r"\d+", gen.text)
    generation = int(digits[-1]) if digits else None

    child_lines = [
        line
        for line in lines
        if in_card(line.box)
        and gen.box.y1 - 1 <= line.box.y0 <= gen.box.y1 + 4 * unit
        and not re.search(r"xp|\d", normalize(line.text))
    ]
    child = _join(child_lines)
    if not child:
        return None

    # Parent labels sit level with the anchor, one card on each side, under their own GEN line.
    def parent(side: Callable[[Box], bool]) -> str:
        return _join(
            [
                line
                for line in lines
                if side(line.box)
                and anchor.y0 - 4 * unit <= line.box.center_y <= anchor.y1 + 0.5 * unit
                and not _is_gen(line.text)
                and not re.search(r"\d", line.text)  # Colour names have no digits.
            ]
        )

    # The parent cards sit within about one card width of the result; further out is another window.
    reach = 2 * anchor.width
    left_side = lambda box: box.x1 < anchor.x0 and box.center_x > anchor.x0 - reach
    right_side = lambda box: box.x0 > anchor.x1 and box.center_x < anchor.x1 + reach

    def parent_gen(side: Callable[[Box], bool]) -> Box | None:
        boxes = [line.box for line in lines if side(line.box) and _is_gen(line.text) and anchor.y0 - 6 * unit <= line.box.center_y <= anchor.y1]
        return min(boxes, key=lambda box: abs(box.center_y - anchor.center_y), default=None)

    return BirthText(child, generation, parent(left_side), parent(right_side), anchor, parent_gen(left_side), parent_gen(right_side))


def _pixel_kind(pixel: tuple[int, int, int], min_value: float = 0.36, min_saturation: float = 0.15) -> str | None:
    red, green, blue = (channel / 255 for channel in pixel[:3])
    hue, saturation, value = colorsys.rgb_to_hsv(red, green, blue)
    # The card is dark navy (value ≈ 0.3): the icon is the only bright, coloured mark in its corner.
    if value < min_value or saturation < min_saturation:
        return None
    hue *= 360
    if hue >= 280 or hue <= 15:
        return "F"
    if 170 <= hue <= 232:
        return "M"
    return None


def card_sex(image: Image.Image, anchor: Box) -> str | None:
    """Reads the sex icon in the card's top-right corner, just below « Vous avez obtenu »."""
    unit = anchor.height or 1.0
    region = (
        int(anchor.x1 - 3 * unit),
        int(anchor.y1 + 1 * unit),
        int(anchor.x1 + 1.5 * unit),
        int(anchor.y1 + 4.5 * unit),
    )
    return _icon_sex(image, region)


def parent_sex(image: Image.Image, gen: Box, unit: float) -> str | None:
    """Reads a parent card's sex icon, above and right of its « GEN. » label. The parent cards are dimmed."""
    region = (
        int(gen.center_x + 2.8 * unit),
        int(gen.y0 - 7 * unit),
        int(gen.center_x + 5 * unit),
        int(gen.y0 - 5 * unit),
    )
    return _icon_sex(image, region, min_value=0.2, min_saturation=0.3)


def _icon_sex(image: Image.Image, region: tuple[int, int, int, int], **thresholds: float) -> str | None:
    corner = image.convert("RGB").crop(region)
    counts = {"F": 0, "M": 0}
    data = corner.tobytes()
    for offset in range(0, len(data), 3):
        kind = _pixel_kind((data[offset], data[offset + 1], data[offset + 2]), **thresholds)
        if kind:
            counts[kind] += 1
    area = max(1, corner.width * corner.height)
    female, male = counts["F"], counts["M"]
    if max(female, male) < max(4, area * 0.01):
        return None
    if female >= 2 * male:
        return "F"
    if male >= 2 * female:
        return "M"
    return None


def read_birth(payload: dict, image: Image.Image) -> Birth | None:
    text = read_birth_text(ocr_lines(payload))
    if text is None:
        return None
    unit = text.anchor.height or 1.0
    left = parent_sex(image, text.left_gen, unit) if text.left_gen else None
    right = parent_sex(image, text.right_gen, unit) if text.right_gen else None
    father = "left" if (left == "M" or right == "F") and "F" != left and "M" != right else None
    if father is None and (right == "M" or left == "F") and "F" != right and "M" != left:
        father = "right"
    return Birth(text.child, text.generation, text.left_parent, text.right_parent, card_sex(image, text.anchor), father)


# --- Windows: the Dofus window and the clipboard -------------------------------------------------

_dpi_aware = False


def _make_dpi_aware() -> None:
    """Window rectangles and screen pixels only agree in physical pixels."""
    global _dpi_aware
    if _dpi_aware or sys.platform != "win32":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass
    _dpi_aware = True


def _process_name(pid: int) -> str:
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not handle:
        return ""
    try:
        size = ctypes.c_ulong(1024)
        buffer = ctypes.create_unicode_buffer(size.value)
        if not kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            return ""
        return Path(buffer.value).name.lower()
    finally:
        kernel32.CloseHandle(handle)


def dofus_window() -> tuple[int, int, int, int] | None:
    """Screen rectangle of the Dofus client area, only while Dofus is the window in front."""
    if sys.platform != "win32":
        return None
    from ctypes import wintypes

    _make_dpi_aware()
    user32 = ctypes.windll.user32
    window = user32.GetForegroundWindow()
    if not window or user32.IsIconic(window):
        return None
    pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(window, ctypes.byref(pid))
    # The process, not the title: the app's own page is « Atelier Dofus » in a browser window.
    process = _process_name(pid.value)
    if not process.startswith("dofus") or "launcher" in process:
        return None

    rect = wintypes.RECT()
    if not user32.GetClientRect(window, ctypes.byref(rect)):
        return None
    origin = wintypes.POINT(0, 0)
    user32.ClientToScreen(window, ctypes.byref(origin))
    if rect.right <= 0 or rect.bottom <= 0:
        return None
    return origin.x, origin.y, origin.x + rect.right, origin.y + rect.bottom


def grab_dofus() -> Image.Image | None:
    rect = dofus_window()
    if rect is None:
        return None
    from PIL import ImageGrab

    return ImageGrab.grab(bbox=rect, all_screens=True)


def set_clipboard(text: str) -> None:
    if sys.platform != "win32":
        raise RuntimeError("clipboard is only supported on Windows")
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = wintypes.LPVOID
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]

    data = (text + "\0").encode("utf-16-le")
    for _ in range(10):  # Another program may hold the clipboard for a moment.
        if user32.OpenClipboard(None):
            break
        time.sleep(0.05)
    else:
        raise RuntimeError("clipboard is busy")
    try:
        user32.EmptyClipboard()
        handle = kernel32.GlobalAlloc(0x0002, len(data))  # GMEM_MOVEABLE
        pointer = kernel32.GlobalLock(handle)
        ctypes.memmove(pointer, data, len(data))
        kernel32.GlobalUnlock(handle)
        if not user32.SetClipboardData(13, handle):  # CF_UNICODETEXT
            raise RuntimeError("could not write the clipboard")
    finally:
        user32.CloseClipboard()


# --- The watcher ---------------------------------------------------------------------------------


def _ocr_image(image: Image.Image) -> tuple[dict, Image.Image]:
    factor = min(MAX_UPSCALE, round(OCR_TARGET_WIDTH / max(1, image.width)))
    if factor > 1:
        image = image.resize((image.width * factor, image.height * factor), Image.LANCZOS)
    return recognize_image(image), image


def _thumbnail(image: Image.Image) -> Image.Image:
    return image.convert("L").resize((96, 54))


def _difference(a: Image.Image, b: Image.Image) -> float:
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


class BirthWatcher:
    """Looks at the Dofus window once a second while the app is listening, and keeps the births it sees,
    along with the queue keys pressed in Dofus meanwhile."""

    def __init__(
        self,
        grab: Callable[[], Image.Image | None] = grab_dofus,
        ocr: Callable[[Image.Image], tuple[dict, Image.Image]] = _ocr_image,
        interval: float = WATCH_INTERVAL_SECONDS,
        watch_keys: bool = True,
    ) -> None:
        self._grab = grab
        self._ocr = ocr
        self._interval = interval
        self._condition = Condition()
        self._events: deque[tuple[int, Birth | KeyPress]] = deque(maxlen=50)
        self._keys = KeyHook(lambda action, text: self._add(KeyPress(action, text)), lambda: dofus_window() is not None) if watch_keys else None
        self._sequence = 0
        self._last_demand = 0.0
        self._thread: Thread | None = None
        self.status = "idle"
        self._card: Birth | None = None
        self._last_frame: Image.Image | None = None

    @property
    def sequence(self) -> int:
        return self._sequence

    def wait(self, after: int, timeout: float) -> tuple[int, list[Birth | KeyPress], str]:
        """Waits up to `timeout` for births and key presses after `after`; keeps the watcher running meanwhile."""
        deadline = time.monotonic() + timeout
        with self._condition:
            self._demand()
            while True:
                fresh = [birth for sequence, birth in self._events if sequence > after]
                remaining = deadline - time.monotonic()
                if fresh or remaining <= 0:
                    return self._sequence, fresh, self.status
                self._condition.wait(min(remaining, 5.0))
                self._demand()

    def _demand(self) -> None:
        self._last_demand = time.monotonic()
        if self._thread is None or not self._thread.is_alive():
            self._thread = Thread(target=self._run, name="birth-watcher", daemon=True)
            self._thread.start()

    def _run(self) -> None:
        if self._keys:
            self._keys.start()
        try:
            while time.monotonic() - self._last_demand < IDLE_STOP_SECONDS:
                started = time.monotonic()
                try:
                    self.step()
                except Exception as exc:  # A failed frame must not stop the watcher.
                    self.status = f"error: {exc}"
                time.sleep(max(0.0, self._interval - (time.monotonic() - started)))
        finally:
            if self._keys:
                self._keys.stop()
            self.status = "idle"

    def _add(self, event: Birth | KeyPress) -> None:
        with self._condition:
            self._sequence += 1
            self._events.append((self._sequence, event))
            self._condition.notify_all()

    def step(self) -> None:
        frame = self._grab()
        if frame is None:
            self.status = "no-window"
            self._last_frame = None
            return
        self.status = "watching"
        thumbnail = _thumbnail(frame)
        if self._last_frame is not None and _difference(thumbnail, self._last_frame) < UNCHANGED_FRAME_DIFFERENCE:
            return
        self._last_frame = thumbnail

        payload, read_image = self._ocr(frame)
        birth = read_birth(payload, read_image)
        if birth is None:
            self._card = None
            return
        # A card stays on screen for several frames: count it once, unless it changed in between,
        # or a frame finally reads the sex icon that the first one missed.
        previous = self._card
        if previous is not None and _same_card(previous, birth) and (previous.sex is not None or birth.sex is None):
            return
        self._card = birth
        self._add(birth)


def _same_card(a: Birth, b: Birth) -> bool:
    return (a.child, a.left_parent, a.right_parent) == (b.child, b.left_parent, b.right_parent)


def event_to_dict(event: Birth | KeyPress) -> dict:
    if isinstance(event, KeyPress):
        return {"type": event.action, "text": event.text}
    return {"type": "birth", **asdict(event)}
