# 9. Smithmagic (forgemagie) overlay

Status: accepted

## Context

While smithmagicking, the player wants the odds of each rune on the item in the forge, without retyping the item into a simulator. DoFocus (dofocus.fr/forgemagie) computes these odds in its browser bundle.

## Decision

### Odds (`front/src/lib/smithmagic.ts`)

- The formulas are rewritten from DoFocus's client code: difficulty from the line position (+45 past 80 % of the roll), over (+65 + 4 × over weight), the ratio of the current value to the rune gain (beyond ×14), the item quality (weighted share of the other lines' max) and a low-level bonus under level 170 and 100. Exotic lines use DoFocus's estimated curve; AP, MP and range exos are a flat 1.5 % critical success.
- Over and exotic weight together cannot exceed 101 on the item, and a line cannot pass `101 / unit weight` (or its max if higher). Maluses count half their weight.
- A differential run against DoFocus's own functions on 20 000 random items matched every outcome when this was written. Compare with the site again before changing behaviour.
- Unit weights come from the rune data; `% Ré mêlée` and `% Ré distance` weigh 10 per point, as on DoFocus.

### Reading the forge (`server/src/dofus_ocr/smithmagic.py`)

- The watcher OCRs the whole Dofus frame only to find the forge: the `Min`, `Max`, `Effets` and `Modif.` headers, the item name level with them on the left, `reliquat :` above and `Vider l'historique` below. After that it OCRs only that region, and only when at least 4 pixels of it changed: a single digit changing moves the mean frame difference too little.
- `Vider l'historique` is often missed when the frame is only doubled (a 2560 px window). The region then runs to the bottom of the frame, and the rows stop at the first gap wider than 2.5 times the usual row spacing, which drops the HUD below the forge.
- Small isolated numbers (the min and max columns) are missed on the full frame but read on the cropped, upscaled region.
- Rows are grouped by height. The min and max columns are split halfway between their headers. The effect value is the last number before the label, since OCR reads the effect icon as `a`, `0`, `@` or `G)`.
- The server returns raw rows; the front matches labels to characteristics (fuzzy, with the `%` flag deciding between fixed and percent resistances).

### Overlay

- The overlay is the `/overlay/forgemagie` route without the app chrome, shown in an always-on-top frameless `pywebview` window started by `start.ps1 --overlay`. It is a page so the future Rust backend only has to serve the same `/api/smithmagic` JSON.
- The front remembers lines scrolled out of the table, and min or max values the OCR missed, for as long as the item name stays the same. A line with only one bound read shows `?` instead of odds.
- The item level comes from DofusDB by exact name; 200 is assumed until it is found.

## Consequences

- The capture reads screen pixels, so the overlay must not cover the forge window, and Dofus must be in front (the overlay pauses while it has focus).
- Exotic odds are estimates, like on DoFocus.
