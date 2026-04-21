# Historical gold layer SQL Spec (2026-04-21)

Owner: Magoo  
Goal: define the exact SQL/view implementation spec for publishing the analyst-facing historical gold layer for warehouse queries, BI, training extracts, and future AI workflows.  
Proof required: final target schema, join rules, inclusion rules, default filtering rules, QA checks, and rollout guidance.  
Last updated: 2026-04-21 19:46 America/Toronto

## Objective

Publish one final historical analytics surface that joins:
- canonical game context
- normalized market-side rows
- settlement and profitability truth

This is the layer that downstream consumers should use.
Not raw snapshots.
Not half-normalized candidate tables.
Not ad hoc joins.

## Recommended implementation form

Build as a **view first**:
- `public.historical_betting_markets_gold_v1`

Then optionally add a filtered convenience view:
- `public.historical_betting_markets_gold_graded_v1`

Reason:
- full transparency during hardening
- clean separation between complete gold surface and default graded analytics surface

## Upstream dependencies

1. `dim_historical_games_v1`
2. `fact_historical_market_sides_v1`
3. `historical_market_results_enriched_v1`

## Non-negotiable rules

1. one row per `candidate_id`
2. no direct AI/query access to raw snapshot rails once gold exists
3. default business metrics should use graded rows only
4. unresolved context fields stay null until properly enriched
5. do not hide data quality status from downstream users

## Target schema

| field | type | required | source |
|---|---|---:|---|
| `candidate_id` | `text` | yes | result layer |
| `canonical_game_id` | `text` | no | result layer / game dim |
| `event_id` | `text` | yes | result layer |
| `sport` | `text` | yes | result layer |
| `league` | `text` | yes | result layer |
| `season` | `text` | yes | result layer |
| `event_date` | `date` | yes | result layer |
| `home_team` | `text` | yes | side fact |
| `away_team` | `text` | yes | side fact |
| `is_divisional` | `boolean` | no | game dim |
| `home_rest_days` | `integer` | no | game dim |
| `away_rest_days` | `integer` | no | game dim |
| `home_back_to_back` | `boolean` | no | game dim |
| `away_back_to_back` | `boolean` | no | game dim |
| `market_type` | `text` | yes | side fact |
| `submarket_type` | `text` | no | side fact |
| `market_family` | `text` | yes | result layer |
| `market_scope` | `text` | yes | result layer |
| `participant_type` | `text` | yes | result layer |
| `participant_id` | `text` | no | side fact |
| `participant_name` | `text` | no | side fact |
| `opponent_id` | `text` | no | side fact |
| `opponent_name` | `text` | no | side fact |
| `side` | `text` | yes | result layer |
| `line` | `numeric` | no | result layer |
| `odds` | `numeric` | yes | result layer |
| `sportsbook` | `text` | yes | result layer |
| `captured_at` | `timestamptz` | yes | side fact |
| `opening_flag` | `boolean` | yes | side fact |
| `closing_flag` | `boolean` | yes | result layer |
| `capture_window_phase` | `text` | no | side fact |
| `canonical_market_key` | `text` | no | side fact |
| `participant_key` | `text` | no | side fact |
| `bet_on_home_team` | `boolean` | no | side fact |
| `bet_on_away_team` | `boolean` | no | side fact |
| `team_role` | `text` | no | side fact |
| `opponent_role` | `text` | no | side fact |
| `favorite_team_id` | `text` | no | side fact |
| `underdog_team_id` | `text` | no | side fact |
| `result` | `text` | no | result layer |
| `graded` | `boolean` | yes | result layer |
| `integrity_status` | `text` | no | result layer |
| `settlement_ts` | `timestamptz` | no | result layer |
| `grade_source` | `text` | no | result layer |
| `grading_notes` | `text` | no | result layer |
| `actual_stat` | `numeric` | no | result layer |
| `actual_stat_text` | `text` | no | result layer |
| `closing_line` | `numeric` | no | result layer |
| `closing_odds` | `numeric` | no | result layer |
| `profit_units` | `numeric` | no | result layer |
| `profit_dollars_10` | `numeric` | no | result layer |
| `roi_on_10_flat` | `numeric` | no | result layer |
| `classification_status` | `text` | yes | side fact |
| `profit_status` | `text` | yes | result layer |
| `identity_confidence` | `numeric` | no | game dim |
| `source_event_ids` | `jsonb` | no | game dim |
| `source` | `text` | yes | side fact |
| `source_market_id` | `text` | no | side fact |
| `source_limited` | `boolean` | no | side fact |
| `coverage_flags` | `jsonb` | no | side fact |
| `build_version` | `text` | yes | hardcoded `'v1'` |

## Join design

### Base row spine
Use `historical_market_results_enriched_v1 hmr` as the row spine.

Why:
- it already preserves one row per candidate
- it already carries settlement/profit truth
- it is the closest thing to the final analytical row

### Attach side fact details
Join:
- `hmr.candidate_id = fms.candidate_id`

