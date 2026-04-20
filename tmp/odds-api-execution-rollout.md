# Odds API historical warehouse execution rollout

## Objective
Turn the current snapshot rails into a production-grade historical odds warehouse for NBA, NHL, and MLB first, with NFL held out pending separate validation.

## Reality check from one-month test
- NBA: strong, viable now
- NHL: strong, viable now
- MLB: viable, but thinner spread coverage than totals / moneyline
- NFL: not proven from current source path, do not include in phase 1 historical buildout

## Phase 1 scope
Launch historical warehouse buildout for:
- NBA
- NHL
- MLB

Explicitly defer:
- NFL deep history
- full props parity across every sport/book
- live betting warehouse

## Required schema upgrades
Current tables are a decent base:
- `market_snapshots`
- `market_snapshot_events`
- `market_snapshot_prices`

Additions recommended immediately:

### 1. `market_snapshot_events`
Add:
- `canonical_game_id text`
- `source_event_id_kind text`
- `real_game_id text`
- `snapshot_game_id text`
- `coverage_flags jsonb not null default '{}'::jsonb`
- `source_limited boolean not null default false`

Purpose:
- separate canonical identity from source identity
- preserve truth about whether the source itself lacked a market

### 2. `market_snapshot_prices`
Add:
- `canonical_game_id text`
- `canonical_market_key text`
- `participant_key text`
- `capture_window_phase text`
- `is_opening_candidate boolean not null default false`
- `is_closing_candidate boolean not null default false`
- `coverage_flags jsonb not null default '{}'::jsonb`
- `source_limited boolean not null default false`

Purpose:
- easier derived opening / closing / movement queries
- easier market-series grouping

### 3. new table: `canonical_games`
Columns:
- `canonical_game_id text primary key`
- `sport text not null`
- `league text not null`
- `event_date date not null`
- `scheduled_start timestamptz`
- `home_team text`
- `away_team text`
- `home_team_key text`
- `away_team_key text`
- `source_event_ids jsonb not null default '[]'::jsonb`
- `identity_confidence numeric`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### 4. new derived table or materialized view: `market_line_movements`
Columns:
- `canonical_game_id`
- `sport`
- `book`
- `market_type`
- `canonical_market_key`
- `opening_captured_at`
- `opening_line`
- `opening_odds`
- `closing_captured_at`
- `closing_line`
- `closing_odds`
- `line_delta`
- `odds_delta`
- `snapshot_count`
- `stale_source_hits`

## Indexes to add

### `market_snapshot_events`
- `(canonical_game_id)`
- `(sport, canonical_game_id, captured_at desc)`
- `(sport, commence_time, source_limited)`

### `market_snapshot_prices`
- `(canonical_game_id, market_type, book, captured_at desc)`
- `(canonical_market_key, captured_at desc)`
- `(sport, book, market_type, captured_at desc)`
- `(capture_window_phase, sport, captured_at desc)`
- partial index where `is_closing_candidate = true`
- partial index where `is_opening_candidate = true`

### `canonical_games`
- `(sport, event_date)`
- `(scheduled_start)`

## Derived views to build

### `vw_market_openers`
First captured row per:
- canonical game
- book
- market type
- participant/outcome key

### `vw_market_closers`
Last captured pregame row per:
- canonical game
- book
- market type
- participant/outcome key

### `vw_market_source_coverage_daily`
By date / sport / book:
- games seen
- markets present
- stale rates
- source-limited rates

### `vw_market_consensus_closing`
Consensus close by market from books with acceptable freshness.

## Capture cadence

### NBA / NHL
- baseline: every 15 minutes
- 2h pregame: every 5 minutes
- 30m pregame: every 1 minute on priority slates

### MLB
- baseline: every 15 minutes
- 2h pregame: every 5 minutes
- no need to over-index on ultra-dense late capture until ROI is proven

### NFL
Do not productionize into historical DB cadence yet.
Investigate source path first.

## Canonical identity rules
For each event:
1. prefer durable league/native source event id when trustworthy
2. fall back to odds event id when stable and non-synthetic
3. only then use matchup + commence time derived identity

Canonical game identity should not be book-specific.
Book-specific rows belong at price level only.

## Source-limited handling
Do not treat all missing markets as warehouse defects.

Examples:
- Bovada MLB event with only moneyline + total = `source_limited`, not broken
- isolated Kambi NHL moneyline-only event = `source_limited`, not platform failure

Warehouse audits should fail only on:
- missing snapshot ingestion
- systemic missing core markets across many events
- stale pending / missing terminal settlement problems
- duplicate identity corruption

## Phase 1 implementation order

### Step 1. Schema migration
Create migration that:
- adds canonical / coverage columns
- adds indexes
- creates `canonical_games`

### Step 2. Normalization upgrade
Update snapshot normalization and write path so:
- each event writes `canonical_game_id`
- each price writes `canonical_market_key`
- source-limited conditions are explicitly flagged

### Step 3. Derived views
Build:
- openers
- closers
- line movement
- daily source coverage

### Step 4. Forward pilot cadence
Run 14-day production pilot for NBA/NHL/MLB.
Track:
- coverage
- source freshness
- stale-book rates
- identity stability
- derived opener/close usefulness

### Step 5. Selective backfill expansion
Only after forward pilot proof:
- expand NBA/NHL/MLB historical windows
- keep NFL separate until independently proven

## One-month source test conclusion
Use existing tested windows as baseline proof:
- MLB: viable
- NBA: strong
- NHL: strong
- NFL: not validated

## Delivery recommendation to Marco
Approve phase 1 warehouse rollout for NBA/NHL/MLB immediately.
Treat NFL as a separate diagnosis track.
