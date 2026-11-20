# 4. Mount names and OCR repair

Status: accepted

## Context

The app identifies mounts by the name the player gives them in game, and reads those names (and birth cards) from screenshots with Windows OCR, which misreads small text.

## Decision

### Names

- A mount name is 13 letters: sex letter, the 4-letter colour code, then the 4-letter codes of the first and second parent. A captured mount has no parents and ends in `SAUVSAUV`; its short form is expanded to 13 letters, which the game and the clipboard expect.
- A base colour has a 2-letter code. A solid colour (odd generation) doubles its code. A bicolour uses the codes of its first recipe, sorted, so either order is accepted when reading. `keepOrder` keeps the game's recipe order for display.
- The game cuts long names with « … », and then the second parent is missing. It is replaced by the mount's own colour.
- A pasted list is JSON (`["…"]` or `{ mounts, illisibles }`) or free text separated by spaces, commas or newlines. Every word of free text counts, so non-names get flagged.

### Stable screenshots

- Captures narrower than 2400 px are upscaled before OCR: it reads small names better. Upscaling sometimes cuts a name, so unreadable lines are reread on the original.
- Captures are appended to the draft; they are assumed not to overlap.
- Misread names are realigned on the expected grammar (sex, colour, parent 1, parent 2 or `SAUVSAUV`) by dynamic programming over the family's codes, with a weighted edit distance. Letters the OCR confuses (`ODQ`, `ILJT`, `UV`, `EF`, `MN`, `BE`, `SZ`, `CG`, `AR`) cost half to substitute, and split glyphs are joined (`IJ` → `U`, `RN` → `M`…). The repair is kept only if it is close and unambiguous: two nearly as plausible readings naming different mounts are rejected.
- OCR reads « … » reliably: without it, a short name lost a letter rather than being cut.
- A name split into several words (« MPOIN PO POI NIN ») is rejoined, longest candidate first, since a lone piece sometimes "repairs" into another name.
- Every stable row has a generation label; rows with a generation but no readable name are reported.

### Birth cards

- Colour text is compared on letters only, without accents or short words (« Pourpre ct Ébène » → `pourpreebene`), and bicolours in both orders, since the game writes « Pourpre et Orchidée ».
- The generation number can be misread, so matching retries on all colours.
- The game shows the father on either side. A♂×B♀ and B♂×A♀ have the same colours, so the ♂ card decides which was born. When a plan pairing matches the parents, its two mounts give the exact order, and the read ♂ wins over an already-done row (that row is being redone). Otherwise the father is the ♂ card, or the left card if the icon is unreadable. The current pairing is tried first.
- A later frame that finally reads the sex keeps the same card id, so it updates the earlier reading instead of adding a birth.

### Market captures

- Breeding fuels are matched locally rather than through DofusDB. A clipped capture can cut the last word of a long fuel name, so the match allows a truncated last word.
