# Brisage › Suivi des brisages

The user logs each batch of broken items: the item, how many, the unit cost, an optional coefficient, and the runes obtained. Each entry shows the cost, the rune value at the current rune prices, and the profit. A summary sums the whole log. Entries can be edited and deleted, and the log persists in the browser.

## Sub-features

- `log-form` is the form with `Objet brisé` (DofusDB search), `#brisageQuantity`, `Coût unitaire (k)`, `#brisageCoefficient`, and rune rows (`Rune Fo` placeholder, `brisageRuneQty-*` quantities, `Ajouter une rune`, `Retirer cette rune`). Its live preview in a `status` reads `Coût … · Runes … · Bénéfice …`.
- `log-save` uses `Enregistrer le brisage` to add the entry to the table `Historique des brisages` and to `localStorage["dofus-brisage-log-v1"]`.
- `log-summary` is the group `Synthèse des brisages`: `Brisages`, `Kamas investis`, `Valeur des runes` and `Bénéfice`. Missing rune prices are flagged, not counted as zero.
- `log-edit` uses `Modifier le brisage <item>` to load the entry into the form, and `Mettre à jour le brisage` / `Annuler la modification` to finish.
- `log-delete` uses `Supprimer le brisage <item>`, then the alert dialog `Supprimer ce brisage du suivi ?`, then `Supprimer`.
- `log-backup` is the log's part of the `Gérer les prix` export and import.

## How to get to it (user POV)

- `/brisage`, below the calculator, under the heading `Suivi des brisages`.
- `Noter ce brisage` in the calculator prefills this form.

## Driving it with Playwright

Preconditions:

- Baseline from the README, with internet access to `api.dofusdb.fr`. The log is empty.

- **Pick item.** Fill `Objet brisé` with `Bottes Lunaires`, then click the result button whose name starts with `Bottes Lunaires Niv.`.
- **Fill.** Set `#brisageQuantity` to `2`, `Coût unitaire (k)` to `50000`, `#brisageCoefficient` to `120`, the first `Rune Fo` input to `Rune Fo`, and the first `brisageRuneQty-*` input to `30`. The status reads `Coût 100 000 k`.
- **Save.** Click `Enregistrer le brisage`. Button `Supprimer le brisage Bottes Lunaires` appears in `Historique des brisages`.
- **Persist.** Reload. The row is still there. `localStorage["dofus-brisage-log-v1"]` has one entry with quantity 2, unitCost 50000, coefficient 120, and one rune with quantity 30.
- **Delete.** Click `Supprimer le brisage Bottes Lunaires`, then `Supprimer` in the alert dialog `Supprimer ce brisage du suivi ?`. The table shows `Aucun brisage enregistré.` and the stored log is `[]`.
- Journey: `brisage-log` covers `log-form`, `log-save` and `log-delete`. `log-summary`, `log-edit` and `log-backup` are not driven yet.

## Gotchas

- Delete asks for confirmation in an in-page alert dialog, not a browser `confirm()`. A Playwright `dialog` handler never fires.
- Rune names come from a `<datalist>`, so typing the exact name is enough. Rune quantity inputs have generated ids. Select them with `input[id^="brisageRuneQty-"]`.
- `Quantité` labels both the item quantity and the rune quantity. Use `#brisageQuantity` for the item.
