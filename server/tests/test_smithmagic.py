from __future__ import annotations

import json
import math
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.request import urlopen

from PIL import Image

from dofus_ocr.server import make_handler
from dofus_ocr.smithmagic import FmRow, SmithmagicWatcher, locate_window, ocr_lines, parse_effect, parse_number, read_window

FIXTURES = Path(__file__).parent / "fixtures"
WINDOW_OFFSET = (470, 260)


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class ParseTests(unittest.TestCase):
    def test_fixes_digits_the_ocr_reads_as_letters(self) -> None:
        self.assertEqual(parse_number("IO"), 10)
        self.assertEqual(parse_number("-4l"), -41)
        self.assertEqual(parse_number("1S3"), 153)
        self.assertIsNone(parse_number("Max"))

    def test_skips_the_effect_icon_before_the_value(self) -> None:
        self.assertEqual(parse_effect("0 1 Portée"), (1, False, "Portée"))
        self.assertEqual(parse_effect("a 43 Agilité"), (43, False, "Agilité"))
        self.assertEqual(parse_effect("G) 8 Résistances Terre"), (8, False, "Résistances Terre"))

    def test_reads_percent_and_negative_values(self) -> None:
        self.assertEqual(parse_effect("@ 8% Résistance Eau"), (8, True, "Résistance Eau"))
        self.assertEqual(parse_effect("5 %Critique"), (5, True, "Critique"))
        self.assertEqual(parse_effect("-IO Intelligence"), (-10, False, "Intelligence"))

    def test_rejects_text_without_a_value(self) -> None:
        self.assertIsNone(parse_effect("VIDER L'HISTORIQUE"))


class ReadWindowTests(unittest.TestCase):
    def test_locates_the_forge_window_in_a_full_frame(self) -> None:
        box = locate_window(ocr_lines(fixture("smithmagic_frame_windows_ocr.json")))

        assert box is not None
        x0, y0, x1, y1 = (round(value / 3) for value in (box.x0, box.y0, box.x1, box.y1))
        self.assertTrue(470 <= x0 <= 490, x0)
        self.assertTrue(255 <= y0 <= 272, y0)
        self.assertTrue(960 <= x1 <= 985, x1)
        self.assertTrue(835 <= y1 <= 850, y1)

    def test_reaches_the_frame_bottom_when_the_history_button_is_misread(self) -> None:
        payload = fixture("smithmagic_frame_windows_ocr.json")
        payload = {"lines": [line for line in payload["lines"] if "VIDER" not in line["text"]]}

        box = locate_window(ocr_lines(payload))

        assert box is not None
        self.assertEqual(box.y1, math.inf)

    def test_reads_the_item_reliquat_and_lines(self) -> None:
        reading = read_window(ocr_lines(fixture("smithmagic_window_windows_ocr.json")))

        assert reading is not None
        self.assertEqual(reading.item, "ANNEAU DE PADGREF")
        self.assertEqual(reading.reliquat, 3.2)
        self.assertEqual(len(reading.rows), 13)
        self.assertEqual(reading.rows[0], FmRow(71, 100, 43, False, "Vitalité", "43 Vitalité"))
        self.assertEqual(reading.rows[4], FmRow(4, 6, 5, True, "Critique", "5% Critique"))
        self.assertEqual([row.label for row in reading.rows[7:9]], ["Dommages Feu", "Dommages Air"])
        self.assertEqual(reading.rows[11], FmRow(7, 10, 10, False, "Résistances Air", "10 Résistances Air"))

    def test_stops_at_the_end_of_the_table_without_the_history_button(self) -> None:
        reading = read_window(ocr_lines(fixture("smithmagic_tall_window_windows_ocr.json")))

        assert reading is not None
        self.assertEqual(len(reading.rows), 13)
        self.assertEqual(reading.rows[-1].label, "Dommages Critiques")

    def test_ignores_the_history_panel(self) -> None:
        reading = read_window(ocr_lines(fixture("smithmagic_window_windows_ocr.json")))

        assert reading is not None
        self.assertNotIn("Dommage Feu", [row.label for row in reading.rows])
        self.assertEqual(sum(row.label == "Intelligence" for row in reading.rows), 1)

    def test_needs_the_table_headers(self) -> None:
        self.assertIsNone(read_window(ocr_lines(fixture("sample_windows_ocr.json"))))


def shift(payload: dict, dx: float, dy: float) -> dict:
    return {
        "lines": [
            {**line, "words": [{**word, "box": {**word["box"], "x": word["box"]["x"] + dx, "y": word["box"]["y"] + dy}} for word in line["words"]]}
            for line in payload["lines"]
        ]
    }


class WatcherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.frame = Image.new("RGB", (2000, 1070), (10, 10, 30))
        self.frame.paste(Image.open(FIXTURES / "smithmagic_window.png").convert("RGB"), WINDOW_OFFSET)
        self.calls: list[tuple[int, int]] = []

    def ocr(self, image: Image.Image) -> dict:
        self.calls.append(image.size)
        if image.size == (self.frame.width * 3, self.frame.height * 3):
            return fixture("smithmagic_frame_windows_ocr.json")
        x0, y0 = self.watcher._region[:2]
        return shift(fixture("smithmagic_window_windows_ocr.json"), (WINDOW_OFFSET[0] - x0) * 3, (WINDOW_OFFSET[1] - y0) * 3)

    def test_finds_the_window_then_rereads_only_its_region_when_it_changes(self) -> None:
        self.watcher = SmithmagicWatcher(grab=lambda: self.frame, ocr=self.ocr)

        self.watcher.step()
        self.assertEqual(self.watcher.status, "watching")
        assert self.watcher.reading is not None
        self.assertEqual(self.watcher.reading.item, "ANNEAU DE PADGREF")
        self.assertEqual(len(self.calls), 2)
        sequence = self.watcher.sequence

        self.watcher.step()
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(self.watcher.sequence, sequence)

        self.frame.paste((230, 230, 230), (700, 380, 704, 386))
        self.watcher.step()
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(self.calls[-1][0] < self.frame.width * 3, True)

    def test_reports_no_window(self) -> None:
        watcher = SmithmagicWatcher(grab=lambda: None, ocr=self.ocr)
        watcher.step()
        self.assertEqual(watcher.status, "no-window")
        self.assertEqual(self.calls, [])


class SmithmagicEndpointTests(unittest.TestCase):
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

    def test_returns_a_cursor_status_and_reading(self) -> None:
        with patch("dofus_ocr.server.SMITHMAGIC_WAIT_SECONDS", 0.01), patch.object(SmithmagicWatcher, "_demand"):
            with urlopen(f"{self.url}/api/smithmagic") as response:
                payload = json.loads(response.read())

        self.assertRegex(payload["cursor"], r"^[0-9a-f]+:0$")
        self.assertIsNone(payload["reading"])
        self.assertEqual(payload["status"], "idle")


if __name__ == "__main__":
    unittest.main()
