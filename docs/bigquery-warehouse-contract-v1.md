# BigQuery Warehouse Contract v1

## Status
Implementation contract.

## Why this exists
The architecture decision is already made:
- **Supabase** remains the serving and operational database
- **BigQuery** becomes the separate warehouse lane for deep historical analytics and ML
- **Ask Goose** and similar user-facing surfaces must read serving tables in Supabase, not warehouse tables at request time

This document defines the first warehouse contract clearly enough to build.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** define the first production-usable BigQuery warehouse contract for Goosalytics
- **Proof required:** exact table set, partition/clustering rules, source export contract, refresh model, and Supabase write-back outputs
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Contract summary

### Supabase is for
- operational writes
- user-facing serving reads
- app/product state
- Ask Goose serving rows and summaries

### BigQuery is for
- deep historical fact modeling
- historical result enrichment
- contextual analytics
- model/training datasets
- offline summary generation

### Core operating rule
**BigQuery computes. Supabase serves.**

No live product request should depend on BigQuery in v1.

---

## Scope of v1

BigQuery warehouse v1 covers only the first useful analytical path:

1. historical market-side fact layer
2. graded/result enrichment layer
3. query-ready analytical layer for Ask Goose upstream generation
4. team-market summary layer
5. write-back of Ask Goose serving outputs into Supabase

This is intentionally narrow.
It is enough to solve the Ask Goose architecture problem without migrating the whole world at once.

---

## Physical layout

## Project
Dedicated Goosalytics warehouse GCP project preferred.

## Dataset
Primary dataset for v1:
- `goosalytics_warehouse`

Optional future dataset:
- `goosalytics_ml`

## Region
- `US`

Reason:
keep location simple and consistent during first build.

---

## First BigQuery tables

## 1. `goosalytics_warehouse.historical_market_sides_base`

### Purpose
The first stable historical fact layer for market-side data.

### Grain
One row per historical market side candidate suitable for downstream outcome analysis.

### Required columns
- `candidate_id STRING NOT NULL`
- `canonical_game_id STRING`
- `event_id STRING`
- `sport STRING NOT NULL`
- `league STRING NOT NULL`
- `season STRING`
- `event_date DATE NOT NULL`
- `home_team STRING NOT NULL`
- `away_team STRING NOT NULL`
- `team_name STRING NOT NULL`
- `opponent_name STRING NOT NULL`
- `team_role STRING`
- `market_type STRING NOT NULL`
- `submarket_type STRING`
- `market_family STRING`
- `market_scope STRING`
- `side STRING`
- `line NUMERIC`
- `odds NUMERIC`
- `sportsbook STRING`
- `is_home_team_bet BOOL`
- `is_away_team_bet BOOL`
- `is_total_over_bet BOOL`
- `is_total_under_bet BOOL`
- `source_loaded_at TIMESTAMP NOT NULL`
- `source_batch_id STRING NOT NULL`

### Partitioning
- `PARTITION BY event_date`

### Clustering
- `CLUSTER BY league, market_type, team_name, canonical_game_id`

### Notes
- Keep this lean.
- No vanity context columns here.
- This is the fact foundation, not the final narrative layer.

---

## 2. `goosalytics_warehouse.historical_market_results`

### Purpose
Attach grading and profitability outcomes to base historical market rows.

### Grain
One row per `candidate_id` with settled result context.

### Required columns
- `candidate_id STRING NOT NULL`
- `event_date DATE NOT NULL`
- `league STRING NOT NULL`
- `market_type STRING NOT NULL`
- `team_name STRING NOT NULL`
- `result STRING`
- `graded BOOL NOT NULL`
- `integrity_status STRING`
- `profit_units NUMERIC`
- `profit_dollars_10 NUMERIC`
- `roi_on_10_flat NUMERIC`
- `graded_at TIMESTAMP`
- `source_loaded_at TIMESTAMP NOT NULL`
- `source_batch_id STRING NOT NULL`

