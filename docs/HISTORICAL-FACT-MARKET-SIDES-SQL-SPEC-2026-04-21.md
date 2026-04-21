# Historical fact_historical_market_sides SQL Spec (2026-04-21)

Owner: Magoo  
Goal: define the exact SQL/view implementation spec for `fact_historical_market_sides` so the historical warehouse can produce one analyst-usable row per normalized betting side.  
Proof required: target schema, source joins, classification rules, taxonomy rules, close/open rules, QA checks, and explicit unresolved buckets.  
Last updated: 2026-04-21 19:40 America/Toronto

## Why this layer matters

This is the layer where the warehouse stops being a pile of snapshots and starts becoming something useful.

If we get this wrong:
- market grouping breaks
- home/away classification lies
- favorites/dogs become fake
- profitability joins become noisy
- the gold layer becomes brittle garbage

## Objective

Create one normalized side row per candidate/market observation with:
- stable row identity
- canonical game linkage
- market taxonomy
- team-side classification
- opening/closing flags
- close-price standardization hooks
- source-quality flags for QA

## Recommended implementation form

Build as a **view first**:
- `public.fact_historical_market_sides_v1`

Reason:
- easier iteration while classification logic hardens
- no premature storage duplication
- simplifies QA before materializing

## Primary sources

1. `goose_market_candidates` as the main normalized side rail
2. `dim_historical_games_v1` as the canonical game dimension
3. `market_snapshot_prices` as support for canonical market keys, capture phase, and source-limited coverage
4. `goose_market_results` only later for outcome/profit attachment, not for the side fact itself except where `closing_odds` fallback is unavoidable

## Non-negotiable rules

1. one row per `candidate_id`
2. do not duplicate rows because multiple snapshot-price rows match the same candidate
3. classify team side explicitly, not by hand-wavy string guesses alone
4. do not fabricate favorite/underdog when the market family does not support it
5. keep unresolved cases visible instead of silently coercing them

## Target schema

| field | type | required | source / derivation |
|---|---|---:|---|
| `candidate_id` | `text` | yes | `goose_market_candidates.candidate_id` |
| `canonical_game_id` | `text` | yes | join from candidate/event to game dim, fallback from snapshot price |
| `event_id` | `text` | yes | `goose_market_candidates.event_id` |
| `sport` | `text` | yes | `goose_market_candidates.sport` |
| `league` | `text` | yes | `goose_market_candidates.league` |
| `season` | `text` | yes | from `dim_historical_games_v1.season` |
| `event_date` | `date` | yes | `goose_market_candidates.event_date` |
| `home_team` | `text` | yes | from game dim |
| `away_team` | `text` | yes | from game dim |
| `home_team_id` | `text` | no | from game dim |
| `away_team_id` | `text` | no | from game dim |
| `market_type` | `text` | yes | `goose_market_candidates.market_type` |
| `submarket_type` | `text` | no | `goose_market_candidates.submarket_type` |
| `market_family` | `text` | yes | derived taxonomy |
| `market_scope` | `text` | yes | derived taxonomy |
| `participant_type` | `text` | yes | `goose_market_candidates.participant_type` |
| `participant_id` | `text` | no | `goose_market_candidates.participant_id` |
| `participant_name` | `text` | no | `goose_market_candidates.participant_name` |
| `opponent_id` | `text` | no | `goose_market_candidates.opponent_id` |
| `opponent_name` | `text` | no | `goose_market_candidates.opponent_name` |
| `side` | `text` | yes | `goose_market_candidates.side` |
| `line` | `numeric` | no | `goose_market_candidates.line` |
| `odds` | `numeric` | yes | `goose_market_candidates.odds` |
| `sportsbook` | `text` | yes | `goose_market_candidates.sportsbook` |
| `captured_at` | `timestamptz` | yes | `goose_market_candidates.capture_ts` |
| `opening_flag` | `boolean` | yes | derived standardized opening flag |
| `closing_flag` | `boolean` | yes | derived standardized closing flag |
| `capture_window_phase` | `text` | no | support from snapshot-price match |
| `canonical_market_key` | `text` | no | support from snapshot-price match |
| `participant_key` | `text` | no | support from snapshot-price match |
| `source` | `text` | yes | `goose_market_candidates.source` |
| `source_market_id` | `text` | no | `goose_market_candidates.source_market_id` |
| `source_limited` | `boolean` | no | support from snapshot price |
| `coverage_flags` | `jsonb` | no | support from snapshot price |
| `bet_on_home_team` | `boolean` | no | derived team-side classification |
| `bet_on_away_team` | `boolean` | no | derived team-side classification |
| `team_role` | `text` | no | derived: `home` / `away` / null |
| `opponent_role` | `text` | no | derived: `home` / `away` / null |
| `favorite_team_id` | `text` | no | derived only where supported |
| `underdog_team_id` | `text` | no | derived only where supported |
| `classification_status` | `text` | yes | `ok` / `unresolved_team_side` / `unsupported_market_for_team_role` / `missing_game_link` |
| `build_version` | `text` | yes | hardcoded `'v1'` |

