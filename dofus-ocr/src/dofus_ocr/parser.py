from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean
from typing import Any


EXPECTED_DOFUS_LOTS = [1, 10, 100, 1000]


@dataclass(frozen=True)
class OcrBox:
    x: float
    y: float
    width: float
    height: float

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2


@dataclass(frozen=True)
class OcrWord:
    text: str
    box: OcrBox


@dataclass(frozen=True)
class OcrLine:
    text: str
    words: list[OcrWord]
    box: OcrBox


@dataclass(frozen=True)
class LotOffer:
    quantity: int
    total_price: int
    unit_price: float


@dataclass(frozen=True)
class AuctionOcrResult:
    item_name: str | None
    displayed_average_price: int | None
    lots: list[LotOffer]
    best_lot: LotOffer | None
    weighted_average_unit_price: float | None
    simple_average_unit_price: float | None
    warnings: list[str] = field(default_factory=list)
    source_image: str | None = None
    raw_text: str | None = None


def parse_auction_ocr(payload: dict[str, Any], source_image: str | Path | None = None) -> AuctionOcrResult:
    lines = _lines_from_payload(payload)
    words = [word for line in lines for word in line.words]
    warnings: list[str] = []

    table = _find_table_headers(words)
    if table is None:
        warnings.append("auction table headers were not found")
        auction_lines = lines
        item_name = _extract_item_name(auction_lines)
        displayed_average_price = _extract_displayed_average(auction_lines)
        lots: list[LotOffer] = []
    else:
        lot_header, price_header = table
        auction_lines = _auction_lines_for_table(lines, lot_header, price_header)
        item_name = _extract_item_name(auction_lines)
        displayed_average_price = _extract_displayed_average(auction_lines)
        price_rows = _extract_price_rows(auction_lines, price_header)
        quantity_rows = _extract_quantity_rows(auction_lines, lot_header)
        quantities = _resolve_quantities(quantity_rows, price_rows, warnings)

        lots = [
            LotOffer(quantity=quantity, total_price=price, unit_price=price / quantity)
            for quantity, (_, price) in zip(quantities, price_rows)
        ]

    best_lot = min(lots, key=lambda lot: lot.unit_price) if lots else None
    weighted_average = (
        sum(lot.total_price for lot in lots) / sum(lot.quantity for lot in lots)
        if lots
        else None
    )
    simple_average = mean(lot.unit_price for lot in lots) if lots else None

    return AuctionOcrResult(
        item_name=item_name,
        displayed_average_price=displayed_average_price,
        lots=lots,
        best_lot=best_lot,
        weighted_average_unit_price=weighted_average,
        simple_average_unit_price=simple_average,
        warnings=warnings,
        source_image=str(source_image) if source_image is not None else payload.get("imagePath"),
        raw_text=payload.get("text"),
    )


def result_to_dict(result: AuctionOcrResult) -> dict[str, Any]:
    return {
        "item_name": result.item_name,
        "displayed_average_price": result.displayed_average_price,
        "lots": [
            {
                "quantity": lot.quantity,
                "total_price": lot.total_price,
                "unit_price": lot.unit_price,
            }
            for lot in result.lots
        ],
        "best_lot": (
            {
                "quantity": result.best_lot.quantity,
                "total_price": result.best_lot.total_price,
                "unit_price": result.best_lot.unit_price,
            }
            if result.best_lot
            else None
        ),
        "weighted_average_unit_price": result.weighted_average_unit_price,
        "simple_average_unit_price": result.simple_average_unit_price,
        "warnings": result.warnings,
        "source_image": result.source_image,
        "raw_text": result.raw_text,
    }


