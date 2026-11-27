from __future__ import annotations

import math
import re
import time
from dataclasses import asdict, dataclass
from threading import Condition, Thread
from typing import Callable

from PIL import Image, ImageChops

from .births import Box, grab_dofus, normalize
from .windows_ocr import recognize_image

WATCH_INTERVAL_SECONDS = 0.7
IDLE_STOP_SECONDS = 30.0
CHANGED_PIXEL_LEVEL = 40
CHANGED_PIXELS = 4
TABLE_GAP = 2.5
OCR_TARGET_WIDTH = 6000
MAX_UPSCALE = 3
NUMBER_TOKEN = re.compile(r"^[-−–]?[0-9IlO|oSB]+%?$")
DIGIT_FIXES = str.maketrans({"I": "1", "l": "1", "|": "1", "O": "0", "o": "0", "S": "5", "B": "8", "−": "-", "–": "-"})
RELIQUAT_VALUE = re.compile(r"[-−]?\d+(?:[.,]\d+)?")


@dataclass(frozen=True)
class Word:
    text: str
    box: Box


@dataclass(frozen=True)
class OcrLine:
    text: str
    box: Box
    words: tuple[Word, ...]


@dataclass(frozen=True)
class Headers:
    min: Box
    max: Box
    effects: Box
    modif: Box | None

    @property
    def unit(self) -> float:
        return max(1.0, self.min.height)


@dataclass(frozen=True)
class FmRow:
    min: int | None
    max: int | None
    value: int | None
    percent: bool
    label: str
    text: str


@dataclass(frozen=True)
class FmReading:
    item: str
    reliquat: float | None
    rows: tuple[FmRow, ...]


def _box(raw: dict) -> Box:
    return Box(raw["x"], raw["y"], raw["x"] + raw["width"], raw["y"] + raw["height"])


def ocr_lines(payload: dict) -> list[OcrLine]:
    lines = []
    for line in payload.get("lines") or []:
        words = tuple(Word(str(word.get("text", "")), _box(word["box"])) for word in line.get("words") or [] if isinstance(word, dict) and isinstance(word.get("box"), dict))
        if not words:
            continue
        box = Box(min(w.box.x0 for w in words), min(w.box.y0 for w in words), max(w.box.x1 for w in words), max(w.box.y1 for w in words))
        lines.append(OcrLine(str(line.get("text", "")), box, words))
    return lines


def find_headers(lines: list[OcrLine]) -> Headers | None:
    words = [word for line in lines for word in line.words]
    for low in (w for w in words if normalize(w.text) == "min"):
        unit = max(1.0, low.box.height)

        def level(word: Word) -> bool:
            return abs(word.box.center_y - low.box.center_y) < unit and word.box.x0 > low.box.x1

        high = min((w for w in words if level(w) and normalize(w.text) == "max"), key=lambda w: w.box.x0, default=None)
        if high is None:
            continue
        effects = min((w for w in words if level(w) and w.box.x0 > high.box.x1 and normalize(w.text).startswith(("effet", "carac"))), key=lambda w: w.box.x0, default=None)
        if effects is None:
            continue
        modif = min((w for w in words if level(w) and w.box.x0 > effects.box.x1 and normalize(w.text).startswith("modif")), key=lambda w: w.box.x0, default=None)
        return Headers(low.box, high.box, effects.box, modif.box if modif else None)
    return None


def _reliquat_line(lines: list[OcrLine], headers: Headers) -> OcrLine | None:
    candidates = [line for line in lines if normalize(line.text).startswith("reliquat") and line.box.y1 < headers.min.y0]
    return max(candidates, key=lambda line: line.box.y0, default=None)


def _item_line(lines: list[OcrLine], headers: Headers) -> OcrLine | None:
    candidates = [
        line
        for line in lines
        if line.box.x1 < headers.min.x0 and abs(line.box.center_y - headers.min.center_y) < headers.unit and re.search(r"[A-Za-z]{2}", line.text)
    ]
    return max(candidates, key=lambda line: line.box.x1, default=None)


def _bottom_line(lines: list[OcrLine], headers: Headers) -> OcrLine | None:
    return next((line for line in lines if "vider" in normalize(line.text) and line.box.y0 > headers.min.y1), None)


