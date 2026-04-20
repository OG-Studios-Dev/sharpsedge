# Odds API historical DB plan

## Bottom line
The new Odds API should be treated as a **forward-built historical snapshot warehouse**, not a simplistic historical games table. The current Goosalytics rails already support this direction:

- `market_snapshots`
- `market_snapshot_events`
- `market_snapshot_prices`
- Goose2 shadow pipeline into:
  - `goose_market_events`
  - `goose_market_candidates`
  - `goose_feature_rows`
  - `goose_decision_logs`

## Goal
Build a trustworthy historical odds database that supports:
- opening / closing line tracking
- line movement and drift
- book disagreement and stale-book detection
- model vs market comparisons
- future training features for Goose2

## Warehouse design

### Layer 1: Raw ingestion
Keep immutable raw API responses for replay and audit.

Suggested tables:
- `odds_api_pull_runs`
  - `pull_id`
  - `pulled_at`
  - `trigger`
  - `sports`
  - `request_params`
  - `response_meta`
  - `rate_limit_usage`
  - `source_health`
- `odds_api_raw_payloads`
  - `pull_id`
  - `sport`
  - `book`
  - `payload_json`
  - `checksum`
  - `captured_at`

Why:
- replay normalization later
- audit bad transforms
- prove source quality

### Layer 2: Normalized snapshot store
This is the actual historical DB core.

Use existing tables:
- `market_snapshots`
- `market_snapshot_events`
- `market_snapshot_prices`

Add or enforce:
- indexes on `captured_at`, `sport`, `game_id`, `market_type`, `book`
- monthly partitioning if table growth warrants it
- `coverage_flags jsonb`
- `source_limited boolean`
- `canonical_game_id`
- `canonical_market_key`
- `capture_window_phase`

### Layer 3: Derived historical views
Query-friendly rails for product and analysis.

Suggested tables / materialized views:
- `canonical_games`
- `canonical_market_series`
- `market_opening_lines`
- `market_closing_lines`
- `market_line_movements`
- `market_source_coverage_daily`

## Identity rules
Non-negotiable:
- never rely on matchup string alone
- never rely on source event id alone
- preserve:
  - `source_event_id`
  - `source_event_id_kind`
  - `game_id`
  - `odds_api_event_id`
  - book
  - market type
  - participant/outcome key
  - `captured_at`

Current Goose2 logic already helps here:
- truthful source event resolution
- fallback matchup/time identity
- canonical event ids and candidate ids

## Collection cadence
Suggested production cadence:
- baseline pregame core markets: every 15 minutes
- final 2 hours before start: every 5 minutes
- final 30 minutes before start: every 1 minute for priority sports
- props: lower cadence unless monetized / explicitly needed

Priority order:
1. NBA
2. NHL
3. MLB
4. NFL in season

## Known source reality
Historical DB quality is limited by source behavior.
Observed issues already match this:
- partial market coverage by book
- some books only provide moneyline + total for certain events
- synthetic / fallback game ids in some cases
- stale source timestamps can happen

This means warehouse audits must distinguish:
- warehouse failure
- source-limited coverage

## Pilot scorecard
Run a 14-day forward pilot and score:

1. Coverage
- scheduled games captured % by sport
- by book
- by market type

2. Market completeness
- moneyline
- spread
- total
- quarter markets
- props

3. Freshness
- stale source rate
- median age at capture
- update cadence consistency

4. Identity stability
- `% rows with durable source ids`
- `% rows with synthetic game ids`
- duplicate cluster rate

5. Historical usefulness
Can we reconstruct:
- opener
- close
- max/min line
- time-to-close movement
- stale-book markers

## Recommendation on backfill
Do not do giant history first.

Do this instead:
1. one-month source test by sport
2. coverage / completeness review
3. if viable, expand backfill selectively

## One-month historical source test windows
Use first month from official start windows:

- MLB: `2024-03-20T00:00:00Z` → `2024-04-19T23:59:59Z`
- NFL: `2024-09-05T00:00:00Z` → `2024-10-04T23:59:59Z`
- NHL: `2024-10-04T00:00:00Z` → `2024-11-03T23:59:59Z`
- NBA: `2024-10-22T00:00:00Z` → `2024-11-21T23:59:59Z`

## Success criteria for this one-month test
The Odds API is viable for historical DB buildout if, for each sport:
- most scheduled games exist in source windows
- core markets appear reliably enough for useful opening/closing analysis
- source timestamps are not persistently stale
- event identity can be normalized without high duplicate ambiguity
- warehouse ingest can run without systemic timeout / corruption issues

If one or more sports fail those tests, use sport-specific strategy instead of forcing one source for all leagues.
