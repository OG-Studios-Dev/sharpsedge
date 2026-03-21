# Cross-Sport Data Layer Foundation

## Purpose
Lay the first durable market-history rail under Goosalytics without pretending we already have a full warehouse.

This foundation archives aggregated odds-board snapshots so we can later power:
- opening vs latest/closing comparisons
- per-book line-history charts
- source freshness monitoring
- alerting for stale books, steam moves, and sharp-action heuristics
- sport-specific systems that need reproducible market context

## Current upstream sources
Today the snapshot layer sits on top of the existing aggregated board in `src/lib/odds-aggregator.ts`, which already merges books such as:
- Bovada
- Kambi-backed books
- PointsBet
- Pinnacle
- ESPN/DraftKings bridge
- The Odds API fallback/coverage source

The snapshot layer does not replace that aggregator. It archives what the aggregator currently knows.

## What gets stored now
Each capture writes three practical layers:
1. `market_snapshots` / snapshot header
   - one row per capture run
   - counts, trigger, source summary, freshness summary
2. `market_snapshot_events`
   - one row per game/event on the board
   - matchup identity, best prices, per-event freshness/source metadata
3. `market_snapshot_prices`
   - flattened per-book market rows
   - moneyline, spread, Q1/Q3 spread, and total prices with source timestamps

That is enough to start honest line-history and source-quality work later without designing a giant speculative schema now.

## Local + Supabase behavior
- Local/dev: snapshots append to `data/market-snapshots/YYYY-MM-DD.json`
- Read-only filesystem: falls back to in-memory persistence instead of crashing
- Supabase: if service-role env vars are present, the same normalized snapshot also writes to durable tables

## Near-term scope
Next sensible steps on top of this brick:
1. add scheduled capture cadence by sport/window
2. expose latest snapshot + opening snapshot readers
3. compute simple movement deltas and stale-source warnings
4. let system trackers query snapshot history instead of only current board state

## Current live cadence
- Vercel cron now captures `NHL,NBA,MLB` aggregated-board snapshots once per hour at minute 17 via `/api/odds/aggregated/snapshot?cron=true&sports=NHL,NBA,MLB`.
- This is intentionally conservative: enough to start building line-history without burning unnecessary upstream calls or pretending we have a full intraday warehouse.
- The route stays failure-safe:
  - cron-mode requests require `CRON_SECRET`; if it is missing, the route returns `503` instead of silently allowing public cron access
  - manual/dev captures still work via `?capture=true` or `POST`, so local testing does not depend on cron auth
  - read-only serverless filesystems fall back to in-memory persistence instead of crashing
  - missing Supabase service-role env skips durable writes rather than failing the request
  - responses include lightweight warnings when the board is empty, books are missing, sources are stale, or durable persistence failed

## Non-goals for this pass
- premium vendor integration
- full warehouse/star-schema modeling
- inferred closing lines from incomplete feeds
- opinionated movement or sharp-money logic before enough history exists