def locate_window(lines: list[OcrLine]) -> Box | None:
    headers = find_headers(lines)
    if headers is None or headers.modif is None:
        return None
    unit = headers.unit
    item = _item_line(lines, headers)
    reliquat = _reliquat_line(lines, headers)
    bottom = _bottom_line(lines, headers)
    return Box(
        (item.box.x0 if item else headers.min.x0 - 10 * unit) - unit,
        (reliquat.box.y0 if reliquat else headers.min.y0 - 4 * unit) - unit,
        headers.modif.x0 - 0.2 * unit,
        bottom.box.y1 + unit if bottom else math.inf,
    )


def parse_number(text: str) -> int | None:
    cleaned = text.strip().translate(DIGIT_FIXES).rstrip("%")
    return int(cleaned) if re.fullmatch(r"-?\d+", cleaned) else None


def parse_effect(text: str) -> tuple[int | None, bool, str] | None:
    tokens = re.sub(r"%(?=\S)", "% ", text).split()
    for index in range(len(tokens) - 1, -1, -1):
        token = tokens[index]
        rest = tokens[index + 1 :]
        if not NUMBER_TOKEN.match(token) or not rest:
            continue
        percent = token.endswith("%")
        if rest[0] == "%":
            percent, rest = True, rest[1:]
        if rest and re.match(r"[^\W\d_]", rest[0]):
            return parse_number(token), percent, " ".join(rest)
    return None


def _parse_reliquat(line: OcrLine | None) -> float | None:
    if line is None:
        return None
    _, _, after = line.text.partition(":")
    match = RELIQUAT_VALUE.search((after or line.text).translate(DIGIT_FIXES))
    return float(match.group().replace(",", ".").replace("−", "-")) if match else None


def read_window(lines: list[OcrLine]) -> FmReading | None:
    headers = find_headers(lines)
    if headers is None:
        return None
    unit = headers.unit
    spacing = headers.max.center_x - headers.min.center_x
    min_max_split = (headers.min.center_x + headers.max.center_x) / 2
    effects_start = headers.effects.x0 - 0.4 * unit
    bottom = _bottom_line(lines, headers)
    top = headers.min.y1 + 0.3 * unit
    floor = bottom.box.y0 if bottom else float("inf")
    left = headers.min.center_x - 0.6 * spacing
    right = headers.modif.x0 if headers.modif else float("inf")

    words = sorted(
        (w for line in lines for w in line.words if top < w.box.center_y < floor and left < w.box.center_x < right),
        key=lambda w: w.box.center_y,
    )
    clusters: list[list[Word]] = []
    for word in words:
        if clusters and word.box.center_y - clusters[-1][0].box.center_y < 0.6 * unit:
            clusters[-1].append(word)
        else:
            clusters.append([word])

    rows = []
    for cluster in clusters:
        ordered = sorted(cluster, key=lambda w: w.box.x0)
        low = [w.text for w in ordered if w.box.center_x < min_max_split]
        high = [w.text for w in ordered if min_max_split <= w.box.center_x < effects_start]
        effect_text = " ".join(w.text for w in ordered if w.box.center_x >= effects_start)
        parsed = parse_effect(effect_text)
        if parsed is None:
            continue
        value, percent, label = parsed
        row = FmRow(
            min=parse_number("".join(low)) if low else None,
            max=parse_number("".join(high)) if high else None,
            value=value,
            percent=percent,
            label=label,
            text=effect_text,
        )
        rows.append((cluster[0].box.center_y, row))

    item = _item_line(lines, headers)
    return FmReading(
        item=item.text.strip() if item else "",
        reliquat=_parse_reliquat(_reliquat_line(lines, headers)),
        rows=tuple(_table_rows(rows)),
    )


