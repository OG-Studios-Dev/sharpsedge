# Historical dim_historical_games SQL Spec (2026-04-21)

Owner: Magoo  
Goal: define the exact SQL/view implementation spec for `dim_historical_games` so engineering can build the first gold-layer dependency without ambiguity.  
Proof required: target schema, source joins, derivation rules, QA checks, and explicit deferred items.  
Last updated: 2026-04-21 19:37 America/Toronto

## Why this is first

If `dim_historical_games` is loose, every downstream market-side classification gets weaker:
- season tagging drifts
- home/away logic gets brittle
- rest-day math becomes wrong
- divisional flags become fake confidence

So this layer goes first.

## Objective

Create one canonical game row per historical event with:
- stable identity
- canonical sport/league/date/team fields
- season and season_year derivation
- QA-visible identity confidence
- explicit placeholders for future schedule-context enrichment

## Recommended implementation form

Build as a **view first**:
- `public.dim_historical_games_v1`

Reason:
- faster iteration
- easier QA
- no storage duplication yet
- lets us harden derivation logic before materializing

Once verified, we can decide whether to:
- keep it as a view
- promote to materialized view
- promote to persisted dimension table

## Primary sources

### Source priority
1. `canonical_games` as the canonical event spine
2. `goose_market_events` as fallback/support for event metadata and team ids
3. later enrichment rails for context fields

### Join rule
Join `canonical_games` to `goose_market_events` on the best available identity path:
- preferred: `goose_market_events.event_id = canonical_games.canonical_game_id`
- fallback: `goose_market_events.source_event_id` or `odds_api_event_id` linkage via `canonical_games.source_event_ids`
- if those are not yet perfectly aligned, create a staging CTE that picks the best single supporting `goose_market_events` row per `canonical_game_id`

Bluntly: do **not** let this dimension duplicate rows because multiple source rows matched the same game.

## Target schema

| field | type | required | source / derivation |
|---|---|---:|---|
| `canonical_game_id` | `text` | yes | `canonical_games.canonical_game_id` |
| `sport` | `text` | yes | `canonical_games.sport` |
| `league` | `text` | yes | `canonical_games.league` |
| `season` | `text` | yes | derived from `league` + `event_date` |
| `season_year` | `integer` | yes | derived from `league` + `event_date` |
| `event_date` | `date` | yes | `canonical_games.event_date` |
| `scheduled_start` | `timestamptz` | no | `canonical_games.scheduled_start`, fallback `goose_market_events.commence_time` |
| `home_team` | `text` | yes | `canonical_games.home_team` |
| `away_team` | `text` | yes | `canonical_games.away_team` |
| `home_team_key` | `text` | no | `canonical_games.home_team_key` |
| `away_team_key` | `text` | no | `canonical_games.away_team_key` |
| `home_team_id` | `text` | no | support row from `goose_market_events.home_team_id` |
| `away_team_id` | `text` | no | support row from `goose_market_events.away_team_id` |
| `source_event_ids` | `jsonb` | yes | `canonical_games.source_event_ids` |
| `identity_confidence` | `numeric` | no | `canonical_games.identity_confidence` |
| `is_divisional` | `boolean` | no | null for v1, later enrichment |
| `home_rest_days` | `integer` | no | null for v1, later enrichment |
| `away_rest_days` | `integer` | no | null for v1, later enrichment |
| `home_back_to_back` | `boolean` | no | null for v1, later enrichment |
| `away_back_to_back` | `boolean` | no | null for v1, later enrichment |
| `build_version` | `text` | yes | hardcoded `'v1'` |

## Season derivation rules

Do **not** use raw calendar year for all sports. That would be sloppy and wrong.

### MLB
Rule:
- `season_year = extract(year from event_date)`
- `season = season_year::text`

### NFL
Rule:
- if `event_date` month >= 8, `season_year = year(event_date)`
- else `season_year = year(event_date) - 1`
- `season = season_year::text`

Reason:
NFL season crosses the new year.

### NBA / NHL
Rule:
- if `event_date` month >= 7, `season_year = year(event_date)`
- else `season_year = year(event_date) - 1`
- `season = concat(season_year, '-', right((season_year + 1)::text, 2))`

Examples:
- `2025-11-04` → `2025-26`
- `2026-04-10` → `2025-26`

### Fallback
If a league lands outside known rules:
- `season_year = extract(year from event_date)`
- `season = season_year::text`
- and add to QA exception bucket

## Supporting event-row selection

Because `goose_market_events` may contain multiple rows per canonical game lineage, build a support CTE that selects one best row.

### Preferred ranking
For each canonical game:
1. row with exact `event_id = canonical_game_id`
2. row with non-null both `home_team_id` and `away_team_id`
3. row with latest `commence_time`
4. deterministic tiebreak on `event_id`

## Proposed SQL skeleton

