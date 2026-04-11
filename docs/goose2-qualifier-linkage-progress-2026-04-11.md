# Goose2 Qualifier Linkage Progress — 2026-04-11

## Purpose
Fix the weak qualifier-to-candidate matching that was choking the selective shadow scorer.

## What was wrong
The original Goose2 feature mapper only matched qualifiers using:
- exact `participant_name`
- exact `opponent_name`

That broke badly because a lot of Goose2 candidate rows, especially moneylines, do **not** populate `participant_name` cleanly. They often only carry the team in `side`.

So the scorer kept rejecting everything for:
- `no_linked_system_qualifier`

Even when the system qualifier and game clearly matched.

## What changed
### Matching logic upgraded
In `src/lib/goose2/feature-mappers.ts` I added stronger matching that now uses:
- `participant_name` **or** `side` as the participant key
- normalized team-name variants
- home / road / qualified team comparisons
- basic market compatibility checks
- total-market side matching (`over` / `under`)

### Backfill refresh job added
New script:
- `scripts/goose2-refresh-feature-qualifiers.mjs`
- command: `npm run goose2:refresh-feature-qualifiers`

This rewrites existing Goose2 feature rows so older candidates get the better qualifier linkage too.

## Proof
Refresh run results:
- feature rows updated: **848**
- rows with qualifiers after refresh: **28**

Example linked rows now exist for:
- NBA Chicago Bulls vs Washington Wizards
- qualifier count = **1**
- system = `nba-goose-system`

## Important reality check
The linkage fix helped, but it did **not** instantly create approved picks.

Why:
1. many shadow-scored candidates still belong to events with **no qualifier rows stored for that date**
2. some candidates still fail on the **confidence floor**, even when edge looks positive

So this was a real blocker, and it is now partially fixed, but it is **not** the only blocker.

## What we learned
### True
- Goose2 qualifier linkage was genuinely undercounting matches
- that is now materially better
- the pipeline can now refresh old feature rows with improved qualifier metadata

### Also true
- if there are no qualifier rows for a date, the scorer should reject everything
- that is still correct behavior
- we should not weaken the gate just to force picks

## Best next move
1. ensure the current-day qualifier systems are actually writing rows every day
2. then rerun selective shadow scoring on a day with live qualifiers present
3. after that, improve feature depth so some qualifier-backed candidates can clear confidence cleanly

## Bottom line
This was a real plumbing fix, not cosmetics.

Qualifier matching is now smarter and more honest.
But the next bottleneck is upstream coverage: the scorer needs fresh qualifier rows every day, otherwise the gate correctly stays shut.
