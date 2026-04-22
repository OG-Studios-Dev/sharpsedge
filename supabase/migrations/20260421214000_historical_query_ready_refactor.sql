create or replace view public.fact_historical_market_sides_base_v1 as
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
base as (
  select
    gmc.candidate_id,
    egmb.canonical_game_id,
    gmc.event_id,
    gmc.sport,
    gmc.league,
    egmb.season,
    gmc.event_date,
    egmb.home_team,
    egmb.away_team,
    coalesce(egmb.home_team_id, gme.home_team_id) as home_team_id,
    coalesce(egmb.away_team_id, gme.away_team_id) as away_team_id,
    gmc.market_type,
    gmc.submarket_type,
    gmc.participant_type,
    gmc.participant_id,
    gmc.participant_name,
    gmc.opponent_id,
    gmc.opponent_name,
    gmc.side,
    gmc.line,
    gmc.odds,
    gmc.sportsbook,
    gmc.capture_ts as captured_at,
    gmc.is_opening as opening_flag_raw,
    gmc.is_closing as closing_flag_raw,
    gmc.source,
    gmc.source_market_id,
    case
      when gmc.market_type = 'moneyline' then 'moneyline'
      when gmc.market_type like 'spread%' then 'spread'
      when gmc.market_type = 'total' or gmc.market_type like 'total_%' then 'total'
      when gmc.participant_type in ('player','golfer') then 'player_prop'
      when gmc.participant_type = 'team' and gmc.market_type not in ('moneyline','total') and gmc.market_type not like 'spread%' then 'team_prop'
      else 'other'
    end as market_family,
    case
      when gmc.participant_type in ('player','golfer') then 'player'
      when gmc.market_type in ('moneyline','spread','total') then 'game'
      when gmc.market_type like '%q1%' or gmc.market_type like '%q2%' or gmc.market_type like '%q3%' or gmc.market_type like '%q4%' then 'segment'
      when coalesce(gmc.submarket_type, '') ilike '%first%' or coalesce(gmc.submarket_type, '') ilike '%period%' then 'segment'
      when gmc.participant_type = 'team' and gmc.market_type not in ('moneyline','spread','total') then 'team'
      else 'other'
    end as market_scope
  from public.goose_market_candidates gmc
  left join public.goose_market_events gme
    on gme.event_id = gmc.event_id
  left join event_game_map_best egmb
    on egmb.event_id = gmc.event_id
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
  captured_at,
  opening_flag_raw as opening_flag,
  closing_flag_raw as closing_flag,
  source,
  source_market_id,
  case
    when canonical_game_id is null then null::boolean
    when market_type not in ('moneyline','spread') and participant_type <> 'team' then null::boolean
    when participant_id is not null and participant_id = home_team_id then true
    when lower(coalesce(participant_name, '')) = lower(coalesce(home_team, '')) then true
    else null::boolean
  end as bet_on_home_team,
  case
    when canonical_game_id is null then null::boolean
    when market_type not in ('moneyline','spread') and participant_type <> 'team' then null::boolean
    when participant_id is not null and participant_id = away_team_id then true
    when lower(coalesce(participant_name, '')) = lower(coalesce(away_team, '')) then true
    else null::boolean
  end as bet_on_away_team,
  case
    when canonical_game_id is null then null::text
    when market_type not in ('moneyline','spread') and participant_type <> 'team' then null::text
    when participant_id is not null and participant_id = home_team_id then 'home'
    when lower(coalesce(participant_name, '')) = lower(coalesce(home_team, '')) then 'home'
    when participant_id is not null and participant_id = away_team_id then 'away'
    when lower(coalesce(participant_name, '')) = lower(coalesce(away_team, '')) then 'away'
    else null::text
  end as team_role,
  case
    when canonical_game_id is null then null::text
    when market_type not in ('moneyline','spread') and participant_type <> 'team' then null::text
    when participant_id is not null and participant_id = home_team_id then 'away'
    when lower(coalesce(participant_name, '')) = lower(coalesce(home_team, '')) then 'away'
    when participant_id is not null and participant_id = away_team_id then 'home'
    when lower(coalesce(participant_name, '')) = lower(coalesce(away_team, '')) then 'home'
    else null::text
  end as opponent_role,
  null::text as favorite_team_id,
  null::text as underdog_team_id,
  case
    when canonical_game_id is null then 'missing_game_link'
    when market_type not in ('moneyline','spread') and participant_type <> 'team' then 'unsupported_market_for_team_role'
    when participant_id is not null and participant_id in (home_team_id, away_team_id) then 'ok'
    when lower(coalesce(participant_name, '')) in (lower(coalesce(home_team, '')), lower(coalesce(away_team, ''))) then 'ok'
    else 'unresolved_team_side'
  end as classification_status,
  'v1'::text as build_version
from base;

create or replace view public.fact_historical_market_sides_support_v1 as
with ranked_support as (
  select
    fmb.candidate_id,
    msp.canonical_market_key,
    msp.participant_key,
    msp.capture_window_phase,
    msp.is_opening_candidate,
    msp.is_closing_candidate,
    msp.source_limited,
    msp.coverage_flags,
    row_number() over (
      partition by fmb.candidate_id
      order by
        abs(extract(epoch from (msp.captured_at - fmb.captured_at))) asc nulls last,
        case when msp.line is not distinct from fmb.line then 0 else 1 end,
        msp.id
    ) as rn
  from public.fact_historical_market_sides_base_v1 fmb
  left join public.market_snapshot_prices msp
    on msp.canonical_game_id = fmb.canonical_game_id
   and msp.book = fmb.sportsbook
   and msp.market_type = fmb.market_type
)
select
  candidate_id,
  canonical_market_key,
  participant_key,
  capture_window_phase,
  is_opening_candidate,
  is_closing_candidate,
  source_limited,
  coverage_flags
from ranked_support
where rn = 1;

create or replace view public.fact_historical_market_sides_v1 as
select
  fmb.candidate_id,
  fmb.canonical_game_id,
  fmb.event_id,
  fmb.sport,
  fmb.league,
  fmb.season,
  fmb.event_date,
  fmb.home_team,
  fmb.away_team,
  fmb.home_team_id,
  fmb.away_team_id,
  fmb.market_type,
  fmb.submarket_type,
  fmb.market_family,
  fmb.market_scope,
  fmb.participant_type,
  fmb.participant_id,
  fmb.participant_name,
  fmb.opponent_id,
  fmb.opponent_name,
  fmb.side,
  fmb.line,
  fmb.odds,
  fmb.sportsbook,
  fmb.captured_at,
  coalesce(fss.is_opening_candidate, fmb.opening_flag) as opening_flag,
  coalesce(fss.is_closing_candidate, fmb.closing_flag) as closing_flag,
  fss.capture_window_phase,
  fss.canonical_market_key,
  fss.participant_key,
  fmb.source,
  fmb.source_market_id,
  fss.source_limited,
  fss.coverage_flags,
  fmb.bet_on_home_team,
  fmb.bet_on_away_team,
  fmb.team_role,
  fmb.opponent_role,
  fmb.favorite_team_id,
  fmb.underdog_team_id,
  fmb.classification_status,
  fmb.build_version
from public.fact_historical_market_sides_base_v1 fmb
left join public.fact_historical_market_sides_support_v1 fss
  on fss.candidate_id = fmb.candidate_id;

create or replace view public.historical_market_results_enriched_v1 as
select
  fmb.candidate_id,
  fmb.canonical_game_id,
  fmb.event_id,
  fmb.sport,
  fmb.league,
  fmb.season,
  fmb.event_date,
  fmb.market_family,
  fmb.market_scope,
  fmb.participant_type,
  fmb.side,
  fmb.line,
  fmb.odds,
  fmb.sportsbook,
  fmb.closing_flag,
  gmr.result,
  gmr.integrity_status,
  gmr.settlement_ts,
  gmr.grade_source,
  gmr.grading_notes,
  gmr.actual_stat,
  gmr.actual_stat_text,
  gmr.closing_line,
  coalesce(gmr.closing_odds, case when fmb.closing_flag then fmb.odds else null end) as closing_odds,
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
    when gmr.result = 'win' and fmb.odds > 0 then round((fmb.odds / 100.0)::numeric, 4)
    when gmr.result = 'win' and fmb.odds < 0 then round((100.0 / abs(fmb.odds))::numeric, 4)
    when gmr.result = 'loss' then -1.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as profit_units,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fmb.odds > 0 then round(((fmb.odds / 100.0) * 10.0)::numeric, 4)
    when gmr.result = 'win' and fmb.odds < 0 then round(((100.0 / abs(fmb.odds)) * 10.0)::numeric, 4)
    when gmr.result = 'loss' then -10.0
    when gmr.result in ('push','void','cancelled') then 0.0
    else null::numeric
  end as profit_dollars_10,
  case
    when not (
      gmr.result in ('win','loss','push','void','cancelled')
      and gmr.integrity_status in ('ok','void','cancelled')
    ) then null::numeric
    when gmr.result = 'win' and fmb.odds > 0 then round((fmb.odds / 100.0)::numeric, 4)
    when gmr.result = 'win' and fmb.odds < 0 then round((100.0 / abs(fmb.odds))::numeric, 4)
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
from public.fact_historical_market_sides_base_v1 fmb
left join public.goose_market_results gmr
  on gmr.candidate_id = fmb.candidate_id;

create or replace view public.historical_betting_markets_gold_v1 as
select
  hmr.candidate_id,
  hmr.canonical_game_id,
  hmr.event_id,
  hmr.sport,
  hmr.league,
  hmr.season,
  hmr.event_date,
  fmb.home_team,
  fmb.away_team,
  dhg.is_divisional,
  dhg.home_rest_days,
  dhg.away_rest_days,
  dhg.home_back_to_back,
  dhg.away_back_to_back,
  fmb.market_type,
  fmb.submarket_type,
  hmr.market_family,
  hmr.market_scope,
  hmr.participant_type,
  fmb.participant_id,
  fmb.participant_name,
  fmb.opponent_id,
  fmb.opponent_name,
  hmr.side,
  hmr.line,
  hmr.odds,
  hmr.sportsbook,
  fmb.captured_at,
  fmb.opening_flag,
  hmr.closing_flag,
  null::text as capture_window_phase,
  null::text as canonical_market_key,
  null::text as participant_key,
  fmb.bet_on_home_team,
  fmb.bet_on_away_team,
  fmb.team_role,
  fmb.opponent_role,
  fmb.favorite_team_id,
  fmb.underdog_team_id,
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
  fmb.classification_status,
  hmr.profit_status,
  dhg.identity_confidence,
  dhg.source_event_ids,
  fmb.source,
  fmb.source_market_id,
  null::boolean as source_limited,
  null::jsonb as coverage_flags,
  'v1'::text as build_version
from public.historical_market_results_enriched_v1 hmr
left join public.fact_historical_market_sides_base_v1 fmb
  on fmb.candidate_id = hmr.candidate_id
left join public.dim_historical_games_v1 dhg
  on dhg.canonical_game_id = hmr.canonical_game_id;

create or replace view public.historical_betting_markets_gold_graded_v1 as
select *
from public.historical_betting_markets_gold_v1
where graded = true
  and profit_status = 'graded';
