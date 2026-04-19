# Goosalytics historical data strategy (2026-04-19)

Owner: Magoo
Goal: replace the broken assumption that free-tier SportsGameOdds can serve as the long-term historical backfill rail.
Proof required: repo evidence, cached artifacts, existing scripts, and build-safe planning.
Last updated: 2026-04-19 11:20 America/Toronto

## What changed
- Marco confirmed the current SportsGameOdds free plan does **not** support historical data access.
- That means SGO cannot be treated as the durable backfill source going forward.
- We should keep SGO for forward/live collection only, and split historical backfill onto separate rails.

## Evidence already in repo
- Existing historical cache inventory exists under `tmp/sgo-cache/`.
- Count observed in repo: **1,174 JSON cache files**.
- League distribution observed:
  - MLB: 310 files
  - NBA: 382 files
  - NHL: 382 files
  - NFL: 100 files
- Earliest cached windows observed begin at **2024-02-01**.
- Latest cached windows observed run into **2026-04-17**.
- There is already an SBR ingestion script in repo: `scripts/sbr-historical-scrape.mjs`.
- There is already an SGO historical/backfill script family in repo, but those depend on access assumptions that may no longer hold for fresh backfill.

## Durable architecture decision
Use a **split pipeline**:

1. **Historical backfill rails**
   - SportsbookReview archive/scrape where usable
   - SportsDataverse ecosystem where it exposes historical game/result coverage
   - Official/free league APIs for schedules, scores, rosters, and result truth
   - Existing repo cache (`tmp/sgo-cache`) as seed inventory, not as a promised renewable source

2. **Forward/live capture rails**
   - SportsGameOdds for current/forward snapshots only
   - The Odds API for current supplements where needed
   - Existing live sportsbook/public rails already in repo

3. **Normalization/storage**
   - One normalized downstream warehouse schema
   - Snapshot everything ourselves going forward so provider plan changes stop hurting us

## Best realistic stack by league

### NBA
Historical best bets:
- **SBR archive/scraper** for historical lines, open/close, and quarter-level score context
- **ESPN NBA scoreboard** for game/result truth and date mapping
- **Existing SGO cache** for whatever 2024-2026 historical market snapshots we already captured

Why:
- NBA is the clearest case where quarter data actually matters for grading and system analysis.
- Prior memory already noted SBR can provide quarter-by-quarter scores plus open/close lines.

### NHL
Historical best bets:
- **SBR archive/scraper** if NHL coverage remains usable for period scores and closing lines
- **NHL official API** for schedule/result truth
- **Existing SGO cache** for 2024-2026 captured market snapshots

Why:
- NHL official API is strong for truth data but weak for historical market context.
- Existing cache plus SBR-style archives are the practical bridge.

### MLB
Historical best bets:
- **SBR archive/scraper** for historical market context where available
- **MLB Stats API** for game/result truth
- **Existing SGO cache** for 2024-2026 market history already captured

Why:
- MLB truth data is easy; honest historical odds are the harder part.
- SBR is useful if coverage is clean enough, but MLB may still need extra validation because inning/F5 detail is thinner.

### NFL
Historical best bets:
- **SBR archive/scraper** for historical sides/totals/close context
- **SportsDataverse / nflverse-style ecosystem** for game/result truth and derived historical context
- **Existing SGO cache** for whatever current era market data we already captured

Why:
- NFL has the strongest public historical results ecosystem outside direct odds providers.
- Market history still likely comes from SBR/archive-style sources, not official APIs.

## Practical near-term plan

### Phase 1: salvage what we already own
- Inventory and normalize `tmp/sgo-cache/` into a durable warehouse table.
- Treat this as owned historical inventory.
- Do **not** assume it can be regenerated later from SGO free tier.

### Phase 2: seed old history from SBR
- Validate `scripts/sbr-historical-scrape.mjs` against current archive availability.
- Ingest historical game/odds rows into Supabase.
- Mark provenance clearly as `sbr-archive`.

### Phase 3: fill truth-data gaps by league
- NBA: ESPN
- NHL: NHL API
- MLB: MLB Stats API
- NFL: SportsDataverse/public result rails

### Phase 4: forward-proofing
- Keep hourly/daily live snapshot collection running on SGO + existing live rails.
- Store snapshots permanently so this exact problem dies after today.

## Blunt conclusions
- Free-tier SportsGameOdds is **not** a trustworthy long-term backfill plan anymore.
- The repo already contains enough evidence to justify a hybrid historical strategy instead of a provider monoculture.
- The fastest honest win is: **warehouse the existing SGO cache first**, then layer SBR and official truth feeds behind it.

## Recommended next execution order
1. Inventory + normalize the existing `tmp/sgo-cache` historical corpus
2. Run/verify SBR archive ingestion into Supabase
3. Build per-league join logic to align historical odds rows with official game IDs/results
4. Keep live snapshotting on current rails so history grows under our control

## Terminal status
- Partial
- Historical strategy is now clear, but warehouse ingestion and per-league execution still need to be done.
