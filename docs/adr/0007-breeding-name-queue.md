# 7. Breeding name queue and clipboard

Status: accepted

## Context

While breeding, the player pastes mount names into Dofus: the parents into the stable search, then the baby's 13-letter name. The app keeps the next name in the clipboard.

## Decision

- The queue holds the name the app put in the clipboard: the male to look up, then the female, then the baby. Each paste in Dofus moves it on: female after male, next pairing after the baby. After the female, the name stays until the birth. Other pasted text changes nothing.
- Parents are queued in the plan's displayed order, skipping done pairings. F8 / Shift+F8 step forward or back; after a baby's name, or with nothing queued, F8 gives the male of the first pairing not done; the list wraps around.
- The first male is copied as soon as listening starts, before the player switches to Dofus.
- A name copied by hand in the page resumes the queue from it: a plan parent resumes its pairing (the clicked row and role when a parent serves in several), any other name counts as a baby's.
- The server writes the clipboard, because a background tab may not.
- Births and keys arrive by long polling: each request waits up to 20 s for the next event and keeps the watcher alive. A returning network request is not throttled in a background tab, unlike timers.
- Cards already read are remembered: a second reading of the same card (sex now readable) updates the first. A birth ticks its plan row once; if the second reading picks another row, the first is unticked.