def _table_rows(rows: list[tuple[float, FmRow]]) -> list[FmRow]:
    if len(rows) < 3:
        return [row for _, row in rows]
    gaps = sorted(b[0] - a[0] for a, b in zip(rows, rows[1:]))
    spacing = gaps[len(gaps) // 2]
    kept = [rows[0]]
    for previous, current in zip(rows, rows[1:]):
        if current[0] - previous[0] > TABLE_GAP * spacing:
            break
        kept.append(current)
    return [row for _, row in kept]


def _upscale(image: Image.Image, factor: int) -> Image.Image:
    return image.resize((image.width * factor, image.height * factor), Image.LANCZOS) if factor > 1 else image


def _region_thumbnail(image: Image.Image) -> Image.Image:
    return image.convert("L").resize((max(1, image.width // 2), max(1, image.height // 2)))


def _region_changed(a: Image.Image, b: Image.Image) -> bool:
    if a.size != b.size:
        return True
    changed = ImageChops.difference(a, b).point(lambda value: 255 if value > CHANGED_PIXEL_LEVEL else 0)
    return changed.histogram()[255] >= CHANGED_PIXELS


def reading_to_dict(reading: FmReading | None) -> dict | None:
    return None if reading is None else asdict(reading)


class SmithmagicWatcher:
    def __init__(
        self,
        grab: Callable[[], Image.Image | None] = grab_dofus,
        ocr: Callable[[Image.Image], dict] = recognize_image,
        interval: float = WATCH_INTERVAL_SECONDS,
    ) -> None:
        self._grab = grab
        self._ocr = ocr
        self._interval = interval
        self._condition = Condition()
        self._sequence = 0
        self._last_demand = 0.0
        self._thread: Thread | None = None
        self._region: tuple[int, int, int, int] | None = None
        self._last_region: Image.Image | None = None
        self.status = "idle"
        self.reading: FmReading | None = None

    @property
    def sequence(self) -> int:
        return self._sequence

    def wait(self, after: int, timeout: float) -> tuple[int, FmReading | None, str]:
        deadline = time.monotonic() + timeout
        with self._condition:
            self._demand()
            while self._sequence <= after:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self._condition.wait(min(remaining, 5.0))
                self._demand()
            return self._sequence, self.reading, self.status

    def _demand(self) -> None:
        self._last_demand = time.monotonic()
        if self._thread is None or not self._thread.is_alive():
            self._thread = Thread(target=self._run, name="smithmagic-watcher", daemon=True)
            self._thread.start()

    def _run(self) -> None:
        try:
            while time.monotonic() - self._last_demand < IDLE_STOP_SECONDS:
                started = time.monotonic()
                try:
                    self.step()
                except Exception as exc:
                    self._set_status(f"error: {exc}")
                time.sleep(max(0.0, self._interval - (time.monotonic() - started)))
        finally:
            self.status = "idle"

    def _set_status(self, status: str) -> None:
        if status == self.status:
            return
        with self._condition:
            self.status = status
            self._sequence += 1
            self._condition.notify_all()

    def _publish(self, reading: FmReading | None) -> None:
        with self._condition:
            if reading == self.reading:
                return
            self.reading = reading
            self._sequence += 1
            self._condition.notify_all()

    def step(self) -> None:
        frame = self._grab()
        if frame is None:
            self._set_status("no-window")
            return
        factor = max(1, min(MAX_UPSCALE, round(OCR_TARGET_WIDTH / max(1, frame.width))))

        if self._region is not None:
            reading = self._read_region(frame, factor)
            if reading is not None:
                self._set_status("watching")
                if reading is not False:
                    self._publish(reading)
                return

        self._region = None
        self._last_region = None
        payload = self._ocr(_upscale(frame, factor))
        box = locate_window(ocr_lines(payload))
        if box is None:
            self._set_status("no-forge")
            self._publish(None)
            return
        self._region = (
            max(0, int(box.x0 / factor)),
            max(0, int(box.y0 / factor)),
            min(frame.width, int(box.x1 / factor) + 1),
            min(frame.height, int(box.y1 / factor) + 1) if math.isfinite(box.y1) else frame.height,
        )
        reading = self._read_region(frame, factor)
        self._set_status("watching" if reading is not None else "no-forge")
        if reading:
            self._publish(reading)

    def _read_region(self, frame: Image.Image, factor: int) -> FmReading | None | bool:
        region = frame.crop(self._region)
        thumbnail = _region_thumbnail(region)
        if self._last_region is not None and not _region_changed(thumbnail, self._last_region):
            return False
        reading = read_window(ocr_lines(self._ocr(_upscale(region, factor))))
        if reading is None:
            self._region = None
            self._last_region = None
            return None
        self._last_region = thumbnail
        return reading
