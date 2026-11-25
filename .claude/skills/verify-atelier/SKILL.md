---
name: verify-atelier
description: Launch Atelier Dofus (this repo's web app, served by the local Python server) on its own port and drive the Élevage and Brisage pages in a real Chromium with Playwright, capturing screenshots, ARIA snapshots, stored data and a trace. Use after changing anything under front/src/routes/elevage.tsx, front/src/routes/brisage.tsx, front/src/components/elevage, front/src/components/brisage, front/src/lib/mounts, front/src/lib/shatter.ts, front/src/stores/stable.ts or front/src/stores/brisage.ts, or whenever you need to prove those features work in the real app and not only in Vitest.
---

# Verify Atelier Dofus

Atelier Dofus is a Vite/React app (`front/`) served by the Python server in `server/` (`python -m dofus_ocr.server`). The server serves `front/dist` and the `/api` routes. This skill starts a **separate** instance on port **8799**, drives it with Playwright, and writes evidence under `.verify/evidence/` (gitignored).

The user usually has their own instance running on **8765** through `start.ps1`, holding their real prices, logs and stable in that browser. Never drive, stop or reuse it. Everything below targets only the instance this skill started, which it tracks in `.verify/run/`.

All paths are relative to the repo root. Commands are PowerShell. From the Bash tool, wrap them as `powershell -NoProfile -ExecutionPolicy Bypass -File …`.

## Setup (once per machine)

```powershell
npm install --prefix .claude/skills/verify-atelier/scripts/drive
npx --prefix .claude/skills/verify-atelier/scripts/drive playwright install chromium
```

This pins `playwright@1.65.1` in `scripts/drive/package.json` and downloads its Chromium. Python 3.10+ (`python` or `py` on PATH) and Node 20+ are required, the same as `start.ps1`.

## Launch

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/verify-atelier/scripts/atelier.ps1 launch
```

- Rebuilds `front/dist` with `npm run build` when any file in `front/src` is newer than `dist/index.html`, the same rule as `start.ps1`. A type error fails the launch here.
- Starts the server on `127.0.0.1:8799` with `--static-dir front/dist`, logs to `.verify/run/server.log` and `.verify/run/server.err.log`.
- **Ready** is the line `READY http://127.0.0.1:8799/ pid=<n>`. It is printed only after `/api/health` answers `ok` and the pid that owns port 8799 descends from the process launch started.
- `-Port <n>` picks another port. Launch refuses a port that is already in use, and refuses to start twice.

There is no seed data. Every drive opens a fresh browser context, so `localStorage` (where all Élevage and Brisage data lives) starts empty, and each journey creates the state it needs through the UI.

## Doctor

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/verify-atelier/scripts/atelier.ps1 doctor
```

Read-only. `OK pid=… url=… server_file=… commit=…` means the instance is worth driving. Every `FAIL` line names what is wrong:

- no `.verify/run/server.pid`: nothing was launched by this skill;
- the recorded pid is dead, or port 8799 belongs to another pid;
- `/api/health` is not `ok`, or `server_file` is not this checkout's `server/src/dofus_ocr/server.py` (an instance from another clone);
- `/brisage` does not serve the app shell;
- `front/dist` is older than `front/src`: your change is not in the build. Run stop, then launch.

Run doctor before driving and whenever a journey fails in a way that looks environmental.

## Drive

```powershell
node .claude/skills/verify-atelier/scripts/drive/run.mjs <journey> [<journey> …] [--headed]
```

Journeys live in `scripts/drive/journeys/`, one per feature in the map:

| Journey | Feature file |
| --- | --- |
| `elevage-etable` | [features/elevage-etable.md](features/elevage-etable.md) |
| `elevage-couples` | [features/elevage-couples.md](features/elevage-couples.md) |
| `elevage-carburants` | [features/elevage-carburants.md](features/elevage-carburants.md) |
| `brisage-calculator` | [features/brisage-calculator.md](features/brisage-calculator.md) |
| `brisage-log` | [features/brisage-log.md](features/brisage-log.md) |
| `elevage-potions` | [features/elevage-potions.md](features/elevage-potions.md) |
| `brisage-craft-cost` | [features/brisage-craft-cost.md](features/brisage-craft-cost.md) |

Run all of them after a change to shared code (`components/common`, `item-search`, `price-input`, stores, routing):

```powershell
node .claude/skills/verify-atelier/scripts/drive/run.mjs elevage-etable elevage-couples elevage-carburants elevage-potions brisage-calculator brisage-log brisage-craft-cost
```

Each line of output is a user step. The run ends with `PASS` or `FAIL → <evidence dir>` per journey, and exits 1 if any failed.

A journey is a default-exported async function that receives `{ page, base, step, shot, aria, storage, save, check }`:

- `step(text)` logs a user action;
- `shot(label)` takes a full-page screenshot;
- `aria(label, locator?)` writes an ARIA snapshot of `main` or of the locator;
- `storage(key)` reads and parses a `localStorage` key;
- `save(file, value)` writes JSON next to the evidence;
- `check(condition, message)` fails the journey with `message`, or records it as `ok`.

Use roles and accessible names (`getByRole("tab", { name: "Étable" })`, `getByLabel("Noms des montures")`, `getByRole("table", { name: "Historique des brisages" })`), or element ids that the app's labels point at (`#shatterCoef`, `#brisageQuantity`). Never use positions or CSS classes. To add a journey, copy the closest one, add a row above, and add its feature file.

For a one-off exploration, `--headed` shows the browser. Open `trace.zip` with `npx --prefix .claude/skills/verify-atelier/scripts/drive playwright show-trace <path>` to replay any step.

## Evidence

Each journey writes `.verify/evidence/<UTC timestamp>-<journey>/`:

- `report.md`: every step, every `ok:` check, console errors, and `Result: PASS|FAIL`. On failure it adds the stack and `failure.png`.
- `NN-<label>.png`: screenshots after each meaningful action, not only the final screen.
- `<label>.aria.yml`: ARIA snapshots of the result tables.
- `<key>.json`: the `localStorage` value read back after a reload. This is the side-effect proof that data persisted.
- `trace.zip`: the Playwright trace.

Proof standards:

- Drive the real user path: typing, clicking, picking from the item search. Never call store setters or write `localStorage` to set up state.
- A screen alone is not proof of persistence. Reload, then check both the screen and the stored key.
- Brisage item search calls the live DofusDB API (`https://api.dofusdb.fr`). It is not mocked. If it is down, the journey fails at the search step. Report that as an environment failure, not as a pass or an app bug.
- When you report a verification, cite the evidence directory and quote the `ok:` lines that cover the behaviour you changed. If a sub-feature in the map was not driven, say so. A different path that passes does not cover it.

## Cleanup

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/verify-atelier/scripts/atelier.ps1 stop
```

Stops only the pids recorded in `.verify/run/` (the server and its Python launcher), then deletes `.verify/run/`. It never kills by process name and never touches port 8765. `.verify/evidence/` is kept. Delete old evidence folders by hand when they are no longer needed. Run stop after every session, including after a failed launch or journey.

## Telling an app bug from a journey bug

- The journey timed out on a locator: open the latest `NN-*.png` and `trace.zip`. If the UI shows the right thing under a different name, the journey is stale. Update it and its feature file in the same change. If the UI is wrong, it is a finding.
- The rendered value is right but the stored JSON is wrong, or the reverse: that is a real bug. Persistence is the point of the reload checks.
- Before changing a journey's expectations to match new output, confirm that the change was intended. The Élevage planner is a verified rewrite of dragodinde.fr's planner, so a changed pairing count there needs a reason, not a new number.
