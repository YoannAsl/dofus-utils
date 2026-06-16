# Atelier Runes

Static Dofus rune pricing tool with an optional local OCR bridge.

## Run with OCR

From this folder:

```powershell
.\start-with-ocr.ps1
```

Or from the workspace root:

```powershell
.\start-runes-ocr.ps1
```

Open the printed `http://127.0.0.1:8765/` URL. Copy a Dofus HDV screenshot to the clipboard and paste it into the app. The OCR panel updates the matched rune with the cheapest visible unit price.

Opening `index.html` directly still works for manual price entry, but OCR paste requires the local server.