def _lines_from_payload(payload: dict[str, Any]) -> list[OcrLine]:
    lines: list[OcrLine] = []
    for line_payload in payload.get("lines", []):
        words = [
            OcrWord(
                text=str(word_payload.get("text", "")),
                box=_box_from_payload(word_payload.get("box", {})),
            )
            for word_payload in line_payload.get("words", [])
            if str(word_payload.get("text", "")).strip()
        ]
        if not words:
            continue

        lines.append(
            OcrLine(
                text=str(line_payload.get("text") or " ".join(word.text for word in words)),
                words=words,
                box=_union_box([word.box for word in words]),
            )
        )

    return lines


def _box_from_payload(payload: dict[str, Any]) -> OcrBox:
    return OcrBox(
        x=float(payload.get("x", 0)),
        y=float(payload.get("y", 0)),
        width=float(payload.get("width", 0)),
        height=float(payload.get("height", 0)),
    )


def _union_box(boxes: list[OcrBox]) -> OcrBox:
    left = min(box.x for box in boxes)
    top = min(box.y for box in boxes)
    right = max(box.x + box.width for box in boxes)
    bottom = max(box.y + box.height for box in boxes)
    return OcrBox(x=left, y=top, width=right - left, height=bottom - top)


def _normalize_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    ascii_text = "".join(character for character in decomposed if not unicodedata.combining(character))
    return re.sub(r"\s+", " ", ascii_text).strip()


def _parse_number(text: str) -> int | None:
    numeric_text = text
    if re.search(r"\d", numeric_text):
        numeric_text = re.sub(r"[oO]", "0", numeric_text)

    digits = re.sub(r"\D", "", numeric_text)
    if not digits:
        return None
    return int(digits)


def _extract_item_name(lines: list[OcrLine]) -> str | None:
    if not lines:
        return None

    level_line = _find_first_line(lines, lambda line: _normalize_text(line.text).startswith("niv"))
    if level_line is not None:
        candidates = [
            line
            for line in lines
            if line.box.y < level_line.box.y
            and abs(line.box.x - level_line.box.x) < 80
            and line.box.y > level_line.box.y - 80
        ]
        if candidates:
            return max(candidates, key=lambda line: line.box.y).text.strip()

    price_line = _find_first_line(lines, lambda line: "prix moyen" in _normalize_text(line.text))
    if price_line is not None:
        candidates = [
            line
            for line in lines
            if line.box.y < price_line.box.y
            and line.box.x <= price_line.box.x + 80
            and "niv" not in _normalize_text(line.text)
        ]
        if candidates:
            return min(candidates, key=lambda line: line.box.y).text.strip()

    ignored_prefixes = ("lot", "prix", "quantite", "acheter")
    for line in sorted(lines, key=lambda line: (line.box.y, line.box.x)):
        normalized = _normalize_text(line.text)
        if not any(normalized.startswith(prefix) for prefix in ignored_prefixes):
            return line.text.strip()

    return None


def _extract_displayed_average(lines: list[OcrLine]) -> int | None:
    for line in lines:
        normalized = _normalize_text(line.text)
        if "prix moyen" not in normalized:
            continue

        tail = re.split(r"prix\s+moyen\s*:?", line.text, flags=re.IGNORECASE, maxsplit=1)
        if len(tail) == 2:
            value = _parse_number(tail[1])
            if value is not None:
                return value

    return None


def _find_table_headers(words: list[OcrWord]) -> tuple[OcrWord, OcrWord] | None:
    lot_words = [word for word in words if _normalize_text(word.text) == "lot"]
    price_words = [word for word in words if _normalize_text(word.text) == "prix"]

    best_pair: tuple[OcrWord, OcrWord] | None = None
    best_score = float("inf")
    for lot_word in lot_words:
        for price_word in price_words:
            if price_word.box.center_x <= lot_word.box.center_x:
                continue
            vertical_gap = abs(price_word.box.center_y - lot_word.box.center_y)
            if vertical_gap > 30:
                continue
            score = vertical_gap + abs((price_word.box.center_x - lot_word.box.center_x) - 220) / 10
            if score < best_score:
                best_score = score
                best_pair = (lot_word, price_word)

    return best_pair