```sql
create or replace view public.dim_historical_games_v1 as
with support_events as (
  select
    cg.canonical_game_id,
    gme.event_id,
    gme.commence_time,
    gme.home_team_id,
    gme.away_team_id,
    row_number() over (
      partition by cg.canonical_game_id
      order by
        case when gme.event_id = cg.canonical_game_id then 0 else 1 end,
        case when gme.home_team_id is not null and gme.away_team_id is not null then 0 else 1 end,
        gme.commence_time desc nulls last,
        gme.event_id
    ) as rn
  from public.canonical_games cg
  left join public.goose_market_events gme
    on gme.event_id = cg.canonical_game_id
      or gme.odds_api_event_id in (
        select jsonb_array_elements_text(cg.source_event_ids)
      )
),
best_support as (
  select *
  from support_events
  where rn = 1
)
select
  cg.canonical_game_id,
  cg.sport,
  cg.league,
  case
    when cg.league = 'MLB' then extract(year from cg.event_date)::int::text
    when cg.league = 'NFL' then (
      case
        when extract(month from cg.event_date) >= 8 then extract(year from cg.event_date)::int
        else extract(year from cg.event_date)::int - 1
      end
    )::text
    when cg.league in ('NBA', 'NHL') then concat(
      case
        when extract(month from cg.event_date) >= 7 then extract(year from cg.event_date)::int
        else extract(year from cg.event_date)::int - 1
      end,
      '-',
      right((
        case
          when extract(month from cg.event_date) >= 7 then extract(year from cg.event_date)::int + 1
          else extract(year from cg.event_date)::int
        end
      )::text, 2)
    )
    else extract(year from cg.event_date)::int::text
  end as season,
  case
    when cg.league = 'MLB' then extract(year from cg.event_date)::int
    when cg.league = 'NFL' then case
      when extract(month from cg.event_date) >= 8 then extract(year from cg.event_date)::int
      else extract(year from cg.event_date)::int - 1
    end
    when cg.league in ('NBA', 'NHL') then case
      when extract(month from cg.event_date) >= 7 then extract(year from cg.event_date)::int
      else extract(year from cg.event_date)::int - 1
    end
    else extract(year from cg.event_date)::int
  end as season_year,
  cg.event_date,
  coalesce(cg.scheduled_start, bs.commence_time) as scheduled_start,
  cg.home_team,
  cg.away_team,
  cg.home_team_key,
  cg.away_team_key,
  bs.home_team_id,
  bs.away_team_id,
  cg.source_event_ids,
  cg.identity_confidence,
  null::boolean as is_divisional,
  null::integer as home_rest_days,
  null::integer as away_rest_days,
  null::boolean as home_back_to_back,
  null::boolean as away_back_to_back,
  'v1'::text as build_version
from public.canonical_games cg
left join best_support bs
  on bs.canonical_game_id = cg.canonical_game_id;
```

## QA requirements before calling it real

### Row-count QA
- one row per `canonical_game_id`
- assert no duplicates:

```sql
select canonical_game_id, count(*)
from public.dim_historical_games_v1
group by 1
having count(*) > 1;
```

Must return zero rows.

### Null-rate QA
Check null rates for:
- `sport`
- `league`
- `event_date`
- `home_team`
- `away_team`
- `season`
- `season_year`

### Team-id QA
Measure how often we still lack team ids:

```sql
select
  league,
  count(*) as games,
  count(*) filter (where home_team_id is null or away_team_id is null) as missing_team_ids
from public.dim_historical_games_v1
group by 1
order by 1;
```

This is not a blocker for v1, but it must be visible.

### Season QA
Spot-check by league around new-year boundaries:
- NFL January playoff games should map to prior season year
- NHL/NBA January-April games should map to prior season year
- MLB should stay same-year

### Confidence QA
Bucket identity confidence:

```sql
select
  league,
  count(*) as games,
  count(*) filter (where identity_confidence is null) as confidence_null,
  count(*) filter (where identity_confidence < 0.8) as confidence_lt_08
from public.dim_historical_games_v1
group by 1;
```

## Deferred to v2 enrichment

These should **not** be faked in v1:
- `is_divisional`
- `home_rest_days`
- `away_rest_days`
- `home_back_to_back`
- `away_back_to_back`

### Why deferred
Because they need additional helper rails:
- team-division/conference maps by league and season
- full team schedule continuity
- trusted game ordering per team

If we invent those now without the helper rails, we’ll poison the layer.

## Recommended next implementation after this

Once `dim_historical_games_v1` exists and passes QA:
1. build `fact_historical_market_sides_v1`
2. add taxonomy mapping for `market_family` and `market_scope`
3. add home/away team-side resolver
4. join `goose_market_results`
5. compute profitability
6. publish `historical_betting_markets_gold_v1`

## Terminal status
- Done: exact SQL/view spec defined for `dim_historical_games_v1`
- Partial: SQL migration/view creation and live QA queries still need execution
