from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

try:
    from winrt.windows.graphics.imaging import BitmapPixelFormat, SoftwareBitmap
    from winrt.windows.media.ocr import OcrEngine
except ImportError:  # Without the winrt packages, OCR goes through PowerShell (~150 ms slower per image).
    OcrEngine = None

_engine = None


def in_process_available() -> bool:
    return OcrEngine is not None


def recognize_image(image: Image.Image) -> dict:
    """OCRs an image held in memory; same payload shape as run_windows_ocr."""
    if OcrEngine is None:
        with TemporaryDirectory() as tmp:
            # BMP: compressing a PNG of an upscaled frame costs ~350 ms; the OCR reads BMP just as fast.
            path = Path(tmp) / "capture.bmp"
            image.save(path)
            return run_windows_ocr(path)

    global _engine
    if _engine is None:
        _engine = OcrEngine.try_create_from_user_profile_languages()
        if _engine is None:
            raise RuntimeError("Windows OCR engine is not available for the current user profile language.")
    # Grayscale reads the same text as colour and the engine runs ~25 % faster on it.
    gray = image.convert("L")
    bitmap = SoftwareBitmap.create_copy_from_buffer(gray.tobytes(), BitmapPixelFormat.GRAY8, gray.width, gray.height)
    result = asyncio.run(_recognize(bitmap))
    return {
        "text": result.text,
        "lines": [
            {
                "text": line.text,
                "words": [
                    {
                        "text": word.text,
                        "box": {
                            "x": word.bounding_rect.x,
                            "y": word.bounding_rect.y,
                            "width": word.bounding_rect.width,
                            "height": word.bounding_rect.height,
                        },
                    }
                    for word in line.words
                ],
            }
            for line in result.lines
        ],
    }


async def _recognize(bitmap):
    return await _engine.recognize_async(bitmap)


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
