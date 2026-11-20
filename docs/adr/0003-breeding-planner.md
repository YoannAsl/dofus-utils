# 3. Breeding planner: linear program over a short horizon

Status: accepted

## Context

The Élevage planner chooses which mounts to pair at each step to earn génétons (or, in success mode, to obtain every colour). It is a rewrite of dragodinde.fr's planner. Exact optimisation is out of reach, and a big stable must still plan in seconds in the browser.

## Decision

### Model (`lib/mounts/horizon.ts`)

- Stock is counted by colour and sex. An attempt (female `f` × male `m`) gives on average `p` babies of the target colour and returns `1 − p/2` mount of each parent colour, half of each sex. It earns `p · (2^(gen f − 1) + 2^(gen m − 1))` génétons: a mount of generation `g` is worth `2^(g − 1)`.
- G1 mounts are captured, within a budget per step. A G10 birth leaves the plan (end of lineage) and frees a capture.
- `p` is the share of births that hit the highest colour, assuming parents at level 40 each (80 combined).
- Sexes are tracked on the first steps (`sexedSteps`), then merged (`mergedSteps`). Stock left at the end of the horizon gets a terminal value, from an approximate LP (ALP: the best linear value function weighted by stock, read from the duals of the pairing LP) or from value iteration (each mount's best sequence of pairings).
- A mount taken or returned at step `from` counts in the stock of every later step. Stock rows are cumulative per colour and sex, then a row for the capture budget. Slack on a stock row is what is left over, valued at the horizon's end.
- Fractional attempts get a small bonus (`fracBonus`) that breaks ties during rounding.
- The horizon shrinks until the dense simplex tableau fits in memory.
- Success mode: génétons barely count. A birth of a missing colour pays, with diminishing returns ("link" rows: expected births ≥ reward pieces). Its terminal value is progress towards the missing colours, by value iteration.
- Only the first step's solution is used. It is rounded to whole attempts: the integer part, then a min-cost flow places the remaining mounts on the pairings with the best reduced cost.

### Rebalancing and diagnosis

- G1 purchases are reconsidered at a price above an ordinary capture: those still worth it are suggested.
- A diagnosis runs a maximum matching (flow) of the stock, then with extra G1, then with G2 to craft: it reports how many mounts have no partner and which G1 would give them one. Using a mount earns a lot, a bit more for higher generations. A crafted G2 needs attempts on both its G1 parents, split between sexes. Bicolour G2 made of two G1 can be crafted in two steps from captures.
- The suggested G1 merge what the LP values and what the diagnosis asks for, with their reasons.

### Solvers

- `simplex.ts` is a bounded-variable primal simplex on a dense tableau, maximising `c·x` under `A·x = b, 0 ≤ x ≤ u`. The starting basis must be unit (slack) columns with `b ≥ 0`. Entering column: devex, falling back to Bland's rule after 50 degenerate pivots. A small perturbation of `b` avoids cycling on degenerate vertices. The ratio test is Harris's two-pass: the largest step within a tolerance, then the largest pivot among rows that fit. Adding columns to a solved LP restarts from its optimal basis: the starting basis columns hold `B⁻¹`, so `B⁻¹·a` gives the new tableau column.
- `min-cost-flow.ts` uses successive shortest paths (queue-based Bellman-Ford) on a linked-list graph where edge `e`'s reverse is `e ^ 1`. A negative-cost cycle throws instead of stopping silently.
- The LP can take several seconds on a large stable, so it runs in a Web Worker. A new run cancels the previous one, whose promise rejects with `PlannerCancelled`.

### Turning the solution into pairings (`planner.ts`)

- Colours are numbered in the order of `data/mounts.ts`. That order matters: another order can break ties between equivalent plans differently.
- Attempts that earn the most génétons take mounts first. Among mounts of the chosen colours, prefer a couple whose likely child is the wanted colour.
- A mount's genetic colour is its most advanced parent's when that parent is above the mount itself (an Amande born of an Ébène-Indigo pairs like an Ébène-Indigo). On a tie, the colour with more partners wins.
- Genetic weights: 5 for the mount's colour, 3 for each parent; a solid colour up to G7 counts 4.5 times more.
- A G1 with parents of other colours aims worse at the right colour, and so does a Pourpre born of Pourpre × Orchidée: the plan leaves such impure mounts aside.
- "Rich" leftovers still pair: with a mount giving a recipe, a G1, or a mount whose colour has too many of that sex.
- Mounts at the end of a lineage (colours that parent no recipe) pair once more among themselves, by generation, before shattering.
- A sex potion is advised when the target colour, even, has three more mounts of one sex than the other.
- The plan lists pairings by the generation of the targeted baby, highest first: a success there pays the most.

## Consequences

Changing the colour order, `p`, or the rounding changes plans; compare with the site before changing behaviour.