## Source join design

### Step 1: canonical candidate spine
Start with `goose_market_candidates gmc`.

### Step 2: attach game dim
Join to `dim_historical_games_v1 dhg` using candidate event lineage.

Preferred path:
- `gmc.event_id = dhg.canonical_game_id`

Fallback path:
- join through `goose_market_events gme` to align candidate `event_id` with canonical game dimension via event metadata

If no game row can be resolved:
- keep the candidate row
- `canonical_game_id = null`
- `classification_status = 'missing_game_link'`

Do not discard the row silently.

### Step 3: attach best snapshot-price support row
Use a support CTE that chooses the best matching `market_snapshot_prices` row per candidate.

Preferred matching traits:
1. same canonical game
2. same sportsbook/book
3. same market type
4. same captured timestamp within reasonable tolerance
5. same line when applicable
6. same participant/outcome shape where recoverable

This support row is for:
- `canonical_market_key`
- `participant_key`
- `capture_window_phase`
- `source_limited`
- `coverage_flags`

Do **not** let this join create fanout.

## Market taxonomy rules

### `market_family`
Use deterministic mapping:

| source condition | market_family |
|---|---|
| `market_type = 'moneyline'` | `moneyline` |
| `market_type like 'spread%'` | `spread` |
| `market_type = 'total'` | `total` |
| `market_type like 'total_%'` | `total` |
| player prop style market with `participant_type in ('player','golfer')` | `player_prop` |
| team prop style market | `team_prop` |
| otherwise | `other` |

### `market_scope`
Use deterministic mapping:

| source condition | market_scope |
|---|---|
| full game standard markets | `game` |
| quarter / period / inning / first-half / first-five variants | `segment` |
| `participant_type in ('player','golfer')` | `player` |
| team prop style rows | `team` |
| otherwise | `other` |

Blunt note: v1 should be explicit and boring, not clever.

## Opening / closing standardization

We already have multiple possible flags:
- `goose_market_candidates.is_opening`
- `goose_market_candidates.is_closing`
- `market_snapshot_prices.is_opening_candidate`
- `market_snapshot_prices.is_closing_candidate`

### v1 standard
Use this precedence:
- `opening_flag = coalesce(snapshot_support.is_opening_candidate, gmc.is_opening, false)`
- `closing_flag = coalesce(snapshot_support.is_closing_candidate, gmc.is_closing, false)`

Reason:
Snapshot warehouse flags are closer to the actual historical price-series logic.

## Team-side classification rules

This is where bullshit can creep in fast, so keep it deterministic.

### Supported markets for home/away side classification
Only attempt direct team-side classification for:
- moneyline
- spread
- team total style markets where team identity is explicit

Do **not** force team-role resolution for:
- generic game totals
- player props
- field/pairing markets
- unresolved custom props

### Resolution order
For each candidate row:

1. If `participant_id` matches `home_team_id`, classify home
2. Else if `participant_id` matches `away_team_id`, classify away
3. Else if `participant_name` normalized equals `home_team` normalized, classify home
4. Else if `participant_name` normalized equals `away_team` normalized, classify away
5. Else if `opponent_name` normalized equals home/away and side implies the inverse, use that cautiously
6. Else unresolved

