# Atelier Dofus

Track Dofus market prices and calculate crafting costs. The **Prix & crafts** tab searches the live DofusDB catalogue. Filter by resource or equipment, or select **Tous les objets** to search the full catalogue.

Open an item to save its market price in kamas per unit. For craftable items, the recipe shows the required quantities and the cost of buying those ingredients. Enter missing prices directly in the recipe. The app shows a known subtotal until every ingredient has a price.

Prices are stored in the current browser by Dofus item ID. Equipment prices are shared with **Items FM**. Use **Gérer les prix** to export a backup or merge prices from a previous export.

The **Brisage** tab starts with a shattering calculator. Pick an equipment and set its coefficient and price. For each characteristic, it shows the runes and kamas you get without focus and with that characteristic focused, using the community shattering formula (line weight = 3 × jet × characteristic weight × level / 200 + 1, focus adds half the weight of the other positive lines) and your rune prices. Adjust jets, add exotic lines with **+ Exo**, and read the best option, the profit and the break-even coefficient. Coefficients are remembered per item. **Noter ce brisage** copies the item, price and coefficient into the log below.

The tab also keeps a log of broken items. Search for the equipment, enter how many you broke, their unit cost (prefilled from the saved HDV price) and the optional coefficient, then list the runes you got. Each entry shows the cost, the rune value at the current **Prix des runes** prices, and the profit. Runes without a price are flagged instead of counted as zero. The log is stored in the browser and included in **Gérer les prix** exports and imports.

## Run with OCR

The app is built with Vite, React, TypeScript, TanStack Router and shadcn/ui, so it needs Node.js 20+ the first time. The launch scripts install dependencies and rebuild the app automatically when its sources changed. From this folder:

```powershell
.\start-with-ocr.ps1
```

Or from the workspace root:

```powershell
.\start-runes-ocr.ps1
```

Open the printed `http://127.0.0.1:8765/` URL. Paste, drop, or choose an image in **Importer une capture HDV**. The app saves the detected price automatically when it identifies a single item and reads a usable price. If OCR flags a catalogue price, check the lots before clicking **Appliquer le prix**. If the name is misread, open the item in the catalogue and click **Associer à la capture**.

## Import ShareX captures automatically

Set up a dedicated Dofus region capture hotkey in ShareX so you can send just the HDV popup:

1. In **Hotkey settings**, add a **Capture region** hotkey and open its task settings.
2. Override **After capture tasks** for that hotkey and enable **Save image to file** and **Perform actions**. Use PNG as the image format and turn off automatic JPEG conversion for this hotkey.
3. In the hotkey's **Actions** settings, add and enable an action named `Atelier Runes`. Set **File path** to `C:\Windows\System32\curl.exe`, leave **Output file name extension** blank, and check **Hidden window**. Set **Arguments** to:

   ```text
   --fail --silent --show-error --max-time 5 --noproxy "*" --header "Content-Type: image/png" --data-binary "@$input" http://127.0.0.1:8765/api/captures
   ```

Keep the OCR server running and capture the popup with that hotkey. Atelier Dofus opens the OCR panel with the captured image. If the page is closed, the running server keeps the last 10 captures in memory for the page to pick up when it opens. If you start the server on a custom port, use that port in the ShareX action too.

You can also paste a screenshot or choose an image file in the OCR panel.

Prices, the shattering log and coefficients are stored in the browser under the same keys as earlier versions, so existing data carries over.

## Develop

```powershell
npm install
npm run dev        # Vite dev server; forwards /api to the OCR server on 127.0.0.1:8765
npm test           # Vitest on the pricing, shattering and import logic
npm run typecheck
npm run build      # Builds dist/, which the OCR server serves
```

Run `..\start-runes-ocr.ps1` alongside `npm run dev` to get OCR and ShareX captures in development. Each tab is a route in `src/routes`, the calculations live in `src/lib`, and saved data lives in the Zustand stores in `src/stores`.
