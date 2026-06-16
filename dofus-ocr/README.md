# Dofus OCR

Windows OCR helper for Dofus auction popups. It reads the item name, extracts visible lot prices, and normalizes each lot to a kamas-per-item price.

## Quick run

From this folder:

```powershell
.\dofus-ocr.ps1 --image "C:\path\to\popup.png"
```

To capture the current screen:

```powershell
.\dofus-ocr.ps1 --screenshot
```

If the screenshot is the full game window, crop to the popup:

```powershell
.\dofus-ocr.ps1 --screenshot --crop 100,80,440,400
```

The crop format is `x,y,width,height`. Add `--save-capture captures\last.png` to inspect exactly what was OCRed.

For scripts or automation:

```powershell
.\dofus-ocr.ps1 --image "C:\path\to\popup.png" --json
```

## Runes app integration

From the workspace root:

```powershell
.\start-runes-ocr.ps1
```

Open the printed local URL, copy a Dofus HDV screenshot to the clipboard, then paste it into Atelier Runes. The page sends the image to the local OCR endpoint, matches the detected item name to a rune, and stores the practical visible average unit price in the existing local rune prices.

If you are already in `runes-dofus`, this starts the same server:

```powershell
.\start-with-ocr.ps1
```

## Output values

- `lots`: each visible auction row with `quantity`, `total_price`, and `unit_price`.
- `best_lot`: the visible row with the cheapest unit price.
- `weighted_average_unit_price`: `sum(total_price) / sum(quantity)` across visible rows.
- `practical_average_unit_price`: unit-price average used by Atelier Runes. It anchors on the best non-x1 lot, ignores clearly worse visible lots, and gives x1 a tiny weight.
- `simple_average_unit_price`: average of the visible row unit prices.
- `displayed_average_price`: the top `Prix moyen` value when OCR can read it. Icons sometimes make this field noisy, so price calculations use the lot rows.

## Notes

This uses the Windows built-in OCR API through PowerShell, so there is no Tesseract install. The parser corrects common OCR digit mistakes such as `1 ooo` for `1 000`, then uses row positions and the standard Dofus lot order `1, 10, 100, 1000` to infer a missing quantity when the table is still unambiguous.

## Tests

```powershell
.\dofus-ocr.ps1 --image "C:\Users\yoann\AppData\Local\Temp\codex-clipboard-54bb678d-126a-478d-afe8-dea2b5a6aa09.png"
```

Parser unit tests:

```powershell
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
```
