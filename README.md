# Dofus utils

Tools for Dofus: market prices and crafting costs, shattering, and breeding (Élevage).

- [`front/`](front/README.md): the web app (Vite, React, TypeScript).
- [`server/`](server/README.md): the local Python server. It serves the built front, reads screenshots with Windows OCR, receives ShareX captures, and watches the game while breeding.

## Run

```powershell
.\start.ps1
```

It rebuilds `front/dist` when the front sources changed, then starts the server on `http://127.0.0.1:8765/`. Extra arguments go to the server, for example `.\start.ps1 --port 9000`.

### Smithmagic overlay

```powershell
.\start.ps1 --overlay
```

Opens an always-on-top window that reads the Dofus forge and shows the critical success, neutral and failure odds of each rune (Rune, Pa, Ra) on the item. It needs `pywebview` in the Python that `start.ps1` runs; if it is missing, the server prints the exact `pip install` command. Keep Dofus in front and do not place the overlay over the forge window, since the reading uses screen pixels. Close it with the ✕ in its corner.

Design decisions are recorded in [`docs/adr/`](docs/adr). Code comments are banned; `node scripts/comments.mjs check` enforces it.
