from __future__ import annotations

import json
import unittest
from pathlib import Path

from dofus_ocr.parser import LotOffer, calculate_practical_average_unit_price, parse_auction_ocr


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
        self.assertAlmostEqual(result.practical_average_unit_price, 6.19)
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
        self.assertAlmostEqual(result.weighted_average_unit_price, 35175 / 1111)
        self.assertAlmostEqual(result.practical_average_unit_price, (25 * 0.1 + 27.6) / 1.1)
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
        self.assertAlmostEqual(result.weighted_average_unit_price, 242386 / 111)
        self.assertAlmostEqual(
            result.practical_average_unit_price,
            (2018 * 0.1 + 2140.3 + 2189.65 * 2) / 3.1,
        )
        self.assertEqual(result.warnings, [])

    def test_practical_average_does_not_let_expensive_1000_lot_dominate(self) -> None:
        lots = [
            LotOffer(quantity=1, total_price=1488, unit_price=1488),
            LotOffer(quantity=10, total_price=14887, unit_price=1488.7),
            LotOffer(quantity=100, total_price=145997, unit_price=1459.97),
            LotOffer(quantity=1000, total_price=1613993, unit_price=1613.993),
        ]

        self.assertAlmostEqual(
            calculate_practical_average_unit_price(lots),
            (1488 * 0.1 + 1488.7 + 1459.97 * 2) / 3.1,
        )


if __name__ == "__main__":
    unittest.main()
