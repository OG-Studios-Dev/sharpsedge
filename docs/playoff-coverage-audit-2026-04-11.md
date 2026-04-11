# Playoff Coverage Audit — 2026-04-11

## Purpose
Quick audit of current NBA and NHL data banking so we know what playoff data is being captured now, what is healthy, and what still needs cleanup.

## Summary
- **NBA:** current live Goose2 rails look structurally clean
- **NHL:** live rails are working, but legacy event identity duplicates still exist in Goose2 events
- **Decision log:** direct table counting/querying is currently flaky from PostgREST in this environment, so decision-log coverage is unverified from this audit

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
Legacy identity pollution is still present in NHL Goose2 events.

Found during audit:
- `source_event_id = NHL:TBL@MTL:na`
- legacy prefixed ids like:
  - `evt:nhl:nhl:nhl-tbl-mtl-na`
  - `evt:nhl:nhl:nhl-nsh-uta-2026-04-10t01`

This means NHL has historical duplicate / stale event identity rows mixed with cleaner current rows.

### Read
NHL is still worth running through playoffs, but it needs one cleanup pass so future training data does not inherit duplicate event identities.

## Risks / gaps
1. **Decision-log audit gap**
   - `goose_decision_log` table count/query returned blank-message errors through PostgREST during this audit
   - coverage not proven yet

2. **NHL legacy identity drift**
   - duplicate or stale event ids are still in `goose_market_events`
   - likely needs a targeted canonicalization / dedupe pass

3. **Snapshot depth is still shallow**
   - current ranges show recent coverage only, not deep season-long banking yet
   - this is fine for "from now through playoffs" but not enough for full offseason training alone

## Recommendation
### Keep running daily
- NBA snapshot ingest
- NHL snapshot ingest
- Goose2 shadow bootstrap
- Goose2 grading

### Next cleanup target
- NHL legacy event-id cleanup before too much more playoff data accumulates

### Next audit target
- investigate `goose_decision_log` access issue and prove whether decisions are being stored reliably

## Bottom line
- **NBA playoff banking:** healthy enough to keep running now
- **NHL playoff banking:** worth running now, but cleanup needed
- **Offseason training:** playoff collection helps a lot, but we will still need broader historical backfill for full model readiness
