# Historical results and profitability SQL Spec (2026-04-21)

Owner: Magoo  
Goal: define the exact SQL/view implementation spec for attaching settlement truth and flat-stake profitability to historical market-side rows.  
Proof required: target schema, settlement rules, profitability formulas, exclusion rules, QA checks, and unresolved bucket handling.  
Last updated: 2026-04-21 19:45 America/Toronto

## Why this layer matters

This is the layer that turns market observations into performance truth.

If this is sloppy:
- win rate lies
- ROI lies
- model backtests lie
- AI summaries lie

So this layer needs to be conservative, boring, and explicit.

## Objective

Build a results/profit enrichment layer that attaches to `fact_historical_market_sides_v1` and produces:
- settlement status
- graded flag
- integrity visibility
- flat-stake unit profit
- flat $10 profit
- flat-stake ROI

## Recommended implementation form

Build as a **view first**:
- `public.historical_market_results_enriched_v1`

Reason:
- keeps formulas transparent
- easy to QA against source settlement rows
- can be promoted later once the rules are stable

## Primary sources

1. `fact_historical_market_sides_v1` as the base side fact
2. `goose_market_results` as the settlement truth rail

## Non-negotiable rules

1. one row per `candidate_id`
2. never fabricate a result where `goose_market_results` is unresolved
3. keep `integrity_status` visible, not buried
4. exclude bad settlement states from default profitability math
5. use one canonical flat-stake formula only

## Target schema

| field | type | required | source / derivation |
|---|---|---:|---|
| `candidate_id` | `text` | yes | from side fact |
| `canonical_game_id` | `text` | no | from side fact |
| `event_id` | `text` | yes | from side fact |
| `sport` | `text` | yes | from side fact |
| `league` | `text` | yes | from side fact |
| `season` | `text` | yes | from side fact |
| `event_date` | `date` | yes | from side fact |
| `market_family` | `text` | yes | from side fact |
| `market_scope` | `text` | yes | from side fact |
| `participant_type` | `text` | yes | from side fact |
| `side` | `text` | yes | from side fact |
| `line` | `numeric` | no | from side fact |
| `odds` | `numeric` | yes | from side fact |
| `sportsbook` | `text` | yes | from side fact |
| `closing_flag` | `boolean` | yes | from side fact |
| `result` | `text` | no | `goose_market_results.result` |
| `integrity_status` | `text` | no | `goose_market_results.integrity_status` |
| `settlement_ts` | `timestamptz` | no | `goose_market_results.settlement_ts` |
| `grade_source` | `text` | no | `goose_market_results.grade_source` |
| `grading_notes` | `text` | no | `goose_market_results.grading_notes` |
| `actual_stat` | `numeric` | no | `goose_market_results.actual_stat` |
| `actual_stat_text` | `text` | no | `goose_market_results.actual_stat_text` |
| `closing_line` | `numeric` | no | `goose_market_results.closing_line` |
| `closing_odds` | `numeric` | no | `goose_market_results.closing_odds`, fallback from side fact odds only if needed |
| `graded` | `boolean` | yes | derived |
| `profit_units` | `numeric` | no | derived |
| `profit_dollars_10` | `numeric` | no | derived |
| `roi_on_10_flat` | `numeric` | no | derived |
| `profit_status` | `text` | yes | derived quality bucket |
| `build_version` | `text` | yes | hardcoded `'v1'` |

## Settlement truth rules

### Raw result carry-forward
Carry raw result as-is from `goose_market_results.result`.

Known values in source constraint:
- `win`
- `loss`
- `push`
- `void`
- `pending`
- `ungradeable`
- `cancelled`

### Raw integrity carry-forward
Carry raw integrity status as-is from `goose_market_results.integrity_status`.

Known values:
- `pending`
- `ok`
- `postponed`
- `void`
- `unresolvable`
- `cancelled`
- `manual_review`

## `graded` derivation rule

For v1, `graded = true` only when both are true:

1. `result in ('win','loss','push','void','cancelled')`
2. `integrity_status in ('ok','void','cancelled')`

Everything else is `graded = false`.

### Why this is strict
Because `manual_review`, `unresolvable`, and `pending` should not silently leak into performance analytics.

## Profitability rules

Assume a flat **1 unit stake** and a flat **$10 stake**.

### Unit-profit formula

#### If `graded = false`
- `profit_units = null`

#### If `result = 'win'`
- if American odds > 0:
  - `profit_units = odds / 100.0`
- if American odds < 0:
  - `profit_units = 100.0 / abs(odds)`

#### If `result = 'loss'`
- `profit_units = -1.0`

#### If `result in ('push','void','cancelled')`
- `profit_units = 0.0`

#### Else
- `profit_units = null`

### Dollar-profit formula
- `profit_dollars_10 = profit_units * 10.0`

### ROI formula
- `roi_on_10_flat = profit_dollars_10 / 10.0`

Yes, that reduces to unit ROI. That’s fine. The point is making the reporting convention explicit.

## `profit_status` quality bucket

