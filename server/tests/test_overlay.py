from __future__ import annotations

import unittest

from dofus_ocr.overlay import OverlayApi


class OverlayApiTests(unittest.TestCase):
    def test_exposes_only_close_to_the_page(self) -> None:
        api = OverlayApi()
        api._window = object()

        self.assertEqual([name for name in dir(api) if not name.startswith("_")], ["close"])


if __name__ == "__main__":
    unittest.main()
