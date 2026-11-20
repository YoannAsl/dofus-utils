# 2. Shatter (brisage) formula and rune values

Status: accepted

## Context

The Brisage calculator predicts the runes an item gives when shattered, with and without a focus. Community tools disagree on details, and DofusDB stores item effects in ways that need interpreting.

## Decision

- Each positive line weighs `3 × jet × characteristic weight × level / 200 + 1`. The weight times the coefficient turns into runes of that line, each worth `characteristic weight × rune value`.
- A focus keeps the focused line's weight and adds half the weight of every other positive line, all paid out in the focused rune. Maluses give nothing. Exotic lines add weight but cannot be focused, and have no roll bounds.
- We do not copy DoFocus, which divides each line by its own rune value before pooling. That inflates the focus on runes worth more than one point (Vi ×5, Ini ×10, Pod ×10).
- Expected rune counts are rounded to whole runes, as the game drops them.
- A characteristic shatters into its smallest rune. The other tiers only matter for prices.
- Rune value uses the current HDV prices. A rune without a price is reported as missing, never counted as zero kamas.
- The break-even coefficient is the one at which the best outcome exactly pays back the item cost, assuming runes scale linearly with the coefficient.
- DofusDB stores a malus as its own effect with a positive range (for example 157 "-# Force"). An effect that is not a rune effect is treated as negative.
- Items FM offers an item for a rune when the item rolls the rune's characteristic with a positive value.

## Consequences

Results match the in-game shatter for single focuses but can differ from DoFocus on high-value runes. Tests in `front/src/lib/calculations.test.ts` pin the formula.