### Attach game dim details
Join:
- `hmr.canonical_game_id = dhg.canonical_game_id`

Fallback if canonical game is null:
- still keep the row
- context fields stay null
- quality flags remain visible

## Proposed SQL skeleton

```sql
create or replace view public.historical_betting_markets_gold_v1 as
select
  hmr.candidate_id,
  hmr.canonical_game_id,
  hmr.event_id,
  hmr.sport,
  hmr.league,
  hmr.season,
  hmr.event_date,
  fms.home_team,
  fms.away_team,
  dhg.is_divisional,
  dhg.home_rest_days,
  dhg.away_rest_days,
  dhg.home_back_to_back,
  dhg.away_back_to_back,
  fms.market_type,
  fms.submarket_type,
  hmr.market_family,
  hmr.market_scope,
  hmr.participant_type,
  fms.participant_id,
  fms.participant_name,
  fms.opponent_id,
  fms.opponent_name,
  hmr.side,
  hmr.line,
  hmr.odds,
  hmr.sportsbook,
  fms.captured_at,
  fms.opening_flag,
  hmr.closing_flag,
  fms.capture_window_phase,
  fms.canonical_market_key,
  fms.participant_key,
  fms.bet_on_home_team,
  fms.bet_on_away_team,
  fms.team_role,
  fms.opponent_role,
  fms.favorite_team_id,
  fms.underdog_team_id,
  hmr.result,
  hmr.graded,
  hmr.integrity_status,
  hmr.settlement_ts,
  hmr.grade_source,
  hmr.grading_notes,
  hmr.actual_stat,
  hmr.actual_stat_text,
  hmr.closing_line,
  hmr.closing_odds,
  hmr.profit_units,
  hmr.profit_dollars_10,
  hmr.roi_on_10_flat,
  fms.classification_status,
  hmr.profit_status,
  dhg.identity_confidence,
  dhg.source_event_ids,
  fms.source,
  fms.source_market_id,
  fms.source_limited,
  fms.coverage_flags,
  'v1'::text as build_version
from public.historical_market_results_enriched_v1 hmr
left join public.fact_historical_market_sides_v1 fms
  on fms.candidate_id = hmr.candidate_id
left join public.dim_historical_games_v1 dhg
  on dhg.canonical_game_id = hmr.canonical_game_id;
```

## Default graded convenience view

This is the view that should back most dashboards and AI summaries by default.

```sql
create or replace view public.historical_betting_markets_gold_graded_v1 as
select *
from public.historical_betting_markets_gold_v1
where graded = true
  and profit_status = 'graded';
```

## Default analytics rules

### Use `historical_betting_markets_gold_v1` when:
- auditing data quality
- inspecting unresolved rows
- checking mapping/classification gaps
- building QA dashboards

### Use `historical_betting_markets_gold_graded_v1` when:
- computing win rate
- computing ROI
- training simple supervised outcome models
- answering business/user-facing historical performance questions by default

## QA requirements

### Row uniqueness
```sql
select candidate_id, count(*)
from public.historical_betting_markets_gold_v1
group by 1
having count(*) > 1;
```
Must return zero rows.

### Graded subset consistency
```sql
select count(*)
from public.historical_betting_markets_gold_v1
where graded = true and profit_status <> 'graded';
```
Must be zero.

### Key null-rate dashboard
Check null rates for:
- `canonical_game_id`
- `market_family`
- `market_scope`
- `sportsbook`
- `result`
- `integrity_status`
- `profit_units` on graded rows
- `classification_status`

### Quality bucket breakdown
```sql
select
  league,
  classification_status,
  profit_status,
  count(*) as rows
from public.historical_betting_markets_gold_v1
group by 1,2,3
order by 1,2,3;
```

### Team-role performance sanity
For graded moneyline/spread rows with `classification_status = 'ok'`, verify that home/away tagging looks coherent.

### Context-field honesty check
For v1, expect many nulls in:
- `is_divisional`
- `home_rest_days`
- `away_rest_days`
- `home_back_to_back`
- `away_back_to_back`

That is acceptable.
Fake completeness is not.

## Rollout guidance

### Phase 1
Publish all four views:
1. `dim_historical_games_v1`
2. `fact_historical_market_sides_v1`
3. `historical_market_results_enriched_v1`
4. `historical_betting_markets_gold_v1`

### Phase 2
Add convenience graded view:
5. `historical_betting_markets_gold_graded_v1`

### Phase 3
Point downstream consumers to gold only:
- BI queries
- training extracts
- internal analytics endpoints
- future AI research/query workflows

## Blunt recommendation

Once this exists, nobody should be querying raw `market_snapshot_prices` or ad hoc joining candidates/results for historical analytics unless they are debugging the pipeline itself.

Gold should become the contract.

## Terminal status
- Done: exact SQL/view spec defined for the final historical gold layer and graded convenience surface
- Partial: live SQL implementation and downstream adoption still need execution
