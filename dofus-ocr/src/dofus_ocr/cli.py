from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageGrab

from .parser import parse_auction_ocr, result_to_dict
from .windows_ocr import run_windows_ocr


def parse_crop(value: str) -> tuple[int, int, int, int]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("crop must be x,y,width,height")

    try:
        x, y, width, height = (int(part) for part in parts)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("crop values must be integers") from exc

    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("crop width and height must be positive")

    return x, y, width, height


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dofus-ocr",
        description="Extract item and prices from a Dofus auction popup image.",
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--image", type=Path, help="Path to an existing popup screenshot.")
    source.add_argument(
        "--screenshot",
        action="store_true",
        help="Capture the current desktop screenshot before running OCR.",
    )
    parser.add_argument(
        "--crop",
        type=parse_crop,
        metavar="x,y,w,h",
        help="Crop the source before OCR. Useful when --screenshot captures the full screen.",
    )
    parser.add_argument(
        "--save-capture",
        type=Path,
        help="When using --screenshot, save the captured/cropped image to this path.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON instead of the human summary.",
    )
    parser.add_argument(
        "--debug-ocr-json",
        type=Path,
        help="Write raw Windows OCR JSON to this path for troubleshooting.",
    )
    return parser


def prepare_image(args: argparse.Namespace, temp_dir: Path) -> Path:
    if args.image:
        image_path = args.image.expanduser().resolve()
        if not image_path.exists():
            raise FileNotFoundError(f"image not found: {image_path}")

        if args.crop is None:
            return image_path

        image = Image.open(image_path)
    else:
        image = ImageGrab.grab(all_screens=True)

    if args.crop is not None:
        x, y, width, height = args.crop
        image = image.crop((x, y, x + width, y + height))

    if args.save_capture:
        output_path = args.save_capture.expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
    elif args.screenshot:
        output_dir = Path.cwd() / "captures"
        output_dir.mkdir(exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        output_path = output_dir / f"dofus-auction-{timestamp}.png"
    else:
        output_path = temp_dir / "cropped-popup.png"

    image.save(output_path)
    return output_path


def format_money(value: float) -> str:
    if value == int(value):
        return f"{int(value):,}".replace(",", " ")
    return f"{value:,.2f}".replace(",", " ")


def print_summary(result) -> None:
    print(f"Item: {result.item_name or 'not found'}")

    if result.displayed_average_price is not None:
        print(f"Displayed average: {result.displayed_average_price} kamas")

    if not result.lots:
        print("Lots: not found")
        return

    print("Lots:")
    for lot in result.lots:
        print(
            f"  x{lot.quantity:<5} total {lot.total_price:>7} kamas"
            f" -> {format_money(lot.unit_price)} kamas/item"
        )

    if result.best_lot is not None:
        print(
            "Best unit price: "
            f"x{result.best_lot.quantity} at {format_money(result.best_lot.unit_price)} kamas/item"
        )

    if result.weighted_average_unit_price is not None:
        print(
            "Weighted visible average: "
            f"{format_money(result.weighted_average_unit_price)} kamas/item"
        )

    if result.practical_average_unit_price is not None:
        print(
            "Practical visible average: "
            f"{format_money(result.practical_average_unit_price)} kamas/item"
        )

    if result.simple_average_unit_price is not None:
        print(
            "Simple lot average: "
            f"{format_money(result.simple_average_unit_price)} kamas/item"
        )

    if result.warnings:
        print("Warnings:")
        for warning in result.warnings:
            print(f"  - {warning}")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        with TemporaryDirectory() as tmp:
            image_path = prepare_image(args, Path(tmp))
            ocr_payload = run_windows_ocr(image_path)

            if args.debug_ocr_json:
                debug_path = args.debug_ocr_json.expanduser().resolve()
                debug_path.parent.mkdir(parents=True, exist_ok=True)
                debug_path.write_text(
                    json.dumps(ocr_payload, ensure_ascii=True, indent=2),
                    encoding="utf-8",
                )

            result = parse_auction_ocr(ocr_payload, source_image=image_path)

        if args.json:
            print(json.dumps(result_to_dict(result), ensure_ascii=False, indent=2))
        else:
            print_summary(result)

        return 0
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