### Output rules
- if home resolved:
  - `bet_on_home_team = true`
  - `bet_on_away_team = false`
  - `team_role = 'home'`
  - `opponent_role = 'away'`
- if away resolved:
  - `bet_on_home_team = false`
  - `bet_on_away_team = true`
  - `team_role = 'away'`
  - `opponent_role = 'home'`
- if market unsupported:
  - all four fields null
  - `classification_status = 'unsupported_market_for_team_role'`
- if supported but unresolved:
  - all four fields null
  - `classification_status = 'unresolved_team_side'`

## Favorite / underdog derivation

Do not pretend every row can produce this.

### Allowed only for
- moneyline
- spread

### Rule
Resolve at the **game + capture point** level using standardized close rows.

Preferred method:
1. isolate closing candidates for team-side markets within same game/book/market family
2. compare implied market position
3. assign favorite / underdog where a clean pair exists

### v1 safe behavior
If no clean two-sided pairing exists:
- `favorite_team_id = null`
- `underdog_team_id = null`

No fake confidence.

## Proposed SQL skeleton

```sql
create or replace view public.fact_historical_market_sides_v1 as
with candidate_base as (
  select
    gmc.*
  from public.goose_market_candidates gmc
),
candidate_games as (
  select
    cb.*,
    dhg.canonical_game_id,
    dhg.season,
    dhg.home_team,
    dhg.away_team,
    dhg.home_team_id,
    dhg.away_team_id
  from candidate_base cb
  left join public.dim_historical_games_v1 dhg
    on dhg.canonical_game_id = cb.event_id
),
snapshot_support as (
  select
    cg.candidate_id,
    msp.canonical_market_key,
    msp.participant_key,
    msp.capture_window_phase,
    msp.is_opening_candidate,
    msp.is_closing_candidate,
    msp.source_limited,
    msp.coverage_flags,
    row_number() over (
      partition by cg.candidate_id
      order by
        case when msp.canonical_game_id = cg.canonical_game_id then 0 else 1 end,
        case when msp.book = cg.book then 0 else 1 end,
        case when msp.market_type = cg.market_type then 0 else 1 end,
        abs(extract(epoch from (msp.captured_at - cg.capture_ts))) asc,
        case when msp.line is not distinct from cg.line then 0 else 1 end,
        msp.id
    ) as rn
  from candidate_games cg
  left join public.market_snapshot_prices msp
    on msp.canonical_game_id = cg.canonical_game_id
   and msp.book = cg.book
),
best_snapshot_support as (
  select *
  from snapshot_support
  where rn = 1
),
classified as (
  select
    cg.*,
    bss.canonical_market_key,
    bss.participant_key,
    bss.capture_window_phase,
    coalesce(bss.is_opening_candidate, cg.is_opening, false) as opening_flag,
    coalesce(bss.is_closing_candidate, cg.is_closing, false) as closing_flag,
    bss.source_limited,
    bss.coverage_flags,
    case
      when cg.market_type = 'moneyline' then 'moneyline'
      when cg.market_type like 'spread%' then 'spread'
      when cg.market_type = 'total' or cg.market_type like 'total_%' then 'total'
      when cg.participant_type in ('player','golfer') then 'player_prop'
      when cg.participant_type = 'team' and cg.market_type not in ('moneyline','total') and cg.market_type not like 'spread%' then 'team_prop'
      else 'other'
    end as market_family,
    case
      when cg.participant_type in ('player','golfer') then 'player'
      when cg.market_type in ('moneyline','spread','total') then 'game'
      when cg.market_type like '%q1%' or cg.market_type like '%q2%' or cg.market_type like '%q3%' or cg.market_type like '%q4%' then 'segment'
      when cg.submarket_type ilike '%first%' or cg.submarket_type ilike '%period%' then 'segment'
      when cg.participant_type = 'team' and cg.market_type not in ('moneyline','spread','total') then 'team'
      else 'other'
    end as market_scope,
    case
      when cg.canonical_game_id is null then 'missing_game_link'
      when cg.market_type not in ('moneyline','spread') and cg.participant_type <> 'team' then 'unsupported_market_for_team_role'
      when cg.participant_id is not null and cg.participant_id = cg.home_team_id then 'ok'
      when cg.participant_id is not null and cg.participant_id = cg.away_team_id then 'ok'
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.home_team, '')) then 'ok'
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.away_team, '')) then 'ok'
      else 'unresolved_team_side'
    end as classification_status,
    case
      when cg.participant_id is not null and cg.participant_id = cg.home_team_id then true
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.home_team, '')) then true
      else false
    end as raw_home_match,
    case
      when cg.participant_id is not null and cg.participant_id = cg.away_team_id then true
      when lower(coalesce(cg.participant_name, '')) = lower(coalesce(cg.away_team, '')) then true
      else false
    end as raw_away_match
  from candidate_games cg
  left join best_snapshot_support bss
    on bss.candidate_id = cg.candidate_id
)
select
  candidate_id,
  canonical_game_id,
  event_id,
  sport,
  league,
  season,
  event_date,
  home_team,
  away_team,
  home_team_id,
  away_team_id,
  market_type,
  submarket_type,
  market_family,
  market_scope,
  participant_type,
  participant_id,
  participant_name,
  opponent_id,
  opponent_name,
  side,
  line,
  odds,
  sportsbook,
  capture_ts as captured_at,
  opening_flag,
  closing_flag,
  capture_window_phase,
  canonical_market_key,
  participant_key,
  source,
  source_market_id,
  source_limited,
  coverage_flags,
  case when classification_status = 'ok' and raw_home_match then true else null end as bet_on_home_team,
  case when classification_status = 'ok' and raw_away_match then true else null end as bet_on_away_team,
  case
    when classification_status = 'ok' and raw_home_match then 'home'
    when classification_status = 'ok' and raw_away_match then 'away'
    else null
  end as team_role,
  case
    when classification_status = 'ok' and raw_home_match then 'away'
    when classification_status = 'ok' and raw_away_match then 'home'
    else null
  end as opponent_role,
  null::text as favorite_team_id,
  null::text as underdog_team_id,
  classification_status,
  'v1'::text as build_version
from classified;
```

