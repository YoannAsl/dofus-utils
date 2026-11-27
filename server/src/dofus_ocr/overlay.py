from __future__ import annotations

import argparse

DEFAULT_URL = "http://127.0.0.1:8765/overlay/forgemagie"


class OverlayApi:
    def __init__(self) -> None:
        self._window = None

    def close(self) -> None:
        if self._window is not None:
            self._window.destroy()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Always-on-top smithmagic overlay for Atelier Dofus.")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--width", type=int, default=380)
    parser.add_argument("--height", type=int, default=520)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        import webview
    except ImportError:
        raise SystemExit("pywebview is missing: pip install pywebview")

    api = OverlayApi()
    api._window = webview.create_window(
        "Overlay forgemagie",
        args.url,
        width=args.width,
        height=args.height,
        frameless=True,
        easy_drag=True,
        on_top=True,
        resizable=True,
        background_color="#0a0a0a",
        js_api=api,
    )
    webview.start()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
