# Élevage › Carburants

The user compares breeding fuels (the items that fill the breeding gauges) by category, entering HDV prices to see the cost of each tier.

## Sub-features

- `carburants-category` uses the `Catégorie` radios to switch the fuel list. The choice is kept in `?category=`.
- `carburants-price` uses `Prix HDV de <fuel> (kamas par unité)` inputs, which save the price in the browser, shared with the other pages.
- `carburants-copy` uses `Copier <fuel>` buttons to copy a fuel's name.

## How to get to it (user POV)

- `Élevage`, then the `Carburants` tab. The family toggle is hidden on this tab.
- Open `/elevage?tab=carburants`.

## Driving it with Playwright

Preconditions:

- Baseline from the README. No fuel price is stored.

- **Open.** Go to `/elevage?tab=carburants`. Table `Comparaison des carburants d’élevage` has rows.
- **Category.** Click the second radio in `Catégorie`. The URL gains `category=`.
- **Price.** Fill the first `Prix HDV de … (kamas par unité)` with `1234`, then press Tab. After a reload, the same input still holds 1234.
- Journey: `elevage-carburants` covers `carburants-category` and `carburants-price`.

## Gotchas

- Price inputs commit on blur. Press Tab after filling, or the value is not saved.
- Prices are shared by item ID with Prix & crafts and Items FM. A price set here shows up there too.
