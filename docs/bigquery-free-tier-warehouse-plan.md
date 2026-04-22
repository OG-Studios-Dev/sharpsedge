# BigQuery Free-Tier Warehouse Plan

## Status
Execution plan.

## Why this exists
Marco decided the warehouse lane should be physically separate from Supabase/Postgres.
That is the correct call.

Supabase should serve:
- OLTP
- operational product reads/writes
- curated serving tables for Ask Goose and similar user-facing features

BigQuery should serve:
- deep historical analytics
- warehouse-style joins
- training/evaluation datasets
- backtests
- heavy trend computations

For now, the constraint is simple:
**use BigQuery free tier only.**

This document defines how to do that without accidentally building an expensive science fair project.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** define a warehouse split that keeps serving in Supabase and analytics/ML in BigQuery free tier
- **Proof required:** concrete scope, data boundaries, ingestion plan, cost guardrails, first migration order
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Architectural split

## Supabase / Postgres responsibilities
Keep in Supabase:
- app data
- user/account/product state
- picks storage
- system qualifiers
- current operational tables
- curated Ask Goose serving tables
- small, indexed, request-time-safe summary tables

Do not use Supabase for:
- deep historical joins
- wide context-building view chains
- training data exploration
- long-horizon backtests
- freeform analytics over large historical fact sets

---

## BigQuery responsibilities
Move into BigQuery:
- historical odds warehouse facts
- historical result enrichment outputs
- contextual trend derivation layers
- model training/evaluation datasets
- large trend and slice exploration
- offline feature generation
- backtest result tables

BigQuery is the analytical brain.
Supabase is the serving nervous system.

---

## Free-tier operating rule
Treat BigQuery free tier as a real hard constraint, not a vague hope.

### Rule 1: small first
Do not start by shipping every raw table.
Start with the smallest useful warehouse slice.

### Rule 2: partition everything that grows
Any event-date or capture-time historical table should be partitioned.

### Rule 3: cluster by real query keys
Likely cluster keys:
- `league`
- `market_type`
- `team_name`
- `opponent_name`
- `canonical_game_id`

### Rule 4: never query raw wide history from product flows
All product-facing reads stay out of BigQuery request path for now.
BigQuery is batch/offline only.

### Rule 5: materialize lean outputs back to Supabase
If BigQuery computes something user-facing:
- materialize a lean serving result
- write only the serving shape back to Supabase
- do not proxy live user questions into BigQuery

---

## What to move first
Do not migrate by prestige. Migrate by pain.

## First migration target
### Historical betting warehouse chain
Move first:
- historical odds/result fact modeling
- favorite/underdog classification layers
- query-ready analytical history tables

Why first:
- this is the deepest warehouse-style logic
- it is the root of the Ask Goose timeout chain
- it is the least appropriate thing to keep evolving in serving Postgres

### Candidate BigQuery tables/views
Phase 1 logical targets:
- `bq_historical_market_sides_base`
- `bq_historical_market_results`
- `bq_historical_market_query_ready`
- `bq_team_market_summary`

These names are conceptual. Final naming can follow dataset rules.

---

## Second migration target
### Historical trends context logic
Move second:
- pregame record context
- schedule context
- previous-game context
- divisional / prime-time / segment layers

Why second:
- heavy window logic
- obvious warehouse behavior
- should not continue growing in Supabase

---

## Third migration target
### ML / training datasets
Move third:
- feature generation tables
- training audit tables
- backtest outputs
- evaluation slices

Why third:
- BigQuery is a much better fit
- this work is offline by nature
- it should not compete with product-serving DB load

---

## What stays in Supabase
These should stay in Supabase even after the split:
- `pick_history`
- `pick_slates`
- `goose_model_picks` operational persistence
- `system_qualifiers`
- `user_picks`
- product-facing route tables
- Ask Goose serving tables and summaries
- compact operational snapshot/summary tables

Important nuance:
The warehouse can feed these.
It should not replace them as request-time dependencies.

---

## First BigQuery dataset shape
Recommended initial dataset strategy:

## Dataset 1: `goosalytics_warehouse`
Purpose:
historical facts + enriched analytical tables

Example table families:
- `historical_market_sides_base`
- `historical_market_results`
- `historical_market_query_ready`
- `historical_team_context`
- `historical_team_market_summary`

## Dataset 2: `goosalytics_ml`
Purpose:
feature generation, evaluation, backtests, experiments

Example table families:
- `feature_rows`
- `training_labels`
- `backtest_runs`
- `evaluation_summaries`

If free-tier simplicity matters more than purity, start with one dataset and split later.

---

## Cost guardrails
This part matters or the free-tier idea becomes bullshit.

## Guardrail 1: date partitioning
For historical fact tables:
- partition by `event_date` or `captured_at`

## Guardrail 2: clustering
Cluster where query patterns are predictable:
- `league`
- `market_type`
- `team_name`
- `canonical_game_id`

## Guardrail 3: narrow schemas
Do not ship dozens of vanity fields into early warehouse tables.
Every column increases storage and scan waste.

## Guardrail 4: summary-first analytics
Common analytical outputs should become summary/materialized tables, not repeated scans of raw facts.

## Guardrail 5: bounded ingestion windows
Do not blindly load the entire universe daily.
Use:
- append for new history
- incremental updates for recent mutable windows
- occasional controlled rebuilds only when required

## Guardrail 6: usage logging
Track for every warehouse job:
- input rows
- output rows
- date range touched
- league touched
- whether it was full or incremental

## Guardrail 7: hard stop on live product coupling
No user-facing API should depend on live BigQuery execution in v1 of this split.
That is how free-tier discipline dies.

---

## Ingestion boundary

## From Supabase to BigQuery
Push or export only the analytical source sets needed for warehouse builds, such as:
- market snapshot history
- historical game/result rails
- qualifiers or labels needed for training/eval
- canonical game mappings

## From BigQuery back to Supabase
Write back only:
- Ask Goose serving rows
- Ask Goose summary tables
- Systems Goose summaries
- other lean serving tables required by product routes

This is the key discipline:
**BigQuery computes, Supabase serves.**

---

## First practical migration order

## Step 1
Freeze new warehouse complexity in Supabase.
No new deep analytical view chains.

## Step 2
Define the first export contract from Supabase into BigQuery for historical market/result facts.

## Step 3
Rebuild the historical betting warehouse chain in BigQuery using partitioned tables.

## Step 4
Compute Ask Goose source outputs in BigQuery.

## Step 5
Materialize only the Ask Goose serving shape back into Supabase.

## Step 6
Rewrite Ask Goose API to read only the Supabase serving tables.

## Step 7
Move additional trend/context and ML pipelines once the first loop is stable.

---

## Ask Goose implication
Ask Goose should not query BigQuery live.

Correct pattern:
1. BigQuery computes historical analytical outputs offline
2. a batch job writes lean serving rows + summaries to Supabase
3. `/api/ask-goose` reads only Supabase serving tables

That gives us:
- fast serving
- low product risk
- cleaner architecture
- free-tier discipline

---

## What not to do
Do not:
- mirror every Supabase table into BigQuery immediately
- let BigQuery become a request-time dependency for the app
- dump giant unpartitioned raw tables into BigQuery
- keep adding wide context columns without clear query demand
- pretend free tier is infinite

That path ends in cost creep and a messy dual-stack nobody trusts.

---

## Immediate next implementation artifact
The next concrete build artifact should be:

### BigQuery warehouse contract v1
It should define:
- exact first tables to create
- source export contract from Supabase
- partition/cluster rules
- incremental refresh logic
- write-back contract into Supabase Ask Goose serving tables

That is the bridge from architecture decision to real build work.

---

## Final call
Separate is right.

The clean split is:
- **Supabase:** app + serving
- **BigQuery:** warehouse + analytics + ML

And because we are staying on free tier for now, the discipline has to be ruthless:
- smallest useful tables first
- partitioned
- clustered
- batch only
- lean serving outputs back into Supabase

That is a sane architecture, and it gives us room to grow without poisoning the serving DB.