# Goose2 Offseason Backfill Plan

## Goal
Use the NBA and NHL offseason to backfill the full 2025/26 season into Goose2 so model training is ready before next season starts.

## Priority order
1. MLB live rail stays primary during current season
2. NBA and NHL live rails stay healthy and cron-driven
3. Offseason work focuses on historical NBA/NHL backfill and training set quality

## What must exist before model training
- Stable Goose2 event identity rules
- Stable candidate generation rules
- Reliable grading
- Sport-specific historical outcome rails
- Time-based train/validation/holdout splits

## Historical backfill targets
For each sport, ingest:
- full season schedule
- game metadata and final status
- final scores / boxscores
- market candidates from stored snapshots when available
- reconstructed market candidates from odds history when snapshots are unavailable
- graded results for every supported market family that can be resolved honestly

## Goose2 tables to populate
- `goose_market_events`
- `goose_market_candidates`
- `goose_market_results`
- `goose_feature_rows`
- optional replay into `goose_decision_log` for policy shadow analysis only

## NBA historical pipeline
### Inputs
- NBA schedule and final game states
- boxscores / team results
- available stored market snapshots
- any external odds history source we can access during offseason

### Backfill flow
1. pull historical schedule by date range
2. map each game to canonical Goose2 event identity
3. load available snapshot/odds rows for that game window
4. normalize into Goose2 candidate rows
5. grade candidates from final scores / boxscore facts
6. generate feature rows with versioned feature builders
7. store train-ready extracts by market type

### Initial NBA market scope
- moneyline
- spread
- total
- first quarter spread
- third quarter spread

## NHL historical pipeline
### Inputs
- NHL schedule and final game states
- final scores / overtime context
- available stored market snapshots
- Odds API event ids when available
- any offseason odds history source we can secure

### Backfill flow
1. pull full season schedule
2. reconcile upstream ids vs derived matchup-time ids
3. normalize market snapshots into Goose2 candidates
4. grade from official final results
5. generate versioned feature rows
6. prepare train-ready datasets by market family

### Initial NHL market scope
- moneyline
- puck line if history is available cleanly
- total
- selected player props only if the historical source is deep enough

## Data quality rules
- never fabricate odds or lines
- if odds history is incomplete, mark the gap and skip unsupported markets
- keep historical provenance in metadata
- separate reconstructed history from true stored snapshot history
- do not mix sandbox logic with production-grade datasets

## Dataset strategy
For each sport and market family:
- training set: early/mid season
- validation set: later season slice
- holdout set: final slice kept untouched until evaluation

Track:
- hit rate
- closing line value when possible
- calibration error
- edge bucket performance
- per-book stability
- per-market sample size

## Execution phases
### Phase 1
- keep live MLB/NBA/NHL Goose2 cron rails healthy
- finish any identity cleanup

### Phase 2
- audit what historical snapshots already exist in Supabase
- quantify gaps by sport, date, and market type

### Phase 3
- build NBA backfill scripts
- build NHL backfill scripts
- write outputs into Goose2 tables with provenance flags

### Phase 4
- generate training extracts
- run baseline ML experiments
- evaluate holdout performance
- promote only surviving markets into next-season shadow/production candidates

## Immediate next actions
1. keep MLB as the live proving ground
2. keep NBA/NHL cron ingest and grading active
3. audit Supabase historical snapshot coverage for NBA and NHL
4. choose the external odds-history source for offseason gap fill
5. then build the first backfill script sport-by-sport
