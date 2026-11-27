# Brisage › Coût de craft par défaut

When the user picks an item in the Brisage calculator or log and has no HDV price for it, the app fetches its recipe and, if every ingredient has a price, uses the craft cost instead. The calculator saves it as the item's price. The log form only fills `Coût unitaire (k)`.

## Sub-features

- `craft-calc` fills `#shatterPrice` with the craft cost and saves it in `localStorage["dofus-fm-item-prices-v1"]`.
- `craft-log` fills `Coût unitaire (k)` in the log form, without saving a price for the item.
- `craft-incomplete` leaves the price empty when an ingredient has no price.
- `craft-keep` does not overwrite a price the user already has or typed before the recipe arrived.

## How to get to it (user POV)

- Price the ingredients in `Prix & crafts` (`/prix`): search the item, open it, and fill `Prix unitaire · <ingrédient>`.
- Then pick the item in `Objet à briser` or `Objet brisé` on `/brisage`.

## Driving it with Playwright

Preconditions:

- Baseline from the README, with internet access to `api.dofusdb.fr` (items and recipes).

- **Incomplete.** Pick `Bottes Lunaires` in `Objet à briser` and wait for the `recipes/<id>` response. `#shatterPrice` stays empty and the item price store stays empty.
- **Price ingredients.** On `/prix`, fill `#marketSearch` with `Bottes Lunaires`, open it from `Catalogue des objets`, set every `Prix unitaire · …` to `100`. The status reads `Coût de craft · 13 500 k` (8 ingredients at commit 4d329e9).
- **Log.** On `/brisage`, pick it in `Objet brisé`. `Coût unitaire (k)` becomes `13500`, and no price is saved for the item.
- **Calculator.** Pick it in `Objet à briser`. `#shatterPrice` becomes `13500`. After a reload, `dofus-fm-item-prices-v1[21226]` is `13500`, and picking it again shows it.
- Journey: `brisage-craft-cost` covers `craft-calc`, `craft-log` and `craft-incomplete`. `craft-keep` is not driven yet.

## Gotchas

- The prefill is asynchronous, after the recipe request. Wait for the input value, never a fixed delay. The incomplete case waits for the recipe response first.
- The craft cost changes if DofusDB changes the recipe. Read it from the `/prix` status instead of hard-coding it.
