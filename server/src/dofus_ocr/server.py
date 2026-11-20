from __future__ import annotations

import argparse
import json
import mimetypes
import re
import sys
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from urllib.parse import parse_qs
from uuid import uuid4

from . import births as births_module
from .births import BirthWatcher, event_to_dict
from .parser import parse_auction_ocr, result_to_dict
from .windows_ocr import run_windows_ocr
from . import windows_ocr


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
CAPTURES_PATH = "/api/captures"
OCR_PATH = "/api/ocr"
# Raw OCR lines, for captures that are not auction popups (the mount stable list).
OCR_TEXT_PATH = "/api/ocr/text"
# Births seen in the Dofus window and queue keys pressed in it; each request waits for the next one and keeps the watcher running.
BIRTHS_PATH = "/api/births"
BIRTHS_WAIT_SECONDS = 20.0
# The app sends the baby's name here: a background browser tab cannot write the clipboard itself.
CLIPBOARD_PATH = "/api/clipboard"
MOUNT_NAME = re.compile(r"^[MF][A-Z]{12}$")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class RunesOcrHandler(SimpleHTTPRequestHandler):
    server_version = "DofusRunesOcr/0.1"
    # Windows can map .js to text/plain in the registry, which browsers refuse for module scripts.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
    }
    captures: deque[tuple[int, bytes]]
    captures_lock: Lock
    capture_session: str
    birth_watcher: BirthWatcher

    def log_message(self, format: str, *args) -> None:
        return

    def end_headers(self) -> None:
        if self.path.split("?", 1)[0] in (CAPTURES_PATH, BIRTHS_PATH):
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self) -> None:
        path, _, query = self.path.partition("?")
        if path == CAPTURES_PATH:
            if self._allow_capture_request():
                self._send_next_capture(query)
            return
        if path == BIRTHS_PATH:
            if self._allow_capture_request():
                self._send_births(query)
            return
        if path == "/api/health":
            self._send_json(build_health_payload())
            return

        # The app routes in the browser (/brisage, /runes…): serve index.html for page URLs.
        if "." not in path.rsplit("/", 1)[-1] and not Path(self.translate_path(path)).is_file():
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == CAPTURES_PATH and not self._allow_capture_request():
            return
        if path == CLIPBOARD_PATH:
            if self._allow_app_request():
                self._write_clipboard()
            return
        if path not in (OCR_PATH, OCR_TEXT_PATH, CAPTURES_PATH):
            self.send_error(404, "Not found")
            return

        try:
            if path == CAPTURES_PATH:
                self._receive_capture()
            elif path == OCR_TEXT_PATH:
                self._send_json(ocr_text_payload(self._run_ocr_upload(lambda payload, _image_path: payload)))
            else:
                self._send_json(self._run_ocr_upload(lambda payload, image_path: result_to_dict(parse_auction_ocr(payload, source_image=image_path))))
        except ValueError as exc:
            self._send_json({"error": str(exc), "server": build_health_payload()}, status=400)
        except Exception as exc:
            self._send_json({"error": str(exc), "server": build_health_payload()}, status=500)

    def _local_hosts(self) -> tuple[str, ...]:
        port = self.server.server_port
        local_hosts = ("127.0.0.1", "localhost")
        return local_hosts if port == 80 else tuple(f"{host}:{port}" for host in local_hosts)

    def _allow_capture_request(self) -> bool:
        if (
            self.client_address[0] == "127.0.0.1"
            and self.headers.get("Host") in self._local_hosts()
            and self.headers.get("Origin") is None
            and self.headers.get("Sec-Fetch-Site") in (None, "same-origin")
        ):
            return True
        self.send_error(403, "Capture import is local only")
        return False

    def _allow_app_request(self) -> bool:
        """A request from the app's own page: browsers set Sec-Fetch-Site, other sites get cross-site.
        The Host check stops a page on another name that resolves to this machine."""
        if (
            self.client_address[0] == "127.0.0.1"
            and self.headers.get("Host") in self._local_hosts()
            and self.headers.get("Sec-Fetch-Site") in (None, "same-origin")
            and self.headers.get("Content-Type", "").split(";", 1)[0].strip() == "application/json"
        ):
            return True
        self.send_error(403, "Local app only")
        return False

    def _write_clipboard(self) -> None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(min(length, 1024)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send_json({"error": "invalid JSON body"}, status=400)
            return
        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str) or not MOUNT_NAME.match(text):
            self._send_json({"error": "only a 13-letter mount name can be copied"}, status=400)
            return
        try:
            births_module.set_clipboard(text)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=500)
            return
        self.send_response(204)
        self.end_headers()

    def _send_births(self, query: str) -> None:
        cursor = parse_qs(query).get("after", [""])[0]
        session, _, sequence = cursor.partition(":")
        watcher = self.birth_watcher
        # A new listener starts from now: it must not copy a birth it never saw happen.
        after = watcher.sequence
        if session == self.capture_session and len(sequence) <= 16 and sequence.isdecimal():
            after = int(sequence)
        latest, events, status = watcher.wait(after, BIRTHS_WAIT_SECONDS)
        self._send_json(
            {
                "cursor": f"{self.capture_session}:{latest}",
                "events": [event_to_dict(event) for event in events],
                "status": status,
            }
        )

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

    def _run_ocr_upload(self, read):
        """Runs Windows OCR on the uploaded image and returns read(ocr_payload, image_path)."""
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
            return read(ocr_payload, image_path)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def ocr_text_payload(ocr_payload: dict) -> dict:
    """Keeps the text of each OCR line and its words with their boxes."""
    lines = []
    for line in ocr_payload.get("lines") or []:
        words = [
            {"text": str(word.get("text", "")), "box": word.get("box")}
            for word in line.get("words") or []
            if isinstance(word, dict)
        ]
        lines.append({"text": str(line.get("text", "")), "words": words})
    return {"text": str(ocr_payload.get("text", "")), "lines": lines}


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
        help="Directory containing the built runes web app. Defaults to front/dist.",
    )
    return parser


def default_static_dir() -> Path:
    workspace_root = Path(__file__).resolve().parents[3]
    return workspace_root / "front" / "dist"


def make_handler(static_dir: Path):
    class Handler(RunesOcrHandler):
        captures = deque(maxlen=10)
        captures_lock = Lock()
        capture_session = uuid4().hex
        birth_watcher = BirthWatcher()

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
        "births": True,
        "keys": True,
    }


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    static_dir = args.static_dir.expanduser().resolve()

    if not static_dir.exists():
        parser.error(f"static directory does not exist: {static_dir}")
    if not (static_dir / "index.html").exists():
        parser.error(f"static directory does not contain index.html: {static_dir} (run npm run build in front)")

    server = ThreadingHTTPServer((args.host, args.port), make_handler(static_dir))
    url = f"http://{args.host}:{server.server_port}/"
    safe_print(f"Serving Atelier Runes with OCR at {url}")
    safe_print(f"OCR module: {Path(windows_ocr.__file__).resolve()}")
    if not windows_ocr.in_process_available():
        safe_print("Births OCR goes through PowerShell: pip install the winrt packages from pyproject.toml to make it faster.")
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
