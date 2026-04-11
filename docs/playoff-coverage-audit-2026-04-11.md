# Playoff Coverage Audit — 2026-04-11

## Purpose
Quick audit of current NBA and NHL data banking so we know what playoff data is being captured now, what is healthy, and what still needs cleanup.

## Summary
- **NBA:** current live Goose2 rails look structurally clean
- **NHL:** live rails are working, and the legacy duplicate Goose2 event identities were cleaned up after this audit
- **Decision log:** storage is healthy, but sport-filtered reads must join through `goose_market_events` because `goose_decision_log` has no `sport` column

## NBA coverage
### Snapshot coverage
- `market_snapshot_events`: **12**
- `market_snapshot_prices`: **216**
- snapshot capture range: **2026-04-09T21:20:47Z → 2026-04-11T00:35:33Z**

### Goose2 coverage
- `goose_market_events`: **6**
- `goose_market_candidates`: **216**
- `goose_feature_rows`: **216**
- Goose event-date range: **2026-04-09 → 2026-04-10**

### Identity quality
- No current NBA rows found with `source_event_id` like `NBA:...:na`
- No current legacy `evt:nba:nba:nba-*` event ids found
- Current NBA event identity is in the clean derived matchup-time format when upstream ids are absent

### Read
NBA is in decent shape for playoff banking right now.

## NHL coverage
### Snapshot coverage
- `market_snapshot_events`: **18**
- `market_snapshot_prices`: **758**
- snapshot capture range: **2026-04-09T21:20:47Z → 2026-04-09T21:20:47Z**

### Goose2 coverage
- `goose_market_events`: **56**
- `goose_market_candidates`: **894**
- `goose_feature_rows`: **894**
- Goose event-date range: **2024-07-01 → 2026-04-12**

### Identity quality
This audit originally found legacy NHL identity pollution, including:
- `source_event_id = NHL:TBL@MTL:na`
- legacy prefixed ids like:
  - `evt:nhl:nhl:nhl-tbl-mtl-na`
  - `evt:nhl:nhl:nhl-nsh-uta-2026-04-10t01`

That cleanup has now been completed in Supabase.

### Read
NHL is worth running through playoffs, and the known duplicate legacy event identities from this audit have been removed.

## Risks / gaps
1. **Decision-log query gotcha**
   - `goose_decision_log` count/query failures in this audit were caused by filtering on a nonexistent `sport` column
   - coverage is proven, but reads must join through `goose_market_events`

2. **Snapshot depth is still shallow**
   - current ranges show recent coverage only, not deep season-long banking yet
   - this is fine for "from now through playoffs" but not enough for full offseason training alone

## Recommendation
### Keep running daily
- NBA snapshot ingest
- NHL snapshot ingest
- Goose2 shadow bootstrap
- Goose2 grading

### Next cleanup target
- keep an eye on new event-id drift, but the specific NHL legacy rows found here have already been cleaned

### Next audit target
- update future audit/debug scripts to query decision rows through `goose_market_events` joins

## Bottom line
- **NBA playoff banking:** healthy enough to keep running now
- **NHL playoff banking:** healthy enough to keep running now after cleanup
- **Offseason training:** playoff collection helps a lot, but we will still need broader historical backfill for full model readiness
