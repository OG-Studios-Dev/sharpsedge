# Period Market Serving Contract — 2026-04-24

- Owner: Magoo
- Goal: define the first clean serving lane for named systems that require period/F5 lines.
- Proof source: `tmp/period-market-coverage-audit-2026-04-24.md`.

## What is confirmed

### NBA quarter spreads

- Historical candidate rows exist for `first_quarter_spread` and `third_quarter_spread`.
- 2024 Oct rows exist, but line is often null in normalized `line`.
- 2026 Apr rows include real lines for both 1Q/3Q spreads, e.g. Knicks/Hawks/Nuggets/Wolves 3Q spread lines.
- This is the clearest path for **Mattys 1Q Chase NBA**.

### MLB F5 totals

- Current 2026 rows exist for `first_five_total` with real lines.
- 2024 Apr exact `first_five_*` market keys were not present in `goose_market_candidates` bounded audit.
- Robbie's Ripper Fast 5 has F5 context in `data/systems-tracking.json`, so the next audit has to inspect system records/enrichment source fields, not just `goose_market_candidates.market_type`.

### NBA first-half

- Not confirmed in bounded audit. Treat as unavailable until proven.

## Serving table proposal

Create `ask_goose_period_market_layer_v1` or a view-backed equivalent with one row per period-market candidate:

- `league`
- `season`
- `event_id`
- `event_date`
- `home_team`
- `away_team`
- `market_type`
- `period_scope` (`first_quarter`, `third_quarter`, `first_half`, `first_five`, `first_period`)
- `market_family` (`spread`, `total`, `moneyline`)
- `team_name`
- `opponent_name`
- `team_role`
- `side`
- `line`
- `odds`
- `sportsbook`
- `raw_line_source` (`normalized_line`, `raw_payload.bookSpread`, `raw_payload.fairSpread`, `raw_payload.total`, etc.)
- `period_team_score`
- `period_opponent_score`
- `result`
- `graded`
- `integrity_status`
- `profit_units`
- `source_candidate_id`
- `source_snapshot_id`

## Grading rules

### Quarter spread

- Need exact quarter score for the target quarter.
- For away/home team spread:
  - margin = target team quarter points - opponent quarter points
  - adjusted = margin + line
  - adjusted > 0 = win
  - adjusted = 0 = push
  - adjusted < 0 = loss
- If line or quarter score missing: `result='ungradeable'`, `integrity_status='missing_period_line_or_score'`.

### F5 total

- Need first-five combined runs and F5 total line.
- Over/under grading follows standard total logic.
- If line or F5 score missing: `ungradeable` with explicit status.

## Named system mapping

### Mattys 1Q Chase NBA

Requirements:

- full-game closing spread to identify road favorite <= -5.5
- road team 1Q spread and 1Q score
- road team 3Q spread and 3Q score only if 1Q leg loses

Backtest output:

- attempts
- bet1 W/L/P
- bet2 triggered count
- sequence W/L/P
- net units using 1u then 2u chase
- missing line/score counts

### Robbie's Ripper Fast 5

Requirements:

- probable starters
- starter quality gap / mismatch rule
- F5 market availability and F5 side/total depending final rule
- first-five score

Current blocker:

- current 2026 F5 totals exist in candidate rows, but 2024 historical F5 keys were not found by exact market_type audit. Need source-key/enrichment audit.

## Next implementation step

1. Build a narrow NBA-only prototype for Mattys:
   - date range: 2026-04-01..2026-04-25 first, then 2024-10 sample
   - materialize first/third quarter spread rows
   - attempt line extraction from normalized `line` and raw payload fields
   - join ESPN period scores if available
   - produce a dry-run sequence ledger, no DB writes
2. Separately inspect Robbie/F5 source fields from `data/systems-tracking.json` and MLB enrichment code to locate the 2024 F5 historical path.

## Honest caveat

Do not tell Marco “quarter and half lines are all in the historical DB.” The correct statement is:

- NBA quarter spread rows are present; recent rows have real lines; older rows may need raw-payload line extraction.
- NBA half lines were not confirmed.
- MLB current F5 totals are present; historical 2024 F5 path needs deeper source-key audit.
