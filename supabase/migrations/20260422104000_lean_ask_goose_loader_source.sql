create or replace view public.historical_trends_loader_source_v1 as
with base_results as (
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
    fmb.market_type,
    fmb.submarket_type,
    fmb.market_family,
    fmb.market_scope,
    fmb.side,
    fmb.line,
    fmb.odds,
    fmb.sportsbook,
    fmb.bet_on_home_team,
    fmb.bet_on_away_team,
    fmb.team_role,
    hmr.result,
    hmr.graded,
    hmr.integrity_status,
    hmr.profit_units,
    hmr.profit_dollars_10,
    hmr.roi_on_10_flat
  from public.fact_historical_market_sides_base_v1 fmb
  left join public.historical_market_results_enriched_v1 hmr
    on hmr.candidate_id = fmb.candidate_id
)
select
  br.candidate_id,
  br.canonical_game_id,
  br.event_id,
  br.sport,
  br.league,
  br.season,
  br.event_date,
  br.home_team,
  br.away_team,
  br.team_role,
  case
    when br.team_role = 'home' then br.home_team
    when br.team_role = 'away' then br.away_team
    else null::text
  end as team_name,
  case
    when br.team_role = 'home' then br.away_team
    when br.team_role = 'away' then br.home_team
    else null::text
  end as opponent_name,
  br.market_type,
  br.submarket_type,
  br.market_family,
  br.market_scope,
  br.side,
  br.line,
  br.odds,
  br.sportsbook,
  null::boolean as is_favorite,
  null::boolean as is_underdog,
  br.bet_on_home_team as is_home_team_bet,
  br.bet_on_away_team as is_away_team_bet,
  null::boolean as is_home_favorite,
  null::boolean as is_away_favorite,
  null::boolean as is_home_underdog,
  null::boolean as is_road_underdog,
  null::boolean as is_road_favorite,
  br.result,
  br.graded,
  br.integrity_status,
  br.profit_units,
  br.profit_dollars_10,
  br.roi_on_10_flat,
  null::numeric as game_total_line,
  null::numeric as over_odds,
  null::numeric as under_odds,
  null::boolean as is_total_over_bet,
  null::boolean as is_total_under_bet,
  null::boolean as is_prime_time,
  null::text as broadcast_window,
  null::boolean as is_back_to_back,
  null::boolean as is_divisional_game,
  null::numeric as team_win_pct_pre_game,
  null::numeric as opponent_win_pct_pre_game,
  null::boolean as team_above_500_pre_game,
  null::boolean as opponent_above_500_pre_game,
  null::boolean as previous_game_shutout,
  null::integer as days_since_previous_game,
  null::text as previous_team_role,
  null::text as previous_moneyline_result,
  null::text as previous_over_result,
  null::text as previous_under_result,
  case
    when br.market_type ilike '%1q%' or coalesce(br.submarket_type, '') ilike '%1q%' then '1Q'
    when br.market_type ilike '%1h%' or coalesce(br.submarket_type, '') ilike '%1h%' then '1H'
    when br.market_type ilike '%2q%' or coalesce(br.submarket_type, '') ilike '%2q%' then '2Q'
    when br.market_type ilike '%3q%' or coalesce(br.submarket_type, '') ilike '%3q%' then '3Q'
    when br.market_type ilike '%4q%' or coalesce(br.submarket_type, '') ilike '%4q%' then '4Q'
    when br.market_type ilike '%1p%' or coalesce(br.submarket_type, '') ilike '%1p%' then '1P'
    when br.market_type ilike '%2p%' or coalesce(br.submarket_type, '') ilike '%2p%' then '2P'
    when br.market_type ilike '%3p%' or coalesce(br.submarket_type, '') ilike '%3p%' then '3P'
    else null::text
  end as segment_key,
  case when br.market_type = 'spread' or br.market_type ilike 'spread%' then true else false end as is_spread_market,
  case when br.market_type = 'total' or br.market_type ilike 'total%' then true else false end as is_total_market,
  case when br.market_type = 'moneyline' then true else false end as is_moneyline_market,
  'loader_v3_lean'::text as trends_build_version
from base_results br
where br.team_role in ('home', 'away');
