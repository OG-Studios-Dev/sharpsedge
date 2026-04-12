# SportsData.io fallback direction, 2026-04-12

## What we wired tonight

- Added a minimal shared helper at `src/lib/sportsdataio.ts`
- Supports base URL resolution for `NFL`, `NBA`, `MLB`, and `NHL`
- Uses the existing `SPORTSGAMEODDS_API_KEY` env var
- Exposes one low-level fetch helper only, no sport-specific overbuild yet

## Why this shape

We already have one-off SportsData.io notes for NFL, but broader fallback use needs one honest shared entrypoint first.
Tonight's goal was to make the direction real without pretending the whole adapter layer is done.

## Recommended fallback order by sport

### NBA
1. direct ESPN event id path
2. scoreboard/date-team matching
3. sportsdataverse ESPN adapter
4. SportsData.io only if we need a paid historical fallback or more stable team/date lookup

### MLB
1. direct MLB numeric game id
2. MLB StatsAPI schedule/date-team matching
3. SportsData.io if StatsAPI identity or historical lookup becomes flaky in broader backfills

### NHL
1. direct NHL numeric game id
2. NHL schedule matching
3. SportsData.io only if NHL id reconciliation or historical completion coverage needs a second paid source

### NFL
SportsData.io is already the most natural structured fallback for metadata and schedule expansion.

## Next minimal step

If we continue this direction, the next honest increment is:

- add one debug route or one sport-specific wrapper per sport
- keep it read-only
- use it only for identity/result fallback, not primary ingestion
- log source provenance clearly when fallback is used

## Guardrails

- Do not silently replace official/cheaper sources when they already work
- Do not guess IDs from fuzzy text alone
- Prefer fallback only after primary source failure or missing durable ids
- Persist fallback provenance in notes/payload whenever it affects grading