### Partitioning
- `PARTITION BY event_date`

### Clustering
- `CLUSTER BY league, market_type, team_name, graded`

### Notes
- This should remain a tight outcome layer.
- If extra integrity logic grows later, split it rather than bloating the table.

---

## 3. `goosalytics_warehouse.historical_market_query_ready`

### Purpose
Provide the first query-ready analytical layer for Ask Goose upstream generation.

### Grain
One row per historical market result slice with stable classification flags.

### Required columns
- all key identity fields needed from base layer
- all settlement fields needed from results layer
- `is_favorite BOOL`
- `is_underdog BOOL`
- `is_home_team_bet BOOL`
- `is_away_team_bet BOOL`
- `is_total_over_bet BOOL`
- `is_total_under_bet BOOL`
- `is_divisional_game BOOL`
- `is_prime_time BOOL`
- `segment_key STRING`
- `build_version STRING NOT NULL`
- `refreshed_at TIMESTAMP NOT NULL`

### Partitioning
- `PARTITION BY event_date`

### Clustering
- `CLUSTER BY league, team_name, opponent_name, market_type`

### Notes
- Include only stable, high-value classification/context fields.
- Do **not** drag the entire historical trends context chain into v1.
- If a context field is expensive or flaky, leave it out.

---

## 4. `goosalytics_warehouse.team_market_summary`

### Purpose
Precompute common analytical aggregates for Ask Goose and similar batch-fed serving surfaces.

### Grain
One row per:
- `league`
- `team_name`
- `market_type`
- `split_key`
- `window_key`

### Required columns
- `league STRING NOT NULL`
- `team_name STRING NOT NULL`
- `market_type STRING NOT NULL`
- `market_family STRING`
- `split_key STRING NOT NULL`
- `window_key STRING NOT NULL`
- `sample_size INT64 NOT NULL`
- `wins INT64 NOT NULL`
- `losses INT64 NOT NULL`
- `pushes INT64 NOT NULL`
- `hit_rate FLOAT64`
- `units NUMERIC`
- `roi FLOAT64`
- `last_event_date DATE`
- `build_version STRING NOT NULL`
- `refreshed_at TIMESTAMP NOT NULL`

### Partitioning
Preferred:
- `PARTITION BY DATE(refreshed_at)`

### Clustering
- `CLUSTER BY league, team_name, market_type, split_key`

### Notes
- This is a summary/materialized analytical output table.
- It exists to prevent repeated scans of raw history for common slices.

---

## Optional v1.1 tables
Do not block v1 on these, but they are natural next expansions:
- `matchup_summary`
- `market_bucket_summary`
- `recent_window_summary`
- `model_feature_rows`

---

## Supabase source export contract

## Purpose
Define exactly what source data moves from Supabase into BigQuery for v1.

## Initial source domains
Only export what supports the first four BigQuery tables:

### Domain A: historical market-side source rows
Expected logical source fields:
- candidate ids
- event ids
- canonical game ids if available
- sport / league / season
- event date
- home / away / team / opponent
- market type / family / scope
- side / line / odds
- sportsbook

### Domain B: result / grading source rows
Expected logical source fields:
- candidate id
- graded status
- result
- integrity status
- profitability metrics
- graded timestamps if available

### Domain C: stable classification inputs
Expected logical source fields:
- favorite / underdog classification inputs
- home / away flags
- minimal segment context
- any cheap stable context used in v1

## Explicit exclusions for v1
Do **not** export yet:
- user/account/product tables
- random operational app tables
- wide contextual view outputs with unclear demand
- every raw source table “just in case”

Rule:
If a field does not support one of the v1 BigQuery tables, leave it out.

---

## Export format contract

## Preferred pattern
Batch export from Supabase to newline-delimited JSON or parquet/csv, then load to BigQuery.

### v1 acceptable options
1. script-based extract from Supabase REST/SQL to local artifact, then `bq load`
2. script-based direct client insert/load into BigQuery
3. staged file in cloud storage later, if needed

