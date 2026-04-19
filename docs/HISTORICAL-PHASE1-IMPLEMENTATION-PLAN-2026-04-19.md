# Historical Phase 1 Implementation Plan (2026-04-19)

Owner: Magoo  
Goal: warehouse the existing `tmp/sgo-cache` corpus into Goose2 cleanly, verifiably, and repeatably.  
Proof required: script-level execution path, table targets, verification queries/audits, and terminal artifact path.  
Last updated: 2026-04-19 13:05 America/Toronto

## Phase 1 objective

Take the historical SportsGameOdds cache we already possess and promote it from loose JSON files into a usable warehouse layer for Goose2.

This phase is **not** about buying new data.
This phase is **not** about grading everything yet.
This phase is **not** about model training yet.

This phase is about:
1. normalizing cache files deterministically
2. loading them into the existing Goose2 tables
3. enriching canonical league game IDs where possible
4. auditing completeness and failure points
5. leaving behind a repeatable rerun path

## What already exists in repo

### Existing cache corpus
- path: `tmp/sgo-cache`
- current inventory found in audit: **1,174 files**
- leagues present: MLB, NBA, NHL, NFL

### Existing normalization + ingest path
Already present and usable:
- `scripts/sgo-normalize-cache.mjs`
- `scripts/ingest-sgo-goose2-window.mjs`
- `scripts/lib/sgo-normalize-standalone.mjs`
- `scripts/sgo-run-backfill.mjs`
- `scripts/enrich-historical-league-ids.mjs`

### Existing warehouse tables
Already present in Supabase migration:
- `goose_market_events`
- `goose_market_candidates`
- `goose_market_results`
- `goose_feature_rows`
- `goose_decision_log`

Migration source:
- `supabase/migrations/20260409162000_goose2_phase1_core_tables.sql`

### Important existing behavior
Current ingest path already does the heavy lifting:
- normalize cache JSON to Goose2 event/candidate rows
- upsert into `goose_market_events`
- upsert into `goose_market_candidates`
- enrich historical league IDs for NHL/NBA/MLB/NFL after ingest
- keep historical source provenance as `sportsgameodds_historical`

That means Phase 1 is mostly an **operationalization + verification problem**, not a greenfield build.

## Recommended Phase 1 execution order

---

## Step 1: Preflight checks

### Goal
Confirm the environment and warehouse are healthy before touching the corpus.

