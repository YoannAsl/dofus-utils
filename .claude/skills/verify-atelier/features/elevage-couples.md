# Élevage › Couples

The user enters a father and a mother by 13-letter name and sees each possible birth, its colour, its chance and the baby's name to give. A second card builds the 13-letter name of any mount from its sex, colour and parents.

## Sub-features

- `couples-outcomes` fills `Père (mâle)` and `Mère (femelle)` and shows the table `Naissances possibles`, with one row per outcome.
- `couples-sex` warns `— ce n’est pas un mâle.` or `— ce n’est pas une femelle.` and shows no table when a parent has the wrong sex.
- `couples-rename` is the card `Renommer une monture`: the `Sexe` radios, colour select and parent selects build a name.
- `couples-codes` is the `Codes couleur des …s` disclosure, which lists the two-letter codes.

## How to get to it (user POV)

- `Élevage`, then the `Couples` tab.
- Open `/elevage?tab=couples`, with `&family=volkorne` or `&family=muldo` for other families.

## Driving it with Playwright

Preconditions:

- Baseline from the README.

- **Open.** Go to `/elevage?tab=couples&family=volkorne`. Tab `Couples` is selected.
- **Outcomes.** Fill `Père (mâle)` with `MPOPOSAUVSAUV` and `Mère (femelle)` with `FORORSAUVSAUV`. Table `Naissances possibles` has a header and 3 rows. It contains `POORPOPOOROR` (the successful baby's name suffix) and a 42 % chance.
- **Wrong sex.** Refill `Père (mâle)` with `FPOPOSAUVSAUV`. The text `ce n’est pas un mâle` appears and the table is gone.
- Journey: `elevage-couples` covers `couples-outcomes` and `couples-sex`. `couples-rename` and `couples-codes` are not driven yet.

## Gotchas

- Inputs upper-case what you type. Assert the rendered name, not what you typed.
- The 42 % / 29 % / 29 % split comes from `mounts.test.ts`. If it changes, the Vitest suite should change with it.