Use a transparent bucket so downstream analytics can filter cleanly.

### Rule
- if `graded = false` and `result is null`: `no_result_row`
- if `graded = false` and `integrity_status = 'pending'`: `pending`
- if `graded = false` and `integrity_status = 'manual_review'`: `manual_review`
- if `graded = false` and `integrity_status = 'unresolvable'`: `unresolvable`
- if `graded = false` and `integrity_status = 'postponed'`: `postponed`
- if `graded = true`: `graded`
- else: `excluded`

## Closing odds rule

Preferred source:
- `goose_market_results.closing_odds`

Fallback:
- use side-fact `odds` only if closing odds are null and the row is itself marked `closing_flag = true`

Otherwise leave null.

Do not pretend every row has a trustworthy close.

## Proposed SQL skeleton

```sql
create or replace view public.historical_market_results_enriched_v1 as
select
  fms.candidate_id,
  fms.canonical_game_id,
  fms.event_id,
  fms.sport,
  fms.league,
  fms.season,
  fms.event_date,
  fms.market_family,
  fms.market_scope,
  fms.participant_type,
  fms.side,
  fms.line,
  fms.odds,
  fms.sportsbook,
  fms.closing_flag,
  gmr.result,
  gmr.integrity_status,
  gmr.settlement_ts,
  gmr.grade_source,
  gmr.grading_notes,
  gmr.actual_stat,
  gmr.actual_stat_text,
  gmr.closing_line,
  coalesce(gmr.closing_odds, case when fms.closing_flag then fms.odds else null end) as closing_odds,
  case
    when gmr.result in ('win','loss','push','void','cancelled')
     and gmr.integrity_status in ('ok','void','cancelled')
    then true
    else false
  end as graded,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fms.odds > 0 then round((fms.odds / 100.0)::numeric, 4)
    when gmr.result = 'win' and fms.odds < 0 then round((100.0 / abs(fms.odds))::numeric, 4)
    when gmr.result = 'loss' then -1.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as profit_units,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fms.odds > 0 then round(((fms.odds / 100.0) * 10.0)::numeric, 4)
    when gmr.result = 'win' and fms.odds < 0 then round(((100.0 / abs(fms.odds)) * 10.0)::numeric, 4)
    when gmr.result = 'loss' then -10.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as profit_dollars_10,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fms.odds > 0 then round((fms.odds / 100.0)::numeric, 4)
    when gmr.result = 'win' and fms.odds < 0 then round((100.0 / abs(fms.odds))::numeric, 4)
    when gmr.result = 'loss' then -1.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as roi_on_10_flat,
  case
    when gmr.candidate_id is null then 'no_result_row'
    when gmr.integrity_status = 'pending' then 'pending'
    when gmr.integrity_status = 'manual_review' then 'manual_review'
    when gmr.integrity_status = 'unresolvable' then 'unresolvable'
    when gmr.integrity_status = 'postponed' then 'postponed'
    when gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled') then 'graded'
    else 'excluded'
  end as profit_status,
  'v1'::text as build_version
from public.fact_historical_market_sides_v1 fms
left join public.goose_market_results gmr
  on gmr.candidate_id = fms.candidate_id;
```

## QA requirements

### One row per candidate
```sql
select candidate_id, count(*)
from public.historical_market_results_enriched_v1
group by 1
having count(*) > 1;
```
Must return zero rows.

### Profit status breakdown
```sql
select
  league,
  profit_status,
  count(*) as rows
from public.historical_market_results_enriched_v1
group by 1,2
order by 1,2;
```

### Result / integrity cross-check
```sql
select
  result,
  integrity_status,
  count(*) as rows
from public.historical_market_results_enriched_v1
group by 1,2
order by 1,2;
```

### Profit null-rate sanity
```sql
select
  league,
  count(*) as rows,
  count(*) filter (where graded) as graded_rows,
  count(*) filter (where graded and profit_units is null) as graded_missing_profit_rows
from public.historical_market_results_enriched_v1
group by 1;
```

Graded rows should not be missing `profit_units` except for genuine odds edge cases that must be investigated.

### Dollar/unit consistency
```sql
select count(*)
from public.historical_market_results_enriched_v1
where graded
  and profit_units is not null
  and profit_dollars_10 is not null
  and round((profit_units * 10.0)::numeric, 4) <> round(profit_dollars_10::numeric, 4);
```
Must be zero.

## What is intentionally excluded from v1 default analytics

Do not include these in default win-rate / ROI reporting:
- `pending`
- `manual_review`
- `unresolvable`
- `postponed`
- rows with no result row yet

Keep them visible, but out of default performance claims.

## Recommended next step after this

Once this layer is implemented and QA-clean:
1. publish `historical_betting_markets_gold_v1`
2. make gold the only AI/query-facing surface for historical analytics
3. keep unresolved/non-graded states visible in QA dashboards, not in headline metrics

## Terminal status
- Done: exact SQL/view spec defined for historical results/profit enrichment
- Partial: gold-layer publication spec and live implementation still need execution