### Checks
1. Confirm Supabase env exists locally
   - `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Confirm Goose2 tables exist
   - `goose_market_events`
   - `goose_market_candidates`

3. Confirm corpus inventory
   - count files in `tmp/sgo-cache`
   - count by league

### Proof required
- command output showing env-backed connectivity works
- table count output from warehouse audit or direct query
- cache inventory summary saved to terminal/log

### Suggested commands
- `node scripts/goose-production-coverage-audit.mjs`
- file count + league split from `tmp/sgo-cache`

---

## Step 2: Dry-run a small sample per league

### Goal
Prove the pipeline still works on representative windows before bulk ingest.

### Strategy
Run one sample cache file each for:
- NHL
- NBA
- MLB
- NFL

For each sample:
1. normalize with `scripts/sgo-normalize-cache.mjs`
2. ingest with `scripts/ingest-sgo-goose2-window.mjs`
3. enrich IDs with `scripts/enrich-historical-league-ids.mjs` if needed
4. inspect inserted counts

### Why
This catches:
- schema drift
- normalization issues
- candidate explosion problems
- ID enrichment failures
- bad assumptions before we run 1,174 files

### Proof required
For each league:
- normalized output summary
- inserted events/candidates summary
- enrichment summary if applicable

### Gate to proceed
Do **not** start bulk Phase 1 until all 4 sample leagues succeed or the failures are explicitly categorized.

---

## Step 3: Bulk ingest the existing corpus

### Goal
Load the full `tmp/sgo-cache` corpus into Goose2 warehouse tables.

### Preferred approach
Use the existing rolling script path instead of inventing a new one.

Primary runner:
- `scripts/sgo-run-backfill.mjs`

Why this path is best:
- it already chunks by league and window
- it already writes ledger entries
- it already normalizes and ingests each cache file
- it already runs league ID enrichment
- it already records status/error rows in `tmp/sgo-ledger/historical-backfill-ledger.json`

### Operating mode recommendation
Run in two passes:

#### Pass A — append / fill anything missing
- mode: default append behavior
- purpose: complete all not-yet-successful windows

#### Pass B — retry errors only
- mode: `retry-errors`
- purpose: rerun only failed windows after triage/fixes

### Logging
Use or extend:
- `scripts/run-sgo-historical-backfill.sh`
- log target: `logs/sgo-backfill/latest.log`
- ledger target: `tmp/sgo-ledger/historical-backfill-ledger.json`

### Proof required
- ledger row count
- successful chunk count by league
- failed chunk count by league
- total inserted event/candidate counts from audit after run

---

## Step 4: Post-ingest warehouse audit

### Goal
Verify that the data is actually in the warehouse and useful.

### Audit areas
1. total event count
2. total candidate count
3. candidate counts by sport
4. candidate counts by market type
5. candidate counts by book
6. event_date coverage by sport
7. proportion with canonical league game ids after enrichment
8. unresolved / failed enrichment buckets

### Existing audit helpers
Use:
- `scripts/goose-production-coverage-audit.mjs`
- `scripts/goose-warehouse-completeness-audit.mjs`
- `scripts/report-goose2-season-coverage.mjs`
- `scripts/goose2-phase1-audit.mjs`

### Minimum success criteria
- non-trivial growth in `goose_market_events`
- non-trivial growth in `goose_market_candidates`
- all 4 target leagues represented
- historical date coverage visible in warehouse, not just cache files
- ledger failures understood and categorized

### Output artifact
Save the final audit summary under `docs/` or `tmp/` with:
- totals
- league coverage
- unresolved gaps
- recommendation for Phase 2

---

## Step 5: Canonical ID quality review

### Goal
Decide whether the ingested corpus is good enough to move into grading/backfill work.

### Why this matters
Raw ingest is not enough.
If event identity is weak, training quality gets poisoned fast.

### Review focus
- NHL: confirm repaired/derived game IDs are now acceptable
- MLB: confirm `gamePk` mapping quality
- NBA: confirm ESPN ID mapping quality
- NFL: inspect unresolved / ambiguous rates carefully

### Success rule
If canonical ID quality is weak in a league, that league remains **warehouse-present but not training-ready**.

That is acceptable.
The point is to be honest.

---

## What this phase should NOT do

Do not expand scope into:
- feature generation for the full corpus
- grading everything immediately
- model retraining
- provider switching
- buying new historical rails
- trying to solve all NFL truth issues now

That’s Phase 2 and beyond.

## Deliverables for Phase 1

### Must-have deliverables
1. existing `tmp/sgo-cache` corpus loaded into Goose2 warehouse tables
2. ledger of processed windows with success/error states
3. post-ingest audit showing real counts and date coverage
4. documented unresolved identity/data-quality gaps by league

### Nice-to-have deliverables
1. one convenience script that audits the full historical corpus after ingest
2. one summary doc showing warehouse readiness by sport

## Recommended commands/run sequence

### Preflight
1. `node scripts/goose-production-coverage-audit.mjs`
2. inventory `tmp/sgo-cache`

### League sample tests
For one sample file per league:
1. `node scripts/sgo-normalize-cache.mjs <cachePath> <SPORT>`
2. `node scripts/ingest-sgo-goose2-window.mjs --sport <SPORT> --cache <cachePath>`
3. `node scripts/enrich-historical-league-ids.mjs <startDate> <endDate> <SPORT>` if needed

### Bulk run
- `node scripts/sgo-run-backfill.mjs 2024-02-01T00:00:00Z <NOW_ISO> NHL,MLB,NBA,NFL 7 250`

### Retry pass if needed
- rerun with error retry mode after triage

### Post-ingest verification
1. `node scripts/goose-production-coverage-audit.mjs`
2. `node scripts/goose-warehouse-completeness-audit.mjs`
3. `node scripts/report-goose2-season-coverage.mjs`
4. `node scripts/goose2-phase1-audit.mjs`

## Decision gates after Phase 1

### If Phase 1 succeeds
Move to Phase 2:
- join warehouse more tightly to official result truth
- begin selective grading/backfill by market family
- prepare training-ready extracts

### If Phase 1 partially succeeds
Still acceptable if:
- corpus is warehoused
- gaps are explicit
- weak leagues are quarantined instead of faked

### If Phase 1 fails badly
Likely causes:
- Supabase health
- schema drift
- ID enrichment failures
- candidate volume / timeout pressure

If that happens:
- fix pipeline integrity first
- do not jump ahead to model work

## Blunt recommendation

The right move is:
1. run a four-league sample proof
2. bulk warehouse the full corpus with the existing ledgered pipeline
3. audit hard
4. only then talk about training readiness

Trying to skip straight to ML before the historical corpus is warehoused cleanly would be dumb.

## Terminal status
- Done: Phase 1 plan defined with exact scripts, order, checks, and success gates
- Partial: execution of the plan still needs to be run