### Recommendation
Start with the simplest scriptable pipeline that is easy to inspect and re-run.
Do not over-engineer orchestration on day one.

---

## Refresh model

## Frequency
Recommended v1 model:
- nightly full refresh for summary layers
- incremental append/update for recent mutable windows where needed
- league/date-bounded rebuilds during debugging or backfill

## Build order
1. export required source data from Supabase
2. load `historical_market_sides_base`
3. load `historical_market_results`
4. build `historical_market_query_ready`
5. build `team_market_summary`
6. generate Ask Goose serving outputs
7. write those outputs back to Supabase

## Build metadata to record
For every run, capture:
- `build_version`
- `source_batch_id`
- source row count
- output row count
- league/date scope
- started_at / finished_at
- success/failure state

If not stored in BigQuery tables yet, at minimum log it in the job output.

---

## Supabase write-back contract

## Purpose
Define exactly what BigQuery sends back into Supabase for serving.

## Required write-back tables in Supabase
- `ask_goose_serving_rows_v2`
- `ask_goose_summary_team_market_v2`
- `ask_goose_summary_matchup_v2`
- `ask_goose_summary_market_bucket_v2`

## v1 minimum requirement
At minimum, v1 must write back:
- `ask_goose_serving_rows_v2`
- `ask_goose_summary_team_market_v2`

The other summary tables can follow immediately after if source outputs are ready.

## Write-back rules
- replace or upsert by deterministic keys
- write only lean serving schema
- include `build_version` / `refreshed_at`
- no serving table should require a live BigQuery query

---

## Ask Goose serving contract linkage

The BigQuery warehouse contract exists to feed the serving contract already defined in:
- `docs/ask-goose-serving-contract-v2.md`

Meaning:
- BigQuery handles heavy history and summary computation
- Supabase stores the request-time serving rows and summaries
- `/api/ask-goose` queries Supabase only

That split is non-negotiable in v1.

---

## Cost and free-tier rules

## Rule 1: partition every growing fact table
Use `event_date` wherever possible.

## Rule 2: cluster by actual query keys
Do not cluster on vanity columns.

## Rule 3: keep schemas narrow
The first warehouse is not the final warehouse.
Start lean.

## Rule 4: do not rebuild the whole universe casually
Prefer incremental loads and bounded rebuilds.

## Rule 5: summaries are first-class outputs
If the same aggregate is repeatedly needed, materialize it.

## Rule 6: BigQuery is not a live app dependency
If a product route wants data, BigQuery must precompute it and hand it to Supabase first.

---

## Initial validation checklist

Warehouse v1 is not “done” until we can prove:

1. ADC works
2. BigQuery dataset exists
3. all v1 tables exist
4. at least one league successfully loads into `historical_market_sides_base`
5. `historical_market_results` joins correctly
6. `historical_market_query_ready` builds cleanly
7. `team_market_summary` produces real rows
8. `ask_goose_serving_rows_v2` is written back into Supabase
9. `/api/ask-goose` can answer from Supabase serving outputs only

No proof, no done.

---

## First implementation recommendation

The very next build work should be:

### Step 1
Create the BigQuery dataset and table DDLs for the four v1 tables.

### Step 2
Write the first extract/load script for one league, preferably NHL.

### Step 3
Generate and write back:
- `ask_goose_serving_rows_v2`
- `ask_goose_summary_team_market_v2`

### Step 4
Switch `/api/ask-goose` to the v2 serving path.

That gets us out of architecture theater and into a real working lane.

---

## Final call
BigQuery warehouse v1 should be boring on purpose.

It is not trying to be the full final analytics platform.
It is trying to do four things well:
1. hold historical market facts cleanly
2. compute outcomes and stable analytical slices cheaply
3. produce summary outputs without crushing the serving DB
4. feed Supabase serving tables so Ask Goose works like a product, not a SQL experiment

That is the right first version.