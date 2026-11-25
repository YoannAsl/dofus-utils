# Brisage › Calculateur

The user picks an equipment item, sets its coefficient and price, and sees for each characteristic the runes and kamas they get with and without focus, the best option, the profit and the break-even coefficient. Coefficients are remembered per item. `Noter ce brisage` copies the item into the log form below.

## Sub-features

- `calc-search` uses `Objet à briser`, an item search on the live DofusDB catalogue.
- `calc-runes` is the table `Runes par caractéristique`, with one row per rune-giving characteristic and a total row `Total kamas sans focus`.
- `calc-coef` is `Coefficient (%)` (`#shatterCoef`), saved on blur or Enter in `localStorage["dofus-brisage-coefficients-v1"]`.
- `calc-prices` uses the per-rune `Prix HDV <rune> (kamas par unité)` inputs. Until every rune has a price, the total reads `Prix requis`.
- `calc-jets` uses the `Jets` group (`Min`, `Moyen`, `Max`) and the per-line `Diminuer` / `Augmenter` / `Jet <stat>` controls.
- `calc-exo` uses `+ Exo` to add an exotic line, and `Retirer cet exo` to remove it.
- `calc-focus` uses the `Focus noté` select, and the `Rang N` badges on the best options.
- `calc-note` uses `Noter ce brisage` to prefill the log form with the item, price and coefficient.

## How to get to it (user POV)

- Click `Brisage` in the `Outils` navigation, or open `/brisage`. The calculator is the first card.

## Driving it with Playwright

Preconditions:

- Baseline from the README, with internet access to `api.dofusdb.fr`.

- **Pick item.** Fill `Objet à briser` with `Bottes Lunaires`, then click the result button whose name starts with `Bottes Lunaires Niv.`. Table `Runes par caractéristique` shows body rows (11 at commit 78b3049).
- **Coefficient.** Fill `#shatterCoef` with `100` and press Enter. `localStorage["dofus-brisage-coefficients-v1"]` holds 100 for the item.
- **Prices.** Fill every `Prix HDV … (kamas par unité)` in the table with `100`, pressing Tab after each one. `Prix requis` disappears from the total.
- **Note.** Click `Noter ce brisage`. `Objet brisé` contains `Bottes Lunaires` and `#brisageCoefficient` is `100`.
- Journey: `brisage-calculator` covers `calc-search`, `calc-runes`, `calc-coef`, `calc-prices` and `calc-note`. `calc-jets`, `calc-exo` and `calc-focus` are not driven yet.

## Gotchas

- Some items give no runes (for example `Gelano Ankarton`, the first hit for `Gelano`). The app then says `Cet objet n’a aucune caractéristique qui donne des runes.` and the table has only header and total rows. Pick results by exact name, and count body rows (`tbody tr`), not all rows.
- Search is debounced by 250 ms and goes to DofusDB. Wait for the result button, never a fixed delay.
- There are two `Coefficient (%)` labels on the page, one here and one in the log. Use `#shatterCoef` and `#brisageCoefficient`.
