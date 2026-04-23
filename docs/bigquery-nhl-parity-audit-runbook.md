# BigQuery NHL Parity Audit Runbook

## Status
Safe validation runbook.

## Purpose
This runbook proves whether the NHL pilot data loaded into BigQuery matches the exported source slice closely enough to trust the warehouse lane.

This is the guardrail step.
Before any future BigQuery-derived serving work, we need proof that the warehouse copy is not silently drifting from the source slice.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** verify NHL pilot parity between source export artifact and BigQuery-loaded rows
- **Proof required:** row-count parity, field-shape sanity, spot-check parity, mismatch summary if any
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Safety boundary

This audit is safe because it only:
- reads the NDJSON artifact
- reads BigQuery rows
- compares outputs
- does not mutate Supabase
- does not mutate BigQuery tables unless you intentionally do cleanup elsewhere
- does not change app behavior

---

## Preconditions

You should only run this after:
1. NHL export artifact exists
2. BigQuery pilot load completed
3. target table contains the NHL pilot rows

Expected artifact:
- `tmp/nhl-historical-market-sides-v1.ndjson`

Expected BigQuery table:
- `goosalytics_warehouse.historical_market_sides_base`

---

## What parity means here

For the first pilot, parity does **not** need to mean theoretical perfection across every future transform.
It does mean we need to prove:

1. row count is as expected
2. key identifying fields match shape expectations
3. core business fields survived load cleanly
4. no obvious truncation/null explosion/type corruption happened

If those fail, stop there. Do not talk yourself into it.

---

## Phase 1: artifact count

```bash
wc -l tmp/nhl-historical-market-sides-v1.ndjson
```

Save that number.
That is the expected pilot artifact row count.

---

## Phase 2: BigQuery count

```bash
PROJECT_ID="your-real-project-id"
cat >/tmp/check_nhl_bq_count.sql <<'SQL'
select count(*) as row_count
from `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_sides_base`
where league = 'NHL';
SQL
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/check_nhl_bq_count.sql 2>/dev/null || sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/check_nhl_bq_count.sql
bq query --use_legacy_sql=false < /tmp/check_nhl_bq_count.sql
```

### Pass condition
- BigQuery NHL row count matches artifact line count

### If it does not match
Possible causes:
- duplicate rerun append
- rejected malformed rows
- load targeting wrong table
- stale prior pilot rows mixed in

Do not continue casually if counts are off.

---

## Phase 3: null/shape sanity audit in BigQuery

```bash
cat >/tmp/nhl_bq_null_shape_audit.sql <<'SQL'
select
  count(*) as total_rows,
  countif(candidate_id is null) as null_candidate_id,
  countif(event_date is null) as null_event_date,
  countif(team_name is null) as null_team_name,
  countif(opponent_name is null) as null_opponent_name,
  countif(market_type is null) as null_market_type,
  countif(odds is null) as null_odds,
  countif(result is null) as null_result,
  countif(profit_units is null) as null_profit_units
from `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_sides_base`
where league = 'NHL';
SQL
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/nhl_bq_null_shape_audit.sql 2>/dev/null || sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/nhl_bq_null_shape_audit.sql
bq query --use_legacy_sql=false < /tmp/nhl_bq_null_shape_audit.sql
```

### What to look for
- catastrophic null spikes
- obviously broken mandatory fields
- odds/result/profit fields going unexpectedly blank

Some nulls may be legitimate, but a blowout pattern is a red flag.

---

## Phase 4: sample rows from artifact

```bash
head -n 5 tmp/nhl-historical-market-sides-v1.ndjson
```

Inspect fields like:
- `candidate_id`
- `event_date`
- `team_name`
- `opponent_name`
- `market_type`
- `side`
- `line`
- `odds`
- `result`
- `profit_units`

---

## Phase 5: comparable sample rows from BigQuery

```bash
cat >/tmp/sample_nhl_bq_rows_for_parity.sql <<'SQL'
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
order by event_date desc, candidate_id desc
limit 20;
SQL
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/sample_nhl_bq_rows_for_parity.sql 2>/dev/null || sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/sample_nhl_bq_rows_for_parity.sql
bq query --use_legacy_sql=false < /tmp/sample_nhl_bq_rows_for_parity.sql
```

### Pass condition
Random spot checks should look structurally consistent with the artifact.
We are looking for:
- same field meaning
- sane numeric values
- preserved identifiers
- no obvious date corruption

---

## Phase 6: optional candidate_id uniqueness check

```bash
cat >/tmp/nhl_bq_candidate_dup_check.sql <<'SQL'
select
  count(*) as total_rows,
  count(distinct candidate_id) as distinct_candidate_ids
from `YOUR_PROJECT_ID.goosalytics_warehouse.historical_market_sides_base`
where league = 'NHL';
SQL
sed -i '' "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/nhl_bq_candidate_dup_check.sql 2>/dev/null || sed -i "s/YOUR_PROJECT_ID/${PROJECT_ID}/g" /tmp/nhl_bq_candidate_dup_check.sql
bq query --use_legacy_sql=false < /tmp/nhl_bq_candidate_dup_check.sql
```

### What it tells you
- whether pilot reruns or source duplication may be muddying the table

If duplicates are expected, note why.
If not expected, investigate before claiming parity.

---

## Phase 7: parity verdict

### Mark **Done** only if:
- artifact row count matches BigQuery count
- null/shape audit shows no serious corruption
- sample row inspection looks structurally correct
- no unexplained duplicate explosion exists

### Mark **Partial** if:
- load works, but one or more mismatches need explanation

### Mark **Blocked** if:
- counts are materially off
- row shape is corrupted
- required fields are widely null
- wrong pilot scope got loaded

No proof, no done.

---

## Suggested terminal report format

```text
NHL parity audit
- Artifact rows: X
- BigQuery NHL rows: Y
- Count parity: PASS/FAIL
- Null/shape audit: PASS/FAIL
- Sample row parity: PASS/FAIL
- Candidate uniqueness: PASS/FAIL
- Verdict: Done / Partial / Blocked
- Notes: ...
```

---

## Final call
This audit is the line between “we loaded some shit into BigQuery” and “we actually trust the warehouse lane.”

Run it before any future serving-table build, and definitely before any cutover story.