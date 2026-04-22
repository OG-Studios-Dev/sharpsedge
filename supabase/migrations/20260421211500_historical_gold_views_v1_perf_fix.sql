create or replace view public.fact_historical_market_sides_v1 as
with event_game_map as (
  select
    dhg.canonical_game_id,
    dhg.canonical_game_id as event_id,
    dhg.season,
    dhg.home_team,
    dhg.away_team,
    dhg.home_team_id,
    dhg.away_team_id
  from public.dim_historical_games_v1 dhg

  union all

  select
    dhg.canonical_game_id,
    gme.event_id,
    dhg.season,
    dhg.home_team,
    dhg.away_team,
    dhg.home_team_id,
    dhg.away_team_id
  from public.dim_historical_games_v1 dhg
  join public.goose_market_events gme
    on gme.odds_api_event_id is not null
   and dhg.source_event_ids @> to_jsonb(array[gme.odds_api_event_id])
),
event_game_map_ranked as (
  select
    egm.*,
    row_number() over (
      partition by egm.event_id
      order by
        case when egm.event_id = egm.canonical_game_id then 0 else 1 end,
        egm.canonical_game_id
    ) as rn
  from event_game_map egm
),
event_game_map_best as (
  select *
  from event_game_map_ranked
  where rn = 1
),
candidate_base as (
  select
    gmc.*,
    gme.odds_api_event_id,
    gme.home_team_id as event_home_team_id,
    gme.away_team_id as event_away_team_id
  from public.goose_market_candidates gmc
  left join public.goose_market_events gme
    on gme.event_id = gmc.event_id
),
candidate_games as (
  select
    cb.*,
    egmb.canonical_game_id,
    egmb.season,
    egmb.home_team,
    egmb.away_team,
    coalesce(egmb.home_team_id, cb.event_home_team_id) as home_team_id,
    coalesce(egmb.away_team_id, cb.event_away_team_id) as away_team_id
  from candidate_base cb
  left join event_game_map_best egmb
    on egmb.event_id = cb.event_id
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
        abs(extract(epoch from (msp.captured_at - cg.capture_ts))) asc nulls last,
        case when msp.line is not distinct from cg.line then 0 else 1 end,
        msp.id
    ) as rn
  from candidate_games cg
  left join public.market_snapshot_prices msp
    on msp.canonical_game_id = cg.canonical_game_id
   and msp.book = cg.book
   and msp.market_type = cg.market_type
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
      when coalesce(cg.submarket_type, '') ilike '%first%' or coalesce(cg.submarket_type, '') ilike '%period%' then 'segment'
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
