# Atelier Dofus verification map

This directory is the maintained source for verifying the user-facing behaviour of the Élevage and Brisage pages of Atelier Dofus. Read this index before driving the app, then use the matching feature file as the recipe. Each feature file has a journey of the same name in `../scripts/drive/journeys/`.

## Baseline preconditions

- An instance started by `atelier.ps1 launch` is healthy on `http://127.0.0.1:8799`, and `atelier.ps1 doctor` prints `OK`.
- Each journey runs in a fresh Chromium context: empty `localStorage`, no saved prices, no stable, no Brisage log.
- Brisage journeys need internet access to `https://api.dofusdb.fr` for item search. Élevage journeys work offline.
- Never drive the user's own instance on port 8765.

## Driving conventions

- Start every recipe from the baseline. Journeys build their own state through the UI.
- Use roles and accessible names, or the ids that visible labels point at. UI text is French: copy names exactly, including `’` (U+2019) in names such as `Comparaison des carburants d’élevage`.
- Run one or more journeys with `node .claude/skills/verify-atelier/scripts/drive/run.mjs <journey> …`.

## Proof and skip reporting

- Proof is the evidence folder: step log, `ok:` checks, screenshots after each action, ARIA snapshots of result tables, and the `localStorage` JSON read back after a reload.
- Report the evidence folder and the sub-feature IDs that a run covered.
- A sub-feature without a journey step is unverified until it is driven by hand with `--headed` or added to the journey. Do not report it as verified.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behaviour, then four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Élevage › Étable](./elevage-etable.md): stable input, plan computation, ticking pairings, persistence.
- [Élevage › Couples](./elevage-couples.md): birth outcomes for a pair, and renaming a mount.
- [Élevage › Carburants](./elevage-carburants.md): fuel cost comparison by category, with HDV prices.
- [Brisage › Calculateur](./brisage-calculator.md): runes and kamas from shattering one item, and coefficient memory.
- [Brisage › Suivi des brisages](./brisage-log.md): logging broken items and their runes, then editing and deleting entries.
