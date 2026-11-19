from __future__ import annotations

import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.request import Request, urlopen

from dofus_ocr.server import make_handler

STABLE_OCR = {
    "text": "FPOORPOPOOROR GEN. 2 MININSAUVSAUV",
    "lines": [
        {
            "text": "FPOORPOPOOROR GEN. 2",
            "words": [
                {"text": "FPOORPOPOOROR", "box": {"x": 10.0, "y": 20.0, "width": 90.0, "height": 12.0}},
                {"text": "GEN.", "box": {"x": 120.0, "y": 20.0, "width": 25.0, "height": 12.0}},
            ],
        },
        {"text": "MININSAUVSAUV", "words": [{"text": "MININSAUVSAUV", "box": {"x": 10.0, "y": 50.0, "width": 90.0, "height": 12.0}}]},
    ],
}


class OcrTextEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.static = TemporaryDirectory()
        Path(self.static.name, "index.html").write_text("<!doctype html>", encoding="utf-8")
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(Path(self.static.name)))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.static.cleanup()

    def test_returns_ocr_lines_with_word_boxes(self) -> None:
        request = Request(
            f"http://127.0.0.1:{self.server.server_port}/api/ocr/text",
            data=b"\x89PNG\r\n\x1a\nfake",
            headers={"Content-Type": "image/png"},
            method="POST",
        )
        with patch("dofus_ocr.server.run_windows_ocr", return_value=STABLE_OCR):
            with urlopen(request) as response:
                payload = json.loads(response.read())

        self.assertEqual([line["text"] for line in payload["lines"]], ["FPOORPOPOOROR GEN. 2", "MININSAUVSAUV"])
        self.assertEqual(payload["lines"][0]["words"][0], STABLE_OCR["lines"][0]["words"][0])


if __name__ == "__main__":
    unittest.main()
