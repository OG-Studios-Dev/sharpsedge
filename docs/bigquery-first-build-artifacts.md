# BigQuery First Build Artifacts

## Status
First implementation artifact set.

## Purpose
This is the first safe execution step after the BigQuery decision and contract docs.

It is deliberately **non-user-facing**.
It creates an export-only path so we can begin building the warehouse lane without risking:
- current user experience
- current picks/results behavior
- current request-time app performance

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** create the first safe BigQuery implementation artifact without touching live product behavior
- **Proof required:** export script artifact, no-mutation boundary, repo commit
- **Last updated:** 2026-04-22
- **Status:** Done

---

## What was added

### Script
- `scripts/bigquery-export-historical-market-sides-v1.mjs`

### What it does
- reads a bounded slice from Supabase
- exports newline-delimited JSON for future `bq load`
- targets the first warehouse table contract shape
- supports league/date-bounded export
- supports dry-run verification

### What it explicitly does **not** do
- does not mutate Supabase
- does not alter picks/results
- does not change app APIs
- does not switch Ask Goose routing
- does not put BigQuery in the request path

---

## Why this is the right first step

Because it is the safest one.

We are starting with an **offline export artifact**, not a live cutover.
That means:
- we can inspect row shape
- we can test league-bounded batches
- we can validate BigQuery load readiness
- we can prove parity before any serving-layer changes happen

This is exactly how we avoid harming users.

---

## Script usage

### Dry run
```bash
node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NHL --limit=5000 --dry-run
```

### Real export
```bash
node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NHL --limit=5000
```

### Date-bounded export
```bash
node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NBA --start=2025-10-01 --end=2026-04-30 --out=tmp/nba-market-sides.ndjson
```

---

## Expected output behavior

The script prints JSON summary including:
- `rowCount`
- `outPath`
- `mutatedSupabase: false`
- `touchedProductRoutes: false`
- suggested `bq load` next command

Those flags matter.
They are the proof that this step is offline-only.

---

## Current safety boundary

At this stage, BigQuery work remains in the following safe box:

### Allowed
- export historical data from Supabase
- load offline data into BigQuery
- build warehouse tables in BigQuery
- compare output and validate parity

### Not allowed yet
- changing picks generation logic
- changing live grading/result logic
- switching app request-time reads to BigQuery
- changing user-facing product behavior without parity proof

That boundary remains active.

---

## Recommended next safe step

After this artifact, the next safe move is:

1. create BigQuery DDL for `historical_market_sides_base`
2. run one dry-run export for NHL
3. run one actual NHL export artifact
4. load it into BigQuery
5. compare row counts and field parity

Still no user-facing changes.

---

## Final call
This first implementation artifact is safe because it is export-only.

It starts the warehouse lane without dragging current users, current picks, or current request-time performance into the blast radius.
That is exactly what Marco asked for.