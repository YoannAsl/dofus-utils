# Élevage › Potions de sexe

On each pairing of the Étable plan, the planner may add a `Potion mâle` or `Potion femelle` badge. It asks for the sex whose partners are already waiting in the stable, so that the baby does not stay without a partner. Colours that can pair with a capturable G1 never get one.

## Sub-features

- `potion-badge` is the `Potion mâle` / `Potion femelle` badge next to `Petit visé`, with the title `Dans l’étable, des partenaires attendent un mâle de cette couleur, pas une femelle` (or the reverse).
- `potion-persist` is the `potion` field (`"M"`, `"F"` or `null`) of each pairing in `localStorage["dofus-elevage"].<family>.plan.pairings`.
- `potion-none` means no badge when either sex of the baby would find a partner, or when no partner exists yet.

## How to get to it (user POV)

- `/elevage?family=volkorne`, tab `Étable`, enter the stable, then `Calculer les reproductions`.

## Driving it with Playwright

Preconditions:

- Baseline from the README. Works offline.

- **Waiting females.** On Volkorne, compute `FEMPOPOPOEMEM` ×3, `FPRPRAMROAMPO`, `MROROPOORPOIN`. The plan is one Prune-Roux pairing with the badge `Potion mâle`, and the stored pairing has `potion: "M"` after a reload.
- **Control.** Compute `FEMPOPOPOEMEM`, `MEMPOPOPOEMEM`, `FPRPRAMROAMPO`, `MROROPOORPOIN`. The plan still breeds a Prune-Roux, with no badge and `potion: null`.
- Journey: `elevage-potions` covers `potion-badge`, `potion-persist` and `potion-none`.

## Gotchas

- After a second `Calculer les reproductions`, the old plan stays on screen until the worker answers. Wait for `dofus-elevage.<family>.plan.read` to equal the number of names before checking, not for `Accouplement 1 fait`, which already exists.
- The potion rule is ours (`front/src/lib/mounts/potion.ts`), not dragodinde.fr's. The old site rule would show no badge on the first stable, because there is no Prune-Roux in it yet.