def _auction_lines_for_table(
    lines: list[OcrLine],
    lot_header: OcrWord,
    price_header: OcrWord,
) -> list[OcrLine]:
    action_rows = _extract_action_rows(lines, price_header)
    bottom = (
        max(line.box.y + line.box.height for _, line in action_rows) + 24
        if action_rows
        else lot_header.box.y + 240
    )
    right = (
        max(line.box.x + line.box.width for _, line in action_rows) + 24
        if action_rows
        else price_header.box.x + 180
    )
    left = lot_header.box.x - 260
    top = lot_header.box.y - 180

    return [
        line
        for line in lines
        if line.box.y + line.box.height >= top
        and line.box.y <= bottom
        and line.box.x + line.box.width >= left
        and line.box.x <= right
    ]


def _extract_price_rows(lines: list[OcrLine], price_header: OcrWord) -> list[tuple[float, int]]:
    min_y = price_header.box.y + 15
    min_x = price_header.box.x - 80
    max_x = price_header.box.x + 60
    action_rows = _extract_action_rows(lines, price_header)
    action_row_y_values = [y for y, _ in action_rows]
    action_tolerance = _action_row_tolerance(action_row_y_values)
    rows: list[tuple[float, int]] = []

    for line in lines:
        if line.box.y <= min_y:
            continue
        if line.box.center_x < min_x or line.box.center_x > max_x:
            continue
        if action_row_y_values and not any(
            abs(line.box.center_y - action_y) <= action_tolerance
            for action_y in action_row_y_values
        ):
            continue
        if any(_is_buy_word(word.text) for word in line.words):
            continue

        value = _parse_number(line.text)
        if value is None:
            continue
        rows.append((line.box.center_y, value))

    return _dedupe_rows(rows)


def _extract_action_rows(lines: list[OcrLine], price_header: OcrWord) -> list[tuple[float, OcrLine]]:
    min_y = price_header.box.y + 15
    min_x = price_header.box.center_x + 20
    max_x = price_header.box.center_x + 240
    rows: list[tuple[float, OcrLine]] = []

    for line in lines:
        if line.box.y <= min_y:
            continue
        if line.box.center_x < min_x or line.box.center_x > max_x:
            continue
        if not any(_is_buy_word(word.text) for word in line.words):
            continue
        rows.append((line.box.center_y, line))

    return _dedupe_action_rows(rows)


def _is_buy_word(text: str) -> bool:
    return _normalize_text(text).startswith("achete")


def _dedupe_action_rows(rows: list[tuple[float, OcrLine]]) -> list[tuple[float, OcrLine]]:
    sorted_rows = sorted(rows, key=lambda row: row[0])
    deduped: list[tuple[float, OcrLine]] = []
    for y, line in sorted_rows:
        if deduped and abs(deduped[-1][0] - y) < 8:
            continue
        deduped.append((y, line))
    return deduped


def _action_row_tolerance(row_y_values: list[float]) -> float:
    sorted_y = sorted(row_y_values)
    gaps = [next_y - y for y, next_y in zip(sorted_y, sorted_y[1:]) if next_y > y]
    if not gaps:
        return 16
    return max(16, min(gaps) * 0.45)


def _extract_quantity_rows(lines: list[OcrLine], lot_header: OcrWord) -> list[tuple[float, int]]:
    min_y = lot_header.box.y + 15
    min_x = lot_header.box.x - 30
    max_x = lot_header.box.x + 80
    rows: list[tuple[float, int]] = []

    for line in lines:
        if line.box.y <= min_y:
            continue
        if line.box.center_x < min_x or line.box.center_x > max_x:
            continue

        value = _parse_number(line.text)
        if value is None:
            continue
        if value not in EXPECTED_DOFUS_LOTS:
            continue
        rows.append((line.box.center_y, value))

    return _dedupe_rows(rows)


