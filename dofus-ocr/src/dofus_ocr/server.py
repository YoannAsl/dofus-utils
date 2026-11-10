from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from urllib.parse import parse_qs
from uuid import uuid4

from .parser import parse_auction_ocr, result_to_dict
from .windows_ocr import run_windows_ocr
from . import windows_ocr


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
CAPTURES_PATH = "/api/captures"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class RunesOcrHandler(SimpleHTTPRequestHandler):
    server_version = "DofusRunesOcr/0.1"
    captures: deque[tuple[int, bytes]]
    captures_lock: Lock
    capture_session: str

    def log_message(self, format: str, *args) -> None:
        return

    def end_headers(self) -> None:
        if self.path.split("?", 1)[0] == CAPTURES_PATH:
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path, _, query = self.path.partition("?")
        if path == CAPTURES_PATH:
            if self._allow_capture_request():
                self._send_next_capture(query)
            return
        if path == "/api/health":
            self._send_json(build_health_payload())
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == CAPTURES_PATH and not self._allow_capture_request():
            return
        if path not in ("/api/ocr", CAPTURES_PATH):
            self.send_error(404, "Not found")
            return

        try:
            if path == CAPTURES_PATH:
                self._receive_capture()
            else:
                self._handle_ocr_upload()
        except ValueError as exc:
            self._send_json({"error": str(exc), "server": build_health_payload()}, status=400)
        except Exception as exc:
            self._send_json({"error": str(exc), "server": build_health_payload()}, status=500)

    def _allow_capture_request(self) -> bool:
        port = self.server.server_port
        local_hosts = ("127.0.0.1", "localhost")
        hosts = local_hosts if port == 80 else tuple(f"{host}:{port}" for host in local_hosts)
        if (
            self.client_address[0] == "127.0.0.1"
            and self.headers.get("Host") in hosts
            and self.headers.get("Origin") is None
            and self.headers.get("Sec-Fetch-Site") in (None, "same-origin")
        ):
            return True
        self.send_error(403, "Capture import is local only")
        return False

    def _receive_capture(self) -> None:
        if self.headers.get("Content-Type") != "image/png":
            raise ValueError("ShareX capture must be a PNG image")
        image_bytes = self._read_image_body()
        if not image_bytes.startswith(PNG_SIGNATURE):
            raise ValueError("ShareX capture must be a PNG image")

        with self.captures_lock:
            sequence = self.captures[-1][0] + 1 if self.captures else 1
            self.captures.append((sequence, image_bytes))
        self.send_response(204)
        self.end_headers()

    def _send_next_capture(self, query: str) -> None:
        cursor = parse_qs(query).get("after", [""])[0]
        session, _, sequence = cursor.partition(":")
        after = 0
        if session == self.capture_session and len(sequence) <= 16 and sequence.isdecimal():
            after = int(sequence)
        with self.captures_lock:
            capture = next((entry for entry in self.captures if entry[0] > after), None)
        if capture is None:
            self.send_response(204)
            self.end_headers()
            return

        sequence, image_bytes = capture
        self.send_response(200)
        self.send_header("X-Capture-Id", f"{self.capture_session}:{sequence}")
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(image_bytes)))
        self.end_headers()
        self.wfile.write(image_bytes)

    def _read_image_body(self) -> bytes:
        content_length = self.headers.get("Content-Length")
        if not content_length:
            raise ValueError("missing image body")

        try:
            length = int(content_length)
        except ValueError as exc:
            raise ValueError("invalid content length") from exc

        if length <= 0:
            raise ValueError("empty image body")
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("image is too large")

        image_bytes = self.rfile.read(length)
        if len(image_bytes) != length:
            raise ValueError("incomplete image body")
        return image_bytes

    def _handle_ocr_upload(self) -> None:
        content_type = self.headers.get("Content-Type", "application/octet-stream").split(";", 1)[0]
        content_type = content_type.strip().lower()
        if content_type != "application/octet-stream" and not content_type.startswith("image/"):
            raise ValueError("request body must be an image")

        image_bytes = self._read_image_body()
        extension = mimetypes.guess_extension(content_type) or ".png"
        if extension == ".jpe":
            extension = ".jpg"

        with TemporaryDirectory() as tmp:
            image_path = Path(tmp) / f"rune-capture{extension}"
            image_path.write_bytes(image_bytes)
            ocr_payload = run_windows_ocr(image_path)
            if not isinstance(ocr_payload, dict):
                raise RuntimeError("Windows OCR returned no JSON payload")
            result = parse_auction_ocr(ocr_payload, source_image=image_path)

        self._send_json(result_to_dict(result))

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dofus-runes-ocr-server",
        description="Serve the runes app with a local Dofus OCR endpoint.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind. Defaults to 127.0.0.1.")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind. Defaults to 8765.")
    parser.add_argument(
        "--static-dir",
        type=Path,
        default=default_static_dir(),
        help="Directory containing the runes web app.",
    )
    return parser


def default_static_dir() -> Path:
    workspace_root = Path(__file__).resolve().parents[3]
    return workspace_root / "runes-dofus"


def make_handler(static_dir: Path):
    class Handler(RunesOcrHandler):
        captures = deque(maxlen=10)
        captures_lock = Lock()
        capture_session = uuid4().hex

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(static_dir), **kwargs)

    return Handler


def safe_print(message: str = "") -> None:
    try:
        print(message, flush=True)
    except OSError:
        pass


def build_health_payload() -> dict:
    return {
        "ok": True,
        "server_version": RunesOcrHandler.server_version,
        "server_file": str(Path(__file__).resolve()),
        "windows_ocr_file": str(Path(windows_ocr.__file__).resolve()),
    }


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    static_dir = args.static_dir.expanduser().resolve()

    if not static_dir.exists():
        parser.error(f"static directory does not exist: {static_dir}")
    if not (static_dir / "index.html").exists():
        parser.error(f"static directory does not contain index.html: {static_dir}")

    server = ThreadingHTTPServer((args.host, args.port), make_handler(static_dir))
    url = f"http://{args.host}:{server.server_port}/"
    safe_print(f"Serving Atelier Runes with OCR at {url}")
    safe_print(f"OCR module: {Path(windows_ocr.__file__).resolve()}")
    safe_print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        safe_print()
        return 0
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
