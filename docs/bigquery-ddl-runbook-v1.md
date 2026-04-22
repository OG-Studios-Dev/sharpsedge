# BigQuery DDL Runbook v1

## Status
Safe offline runbook.

## Purpose
This runbook creates the first BigQuery warehouse tables.
By itself, it does not change Goosalytics user experience, live picks, live grading, or app request-time behavior.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** create the first BigQuery warehouse tables safely
- **Proof required:** dataset exists, DDL applied, tables listed
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Safety boundary

This step is safe because it only:
- creates BigQuery tables
- does not mutate Supabase
- does not alter app code paths
- does not cut over user-facing routes

That means current users should feel nothing from this step.

---

## Prerequisites

1. ADC is authenticated
2. active GCP project is set
3. BigQuery API is enabled
4. dataset exists:
- `goosalytics_warehouse`

---

## Files
- `docs/bigquery-ddl-v1.sql`

---

## Apply steps

Replace `YOUR_PROJECT_ID` in the SQL file with the real project id first.

### Option A: quick apply with temp rendered file
```bash
PROJECT_ID="your-real-project-id"
sed "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" docs/bigquery-ddl-v1.sql > /tmp/goosalytics-bigquery-ddl-v1.sql
bq query --use_legacy_sql=false < /tmp/goosalytics-bigquery-ddl-v1.sql
```

### Option B: inspect then apply
```bash
PROJECT_ID="your-real-project-id"
sed "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" docs/bigquery-ddl-v1.sql > /tmp/goosalytics-bigquery-ddl-v1.sql
cat /tmp/goosalytics-bigquery-ddl-v1.sql
bq query --use_legacy_sql=false < /tmp/goosalytics-bigquery-ddl-v1.sql
```

---

## Validate

```bash
bq ls ${PROJECT_ID}:goosalytics_warehouse
```

Expected tables:
- `historical_market_sides_base`
- `historical_market_results`
- `historical_market_query_ready`
- `team_market_summary`

---

## Terminal proof checklist

You are not done until you have:
- successful `bq query` output
- successful `bq ls` output
- table names visible in dataset

No proof, no done.

---

## Next safe step after this

After tables exist:
1. run one NHL export artifact from Supabase
2. load NDJSON into `historical_market_sides_base`
3. verify row counts
4. compare field parity

Still no user-facing cutover.

---

## Final call
This runbook is safe because it creates warehouse tables only.
It does not put BigQuery into the live app path, so it should not affect current users, app pick performance, or result integrity.