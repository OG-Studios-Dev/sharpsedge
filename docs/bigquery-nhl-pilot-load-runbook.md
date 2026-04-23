# BigQuery NHL Pilot Load Runbook

## Status
Safe offline pilot runbook.

## Purpose
This runbook covers the first bounded BigQuery pilot load for Goosalytics using NHL historical market-side data.

It is intentionally scoped to a single league first so we can validate:
- export shape
- load behavior
- row counts
- field parity

without touching live user-facing app behavior.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** run the first safe NHL warehouse pilot batch into BigQuery
- **Proof required:** export artifact exists, BigQuery load succeeds, table row count matches expected pilot batch
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Safety boundary

This pilot is safe because it:
- exports data offline from Supabase
- loads data into BigQuery only
- does not mutate live product tables
- does not cut over any app route
- does not alter picks/results logic

Current users should experience nothing from this run.

---

## Prerequisites

### Supabase side
Required env in shell:
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### BigQuery side
- ADC authenticated
- active GCP project set
- BigQuery API enabled
- dataset exists: `goosalytics_warehouse`
- DDL already applied for `historical_market_sides_base`

---

## Files involved
- `scripts/bigquery-export-historical-market-sides-v1.mjs`
- `docs/bigquery-ddl-v1.sql`

---

## Step 1: dry-run the NHL export

```bash
node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NHL --limit=5000 --dry-run
```

### What to verify
- script succeeds
- `rowCount` is present
- `mutatedSupabase` is `false`
- `touchedProductRoutes` is `false`
- sample rows look structurally correct

If dry-run fails, stop and fix the export path first.

---

## Step 2: generate NHL NDJSON artifact

```bash
node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NHL --limit=5000 --out=tmp/nhl-historical-market-sides-v1.ndjson
```

### What to verify
- output file exists
- output file is non-empty
- printed `rowCount` looks reasonable

### Quick local checks
```bash
wc -l tmp/nhl-historical-market-sides-v1.ndjson
head -n 3 tmp/nhl-historical-market-sides-v1.ndjson
```

---

## Step 3: load pilot artifact into BigQuery

Set project first:
```bash
PROJECT_ID="your-real-project-id"
```

Run load:
```bash
bq load \
  --source_format=NEWLINE_DELIMITED_JSON \
  --replace=false \
  ${PROJECT_ID}:goosalytics_warehouse.historical_market_sides_base \
  tmp/nhl-historical-market-sides-v1.ndjson
```

### Notes
- use append mode first, not destructive replace
- if rerunning the same file repeatedly, clear test rows intentionally or load into a scratch table first

---

## Step 4: validate row counts in BigQuery

### Quick table count
```bash
bq query --use_legacy_sql=false '
select count(*) as row_count
from `'
"${PROJECT_ID}"'.goosalytics_warehouse.historical_market_sides_base
where league = "NHL"
'
```
```

If quoting gets annoying, use a temp SQL file instead.

### Cleaner version
```bash
cat >/tmp/check_nhl_bq_count.sql <<'SQL'
select count(*) as row_count
from `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_sides_base`
where league = 'NHL';
SQL
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/check_nhl_bq_count.sql 2>/dev/null || sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/check_nhl_bq_count.sql
bq query --use_legacy_sql=false < /tmp/check_nhl_bq_count.sql
```

### Compare with local artifact
```bash
wc -l tmp/nhl-historical-market-sides-v1.ndjson
```

Row count should match unless there are duplicate-key or malformed-row handling issues.

---

## Step 5: sanity-check loaded fields

Spot-check a few rows:

```bash
cat >/tmp/sample_nhl_bq_rows.sql <<'SQL'
select
  candidate_id,
  event_date,
  team_name,
  opponent_name,
  market_type,
  side,
  line,
  odds,
  result,
  profit_units
from `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_sides_base`
where league = 'NHL'
order by event_date desc
limit 10;
SQL
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/sample_nhl_bq_rows.sql 2>/dev/null || sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/sample_nhl_bq_rows.sql
bq query --use_legacy_sql=false < /tmp/sample_nhl_bq_rows.sql
```

### What to verify
- dates look sane
- teams/opponents are populated
- market fields are populated
- results/profit fields are shaped as expected

---

## Pilot success definition

The NHL pilot is **Done** only if all of the following are true:

1. dry-run export succeeds
2. NDJSON artifact is generated
3. BigQuery load succeeds
4. BigQuery row count matches artifact row count
5. sample loaded rows look structurally correct

If any of those fail, status is not Done.

---

## Common failure modes

### Missing env
Symptom:
- export script says missing Supabase env

Fix:
- load correct shell env first

### Permission/auth failure
Symptom:
- `bq load` or `bq query` denied

Fix:
- verify ADC
- verify active project
- verify BigQuery API
- verify dataset permissions

### Bad row shape
Symptom:
- load rejects NDJSON rows

Fix:
- inspect first few rows
- compare against DDL
- narrow export fields if needed

### Duplicate pilot reruns
Symptom:
- count exceeds expected artifact rows

Fix:
- use scratch table for repeated testing, or intentionally clear test scope before rerunning

---

## Recommended scratch-table variant for repeated testing

If rerunning a lot, create:
- `historical_market_sides_base_nhl_pilot`

Then validate there first before appending to the main table.

---

## Final call
This runbook is the right next step because it is real progress with controlled blast radius.

It gives us proof that the BigQuery lane can ingest Goosalytics historical data cleanly, while keeping current users, picks, and app performance completely out of harm’s way.