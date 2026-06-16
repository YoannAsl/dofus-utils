from __future__ import annotations

import json
import unittest
from pathlib import Path

from dofus_ocr.parser import parse_auction_ocr


class ParserTests(unittest.TestCase):
    def test_sample_popup_extracts_item_and_visible_lot_prices(self) -> None:
        fixture_path = Path(__file__).parent / "fixtures" / "sample_windows_ocr.json"
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))

        result = parse_auction_ocr(payload)

        self.assertEqual(result.item_name, "Bl\u00e9")
        self.assertEqual(
            [(lot.quantity, lot.total_price) for lot in result.lots],
            [(1, 43), (10, 979), (100, 2397), (1000, 6190)],
        )
        self.assertAlmostEqual(result.lots[0].unit_price, 43)
        self.assertAlmostEqual(result.lots[1].unit_price, 97.9)
        self.assertAlmostEqual(result.lots[2].unit_price, 23.97)
        self.assertAlmostEqual(result.lots[3].unit_price, 6.19)
        self.assertEqual(result.best_lot.quantity, 1000)
        self.assertAlmostEqual(result.weighted_average_unit_price, 9609 / 1111)
        self.assertEqual(result.warnings, [])

    def test_rune_fo_popup_handles_ocr_zeroes_in_lot_quantities(self) -> None:
        fixture_path = Path(__file__).parent / "fixtures" / "rune_fo_windows_ocr.json"
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))

        result = parse_auction_ocr(payload)

        self.assertEqual(result.item_name, "Rune Fo")
        self.assertEqual(result.displayed_average_price, 35)
        self.assertEqual(
            [(lot.quantity, lot.total_price) for lot in result.lots],
            [(1, 25), (10, 276), (100, 2977), (1000, 31897)],
        )
        self.assertEqual(result.best_lot.quantity, 1)
        self.assertAlmostEqual(result.best_lot.unit_price, 25)
        self.assertEqual(result.warnings, [])

    def test_full_screenshot_anchors_to_visible_popup_table(self) -> None:
        fixture_path = Path(__file__).parent / "fixtures" / "full_screenshot_windows_ocr.json"
        payload = json.loads(fixture_path.read_text(encoding="utf-8"))

        result = parse_auction_ocr(payload)

        self.assertEqual(result.item_name, "Rune Cri")
        self.assertEqual(
            [(lot.quantity, lot.total_price) for lot in result.lots],
            [(1, 2018), (10, 21403), (100, 218965)],
        )
        self.assertEqual(result.best_lot.quantity, 1)
        self.assertAlmostEqual(result.best_lot.unit_price, 2018)
        self.assertEqual(result.warnings, [])


if __name__ == "__main__":
    unittest.main()
