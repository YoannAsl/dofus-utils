from __future__ import annotations

import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from dofus_ocr.windows_ocr import run_windows_ocr


class WindowsOcrTests(unittest.TestCase):
    def test_reads_json_from_output_file(self) -> None:
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=None, stderr=None)

        def fake_run(args, **kwargs):
            output_path = Path(args[args.index("-OutputPath") + 1])
            output_path.write_text('{"text":"Rune Fo","lines":[]}', encoding="utf-8")
            return completed

        with patch("dofus_ocr.windows_ocr.subprocess.run", side_effect=fake_run):
            self.assertEqual(run_windows_ocr(Path("capture.png"))["text"], "Rune Fo")

    def test_missing_output_file_reports_clear_error(self) -> None:
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=None, stderr=None)

        with patch("dofus_ocr.windows_ocr.subprocess.run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "returned no JSON output file"):
                run_windows_ocr(Path("capture.png"))

    def test_invalid_stdout_reports_invalid_json(self) -> None:
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout="not json", stderr="")

        with patch("dofus_ocr.windows_ocr.subprocess.run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "returned invalid JSON"):
                run_windows_ocr(Path("capture.png"))

    def test_non_object_json_is_rejected(self) -> None:
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout="null", stderr="")

        with patch("dofus_ocr.windows_ocr.subprocess.run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "not an object"):
                run_windows_ocr(Path("capture.png"))

    def test_failed_process_handles_missing_streams(self) -> None:
        completed = subprocess.CompletedProcess(args=[], returncode=1, stdout=None, stderr=None)

        with patch("dofus_ocr.windows_ocr.subprocess.run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "PowerShell exited with code 1"):
                run_windows_ocr(Path("capture.png"))


if __name__ == "__main__":
    unittest.main()
