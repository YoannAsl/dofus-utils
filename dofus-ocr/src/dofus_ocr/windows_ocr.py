from __future__ import annotations

import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory


def _output_text(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8-sig", errors="replace").strip()
    return value.strip()


def run_windows_ocr(image_path: str | Path) -> dict:
    script_path = Path(__file__).with_name("windows_ocr.ps1")
    image_path = Path(image_path).resolve()

    with TemporaryDirectory() as tmp:
        output_path = Path(tmp) / "windows-ocr.json"
        completed = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
                "-ImagePath",
                str(image_path),
                "-OutputPath",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
            check=False,
        )

        if completed.returncode != 0:
            details = _output_text(completed.stderr) or _output_text(completed.stdout)
            if not details:
                details = f"PowerShell exited with code {completed.returncode}"
            raise RuntimeError(f"Windows OCR failed: {details}")

        json_text = _read_ocr_json_text(output_path, completed.stdout, completed.stderr)

    try:
        payload = json.loads(json_text)
    except (json.JSONDecodeError, TypeError) as exc:
        raise RuntimeError(f"Windows OCR returned invalid JSON: {json_text!r}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("Windows OCR returned JSON that is not an object")

    return payload


def _read_ocr_json_text(output_path: Path, stdout: str | bytes | None, stderr: str | bytes | None) -> str:
    if output_path.exists():
        text = _output_text(output_path.read_text(encoding="utf-8-sig"))
        if text:
            return text

    stdout_text = _output_text(stdout)
    if stdout_text:
        return stdout_text

    stderr_text = _output_text(stderr)
    details = f" stderr: {stderr_text}" if stderr_text else ""
    raise RuntimeError(f"Windows OCR returned no JSON output file.{details}")