## QA requirements

### Row uniqueness
```sql
select candidate_id, count(*)
from public.fact_historical_market_sides_v1
group by 1
having count(*) > 1;
```
Must return zero rows.

### Missing game link rate
```sql
select
  league,
  count(*) as rows,
  count(*) filter (where classification_status = 'missing_game_link') as missing_game_link_rows
from public.fact_historical_market_sides_v1
group by 1;
```

### Unsupported vs unresolved classification buckets
```sql
select
  league,
  market_family,
  classification_status,
  count(*) as rows
from public.fact_historical_market_sides_v1
group by 1,2,3
order by 1,2,3;
```

### Opening/closing flag sanity
```sql
select
  league,
  count(*) filter (where opening_flag) as opening_rows,
  count(*) filter (where closing_flag) as closing_rows
from public.fact_historical_market_sides_v1
group by 1;
```

### Null-rate QA for key analytical fields
Check null rates for:
- `canonical_game_id`
- `market_family`
- `market_scope`
- `sportsbook`
- `captured_at`
- `classification_status`

### Team-role sanity sample
Spot-check rows where:
- `classification_status = 'ok'`
- `market_family in ('moneyline','spread')`

Confirm the selected participant actually aligns to home/away correctly.

## What is intentionally deferred from v1

These are real but should not be faked here yet:
- `favorite_team_id`
- `underdog_team_id`
- fully hardened team-side resolution for every custom/team prop edge case
- advanced cross-book consensus close logic

Those belong in v2 after the base fact is proven stable.

## Recommended next step after this

Once `fact_historical_market_sides_v1` is implemented and QA-clean:
1. build `historical_market_results_enriched_v1`
2. compute `graded`, `profit_units`, `profit_dollars_10`, `roi_on_10_flat`
3. publish `historical_betting_markets_gold_v1`

## Terminal status
- Done: exact SQL/view spec defined for `fact_historical_market_sides_v1`
- Partial: live SQL implementation, favorite/dog derivation, and outcome/profit attachment still need execution
