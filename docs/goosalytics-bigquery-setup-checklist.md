# Goosalytics BigQuery Setup Checklist

## Status
Execution checklist.

## Why this exists
We decided to split the architecture cleanly:
- **Supabase** = app DB + serving tables
- **BigQuery** = separate warehouse/analytics/ML lane

This checklist turns that decision into the exact setup path.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** stand up a free-tier-safe BigQuery warehouse lane for Goosalytics
- **Proof required:** auth path, project decision, dataset plan, guardrails, first build steps
- **Last updated:** 2026-04-22
- **Status:** Done

---

## 1. Authentication

Use native Google Cloud ADC flow.
Do **not** use blind remote shell installers.

### Recommended commands
```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### What this does
- logs local ADC credentials for SDK/client access
- sets the active GCP project
- makes quota/billing attribution explicit

### Proof to capture
```bash
gcloud auth application-default print-access-token >/dev/null && echo ADC_OK
gcloud config get-value project
```

Expected:
- `ADC_OK`
- correct GCP project id

---

## 2. Project choice

## Rule
Use a dedicated Goosalytics/Bridg3-owned GCP project.
Do **not** bury the warehouse under a personal sandbox if org-owned scope is available.

### Recommended naming
Project display name:
- `Goosalytics Warehouse`

Project id ideas:
- `goosalytics-warehouse`
- `goosalytics-bq`
- `bridg3-goosalytics-warehouse`

If the clean org-owned project id is unavailable, pick the nearest clean variant.

### Decision rule
- preferred: dedicated project for Goosalytics warehouse
- fallback: shared Bridg3 data project with clear dataset separation

---

## 3. Enable required services

### Minimum service
```bash
gcloud services enable bigquery.googleapis.com
```

Optional later, not needed on day one:
- BigQuery Data Transfer API
- Cloud Scheduler
- Cloud Run Jobs
- Secret Manager

Keep day one lean.

---

## 4. Dataset plan

Start small.

### Dataset 1
`goosalytics_warehouse`

Purpose:
- historical betting warehouse facts
- trend/context derived tables
- Ask Goose upstream analytical outputs

### Dataset 2
`goosalytics_ml`

Purpose:
- feature rows
- training/eval artifacts
- backtests
- experiment summaries

### Free-tier simplification option
If you want minimum setup overhead, start with only:
- `goosalytics_warehouse`

Then add `goosalytics_ml` later.

### Recommended location
Pick one location and keep it consistent.
Likely:
- `US`

Reason:
- simplest default for BigQuery ecosystem
- avoid location mismatches later

---

## 5. Create datasets

Example commands:

```bash
bq --location=US mk --dataset YOUR_PROJECT_ID:goosalytics_warehouse
bq --location=US mk --dataset YOUR_PROJECT_ID:goosalytics_ml
```

### Proof to capture
```bash
bq ls --project_id=YOUR_PROJECT_ID
```

Expected:
- dataset list includes `goosalytics_warehouse`
- and optionally `goosalytics_ml`

---

## 6. Free-tier guardrails

This is the important part.

## Guardrail 1: no live product queries into BigQuery
BigQuery is batch/offline only for now.
Ask Goose, app pages, and product APIs should not hit BigQuery directly.

## Guardrail 2: partition growing tables
Any historical fact-like table should be partitioned by:
- `event_date`, or
- `captured_at`

## Guardrail 3: cluster by query keys
Use clustering where it reflects real workloads:
- `league`
- `market_type`
- `team_name`
- `opponent_name`
- `canonical_game_id`

## Guardrail 4: narrow schemas first
No vanity fields.
Only load what supports:
- Ask Goose upstream analytics
- historical betting warehouse outputs
- training/eval priorities

## Guardrail 5: summary-first pattern
Repeated analytical outputs should become summary tables, not repeated scans of raw historical facts.

## Guardrail 6: no full-universe daily rebuilds unless proven necessary
Prefer:
- append for older immutable history
- incremental updates for recent periods
- targeted league/date rebuilds when needed

---

## 7. First tables to create

Do not start with everything.
Start with the minimum useful warehouse foundation.

## Phase 1 tables

### Table 1
`goosalytics_warehouse.historical_market_sides_base`

Purpose:
- core historical market-side fact rows
- canonical game id
- team/opponent
- market type/family
- side/line/odds
- event date

Partition:
- `event_date`

Cluster:
- `league`, `market_type`, `team_name`

---

### Table 2
`goosalytics_warehouse.historical_market_results`

Purpose:
- resolved graded outcomes
- profit units / flat-stake profitability
- result state
- integrity markers if needed

Partition:
- `event_date`

Cluster:
- `league`, `market_type`, `team_name`

---

### Table 3
`goosalytics_warehouse.historical_market_query_ready`

Purpose:
- query-ready analytical table for Ask Goose upstream batch generation
- favorite/underdog and home/away flags
- minimal stable context

Partition:
- `event_date`

Cluster:
- `league`, `team_name`, `opponent_name`, `market_type`

---

### Table 4
`goosalytics_warehouse.team_market_summary`

Purpose:
- summary/materialized layer for common aggregates
- sample size
- W/L/P
- units
- ROI
- window keys / split keys

Partition:
- if needed by refresh date

Cluster:
- `league`, `team_name`, `market_type`

---

## 8. First source export contract from Supabase

Only export what is needed.

### Initial source domains
- historical game/result rails
- market snapshot history needed for historical odds/result modeling
- canonical game mapping support
- qualifying labels needed for model evaluation later

### Do not export yet
- every app table
- user/account/product tables
- broad operational junk with no warehouse purpose

### Rule
If a source table does not support one of the first warehouse tables, leave it out.

---

## 9. Write-back contract into Supabase

BigQuery computes.
Supabase serves.

### First write-backs
- `ask_goose_serving_rows_v2`
- `ask_goose_summary_team_market_v2`
- `ask_goose_summary_matchup_v2`
- `ask_goose_summary_market_bucket_v2`

These stay in Supabase and become the only request-time dependency for Ask Goose.

---

## 10. First implementation order

### Step 1
Authenticate with ADC and lock the GCP project.

### Step 2
Create BigQuery dataset(s).

### Step 3
Define the first BigQuery warehouse contract for:
- `historical_market_sides_base`
- `historical_market_results`
- `historical_market_query_ready`
- `team_market_summary`

### Step 4
Build the first export/import job from Supabase source data into BigQuery.

### Step 5
Build batch output from BigQuery back into Supabase Ask Goose serving tables.

### Step 6
Rewrite Ask Goose API to read only Supabase v2 serving tables.

### Step 7
Validate with proof:
- BQ tables exist
- rows landed
- write-back succeeded
- Ask Goose answers from serving tables only

---

## 11. Exact commands Marco can use first

Replace `YOUR_PROJECT_ID` with the real project.

```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
gcloud services enable bigquery.googleapis.com
bq --location=US mk --dataset YOUR_PROJECT_ID:goosalytics_warehouse
bq --location=US mk --dataset YOUR_PROJECT_ID:goosalytics_ml
bq ls --project_id=YOUR_PROJECT_ID
```

### Minimal verification
```bash
gcloud auth application-default print-access-token >/dev/null && echo ADC_OK
gcloud config get-value project
bq ls --project_id=YOUR_PROJECT_ID
```

---

## 12. Decision defaults

If no one wants to bikeshed this to death, use these defaults:
- project: dedicated Goosalytics warehouse project
- region: `US`
- start with `goosalytics_warehouse`
- create `goosalytics_ml` now only if it costs no extra setup pain
- BigQuery batch only
- Supabase remains the serving DB

---

## Final call
This is the sane first setup:
- authenticate cleanly with ADC
- create a dedicated BigQuery project/dataset lane
- keep it on free-tier discipline
- move historical analytics there first
- materialize only lean serving outputs back to Supabase

That gives Goosalytics a real warehouse lane without turning the product DB into a science experiment.