def _dedupe_rows(rows: list[tuple[float, int]]) -> list[tuple[float, int]]:
    sorted_rows = sorted(rows, key=lambda row: row[0])
    deduped: list[tuple[float, int]] = []
    for y, value in sorted_rows:
        if deduped and abs(deduped[-1][0] - y) < 8:
            previous_y, previous_value = deduped[-1]
            if len(str(value)) > len(str(previous_value)):
                deduped[-1] = (previous_y, value)
            continue
        deduped.append((y, value))
    return deduped


def _resolve_quantities(
    quantity_rows: list[tuple[float, int]],
    price_rows: list[tuple[float, int]],
    warnings: list[str],
) -> list[int]:
    inferred = _infer_quantities_from_row_positions(quantity_rows, price_rows)
    if inferred is not None:
        return inferred

    if len(price_rows) <= len(EXPECTED_DOFUS_LOTS):
        warnings.append(
            "quantity OCR was incomplete; using Dofus default lot order 1, 10, 100, 1000"
        )
        return EXPECTED_DOFUS_LOTS[: len(price_rows)]

    warnings.append("quantity OCR did not match price rows")
    return [value for _, value in sorted(quantity_rows, key=lambda row: row[0])]


def _infer_quantities_from_row_positions(
    quantity_rows: list[tuple[float, int]],
    price_rows: list[tuple[float, int]],
) -> list[int] | None:
    sorted_prices = sorted(price_rows, key=lambda row: row[0])
    sorted_quantities = sorted(quantity_rows, key=lambda row: row[0])
    if not sorted_prices or not sorted_quantities:
        return None

    if len(sorted_quantities) == len(sorted_prices):
        return [value for _, value in sorted_quantities]

    row_matches = _match_quantity_rows_to_price_rows(sorted_quantities, sorted_prices)
    if not row_matches:
        return None

    offsets: list[int] = []
    for price_index, quantity in row_matches:
        try:
            quantity_index = EXPECTED_DOFUS_LOTS.index(quantity)
        except ValueError:
            return None
        offsets.append(quantity_index - price_index)

    if len(set(offsets)) != 1:
        return None

    offset = offsets[0]
    inferred: list[int] = []
    for price_index, _ in enumerate(sorted_prices):
        quantity_index = price_index + offset
        if quantity_index < 0 or quantity_index >= len(EXPECTED_DOFUS_LOTS):
            return None
        inferred.append(EXPECTED_DOFUS_LOTS[quantity_index])

    return inferred


def _match_quantity_rows_to_price_rows(
    quantity_rows: list[tuple[float, int]],
    price_rows: list[tuple[float, int]],
) -> list[tuple[int, int]]:
    tolerance = _row_match_tolerance(price_rows)
    matches: list[tuple[int, int]] = []
    used_price_indexes: set[int] = set()

    for quantity_y, quantity in quantity_rows:
        nearest = min(
            enumerate(price_rows),
            key=lambda indexed_row: abs(indexed_row[1][0] - quantity_y),
        )
        price_index, (price_y, _) = nearest
        if price_index in used_price_indexes:
            return []
        if abs(price_y - quantity_y) > tolerance:
            continue
        used_price_indexes.add(price_index)
        matches.append((price_index, quantity))

    return matches


def _row_match_tolerance(price_rows: list[tuple[float, int]]) -> float:
    sorted_y = [y for y, _ in sorted(price_rows, key=lambda row: row[0])]
    gaps = [next_y - y for y, next_y in zip(sorted_y, sorted_y[1:]) if next_y > y]
    if not gaps:
        return 14
    return max(14, min(gaps) * 0.45)


def _find_first_line(lines: list[OcrLine], predicate) -> OcrLine | None:
    for line in sorted(lines, key=lambda candidate: (candidate.box.y, candidate.box.x)):
        if predicate(line):
            return line
    return None
