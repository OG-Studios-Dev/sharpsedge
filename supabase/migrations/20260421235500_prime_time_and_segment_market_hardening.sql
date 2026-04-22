create or replace view public.historical_prime_time_context_v1 as
select
  dhg.canonical_game_id,
  dhg.league,
  case
    when dhg.league = 'NFL' then null::boolean
    else null::boolean
  end as is_prime_time,
  case
    when dhg.league = 'NFL' then null::text
    else null::text
  end as broadcast_window
from public.dim_historical_games_v1 dhg;

create or replace view public.historical_segment_market_context_v1 as
select
  hbq.candidate_id,
  hbq.canonical_game_id,
  hbq.league,
  hbq.market_type,
  hbq.market_family,
  hbq.market_scope,
  case
    when hbq.market_type ilike '%1q%' or coalesce(hbq.submarket_type, '') ilike '%1q%' then '1Q'
    when hbq.market_type ilike '%1h%' or coalesce(hbq.submarket_type, '') ilike '%1h%' then '1H'
    when hbq.market_type ilike '%2q%' or coalesce(hbq.submarket_type, '') ilike '%2q%' then '2Q'
    when hbq.market_type ilike '%3q%' or coalesce(hbq.submarket_type, '') ilike '%3q%' then '3Q'
    when hbq.market_type ilike '%4q%' or coalesce(hbq.submarket_type, '') ilike '%4q%' then '4Q'
    when hbq.market_type ilike '%1p%' or coalesce(hbq.submarket_type, '') ilike '%1p%' then '1P'
    when hbq.market_type ilike '%2p%' or coalesce(hbq.submarket_type, '') ilike '%2p%' then '2P'
    when hbq.market_type ilike '%3p%' or coalesce(hbq.submarket_type, '') ilike '%3p%' then '3P'
    else null::text
  end as segment_key,
  case
    when hbq.market_type = 'spread' or hbq.market_type ilike 'spread%' then true
    else false
  end as is_spread_market,
  case
    when hbq.market_type = 'total' or hbq.market_type ilike 'total%' then true
    else false
  end as is_total_market,
  case
    when hbq.market_type = 'moneyline' then true
    else false
  end as is_moneyline_market
from public.historical_betting_markets_query_v1 hbq;

drop view if exists public.historical_trends_question_surface_v1;

create view public.historical_trends_question_surface_v1 as
select
  hts.*,
  hpt.is_prime_time,
  hpt.broadcast_window,
  hsc.is_back_to_back,
  hdc.is_divisional_game,
  tpr.team_win_pct_pre_game,
  opr.team_win_pct_pre_game as opponent_win_pct_pre_game,
  tpr.team_above_500_pre_game,
  opr.team_above_500_pre_game as opponent_above_500_pre_game,
  hsh.previous_game_shutout,
  hsc.days_since_previous_game,
  hsc.previous_team_role,
  hpg.previous_moneyline_result,
  hpg.previous_over_result,
  hpg.previous_under_result,
  hsmc.segment_key,
  hsmc.is_spread_market,
  hsmc.is_total_market,
  hsmc.is_moneyline_market,
  'v5'::text as trends_build_version
from public.historical_team_market_summary_v1 hts
left join public.historical_team_pregame_record_context_v1 tpr
  on tpr.canonical_game_id = hts.canonical_game_id
 and tpr.team_role = hts.team_role
 and tpr.team_name = hts.team_name
left join public.historical_team_pregame_record_context_v1 opr
  on opr.canonical_game_id = hts.canonical_game_id
 and opr.team_name = hts.opponent_name
 and opr.opponent_name = hts.team_name
left join public.historical_team_schedule_context_v1 hsc
  on hsc.canonical_game_id = hts.canonical_game_id
 and hsc.team_name = hts.team_name
 and hsc.team_role = hts.team_role
left join public.historical_team_previous_game_context_v1 hpg
  on hpg.canonical_game_id = hts.canonical_game_id
 and hpg.team_name = hts.team_name
 and hpg.team_role = hts.team_role
left join public.historical_prime_time_context_v1 hpt
  on hpt.canonical_game_id = hts.canonical_game_id
left join public.historical_divisional_context_v1 hdc
  on hdc.canonical_game_id = hts.canonical_game_id
left join public.historical_shutout_context_v1 hsh
  on hsh.canonical_game_id = hts.canonical_game_id
 and hsh.team_name = hts.team_name
 and hsh.team_role = hts.team_role
left join public.historical_segment_market_context_v1 hsmc
  on hsmc.candidate_id = hts.candidate_id;
