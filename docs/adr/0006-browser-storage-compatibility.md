# 6. Browser storage and backward compatibility

Status: accepted

## Context

Prices, the shatter log, stables and the theme live in `localStorage`. Users keep exported backups. Storage can be full or blocked.

## Decision

- Storage keys and formats stay stable: `dofus-rune-prices-v1`, `dofus-fm-item-prices-v1` and the others carried over from the first app, so saved data survives upgrades.
- Imports accept the first version's export format, a bare map of rune prices.
- Data read from storage or an imported file is validated; malformed entries are dropped.
- A stored plan from a version that did not record each pairing's target is discarded and recomputed.
- Storage access never throws: blocked storage reads as empty and drops writes, and the in-memory state keeps working for the session.
- The theme key is also read by an inline script in `index.html`, so the first paint already has the right theme.
- DofusDB data changes only with game updates, so queries are cached for the whole session and item types are fetched on demand.
