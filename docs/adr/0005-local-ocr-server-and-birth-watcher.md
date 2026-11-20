# 5. Local OCR server and birth watcher

Status: accepted

## Context

The Python server in `server/` serves the built front, runs Windows OCR, receives ShareX captures, and while breeding watches the Dofus window and its keyboard. Browsers limit what a page can do (clipboard in background tabs, timers), and Windows OCR is slow and error-prone on small text.

## Decision

### Server and front

- The server owns `/api`. In dev, Vite proxies it with `changeOrigin` so the Host header matches what the server checks before handing out ShareX captures.
- Only the app's own page may read captures: browsers set `Sec-Fetch-Site`, and other sites get `cross-site`. A Host check also blocks DNS rebinding, where a page on another name resolving to this machine looks same-origin.
- Page URLs without an extension get `index.html`, since the app routes in the browser. `.js` is served as JavaScript explicitly, because Windows can map it to `text/plain` in the registry, which browsers refuse for module scripts.
- ShareX captures are polled. The cursor only advances once a capture is applied or dismissed, so closing the page does not lose it; polling pauses while a capture waits. A stopped or restarting server is retried on the next poll.
- A pasted image goes to the price OCR, unless a page registers its own handler (the stable reader does on the Élevage tab).
- A capture's price is applied directly only when the item and price are unambiguous. Fuels are priced per unit, so only the ×1 lot is used.
- `/api/ocr/text` returns raw OCR lines for captures that are not auction popups (the stable list).

### Windows OCR

- OCR runs in-process through the optional `winrt` packages. Without them it falls back to PowerShell, about 150 ms slower per image.
- Images are handed over as BMP: compressing a PNG of an upscaled frame costs about 350 ms, and OCR reads BMP as fast. They are converted to grayscale, which reads the same text about 25 % faster.

### Birth watcher (`births.py`)

- While the app listens, the watcher looks at the Dofus window about once a second. It stops 30 s after the app last asked, so a closed page or a switched-off toggle stops it. A failed frame records an error status but does not stop the loop.
- Dofus is found by process name, not window title: the app's own page is « Atelier Dofus » in a browser. Window rectangles and screen pixels only agree in physical pixels, so the process is made DPI-aware.
- Frames are upscaled to about 6000 px wide before OCR (a 2000 px window is tripled, about 0.9 s per frame), since small card text is misread otherwise. Frames whose thumbnail differs by less than 1.5 (mean, 0–255) are skipped.
- The result card is anchored on « Vous avez obtenu ». OCR reads « GEN. » as « CEN. », « CCN. 1 » or « GENS », so the label matches any three letters and a dot, or something close to « gen ». Parent labels sit level with the anchor, one card on each side, within about one card width; further out is another window. Colour names have no digits.
- The baby's sex is the only bright, coloured mark in the card's top-right corner (the card is dark navy, value ≈ 0.3). A parent's sex icon sits at a fixed offset above and right of its « GEN. » label; parent cards are dimmed.
- A card stays on screen for several frames: it counts once, unless it changed, or a later frame reads the sex icon the first one missed.
- A new listener starts from now: it must not copy a birth it never saw.

### Keyboard and clipboard (`keys.py`)

- A low-level keyboard hook watches Ctrl+V, F8 and Shift+F8 while Dofus is in front, and passes every key through unchanged. It runs only while the watcher does. The hook callback is kept alive for the hook's life, and work happens off the hook, which must return quickly or Windows removes it. A held key's repeats are ignored. Checking the action first means a plain « v » typed in chat costs nothing more.
- Dofus reads the clipboard when it gets Ctrl+V, so the clipboard is replaced only after 0.3 s. The clipboard sequence number tells whether it changed without opening it while Dofus pastes. If it changed before the read, a birth replaced it, so no paste is reported.
- Writing the clipboard retries, since another program may hold it for a moment.
