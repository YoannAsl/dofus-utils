# Élevage › Étable

The user lists the fertile mounts of their stable by 13-letter name, picks an objective, and gets the pairings to do, grouped by generation, with the G1 to capture. They tick pairings as they do them, and the stable, plan and ticks survive a reload.

## Sub-features

- `etable-input` reads names typed or pasted into `Noms des montures`, completes names cut with `…`, and lists refused names.
- `etable-compute` runs the planner (in a Web Worker) on `Calculer les reproductions` and shows `Les reproductions à faire`.
- `etable-done` ticks `Accouplement N fait` and updates `X fait sur N accouplements`. `Masquer les faits` hides ticked rows.
- `etable-persist` keeps names, plan and ticks per family in `localStorage["dofus-elevage"]`.
- `etable-family` switches between Dragodinde, Muldo and Volkorne with the `Famille de montures` radios. Each family has its own stable.
- `etable-success` is the `Succès` objective, with obtained colours and `N’accoupler que vers les couleurs qui manquent`.
- `etable-capture` reads stable screenshots dropped or pasted on the capture zone, via `/api/ocr/text` (Windows OCR).
- `etable-names` is `Noms à coller`: `Démarrer` makes the server watch Dofus and write names to the clipboard.

## How to get to it (user POV)

- Click `Élevage` in the `Outils` navigation. `Étable` is the default tab.
- Open `/elevage` directly. `?family=muldo` or `?family=volkorne` selects another family.

## Driving it with Playwright

Preconditions:

- Baseline from the README. No stable is stored for any family.

- **Open.** Go to `/elevage`. Tab `Étable` is selected and radio `Dragodinde` exists.
- **Enter stable.** Fill `getByLabel("Noms des montures")` with `MAMAMSAUVSAUV FAMAMSAUVSAUV MDODOSAUVSAUV FDODOSAUVSAUV MROROSAUVSAUV FROROSAUVSAUV`, one per line. Button `Calculer les reproductions` becomes enabled.
- **Compute.** Click it. `Les reproductions à faire` appears within 60 s, with 3 checkboxes `Accouplement N fait` and `0 fait sur 3 accouplements` (3 at commit 78b3049).
- **Tick.** Click `Accouplement 1 fait`. It is checked, and the text reads `1 fait sur …`.
- **Persist.** Reload. The checkbox is still checked, the textarea still holds the names, and `localStorage["dofus-elevage"].dragodinde.done` contains `0` while `.plan.pairings` has as many entries as there are checkboxes.
- Journey: `elevage-etable` covers `etable-input`, `etable-compute`, `etable-done` and `etable-persist`.

## Gotchas

- Never click `Démarrer` under `Noms à coller` in a verification. It makes the server read the screen, watch the keyboard while Dofus is in front, and overwrite the user's clipboard. `etable-names` and `etable-capture` need the game or real screenshots, so they stay unverified by this map. Report them as skipped.
- The plan's pairing count depends on the planner. If it changes, check it against dragodinde.fr before updating this file.
- Switching family keeps each family's stable separately. A test on Muldo does not prove Dragodinde.
