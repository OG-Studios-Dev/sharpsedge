create or replace view public.historical_trends_loader_source_v1 as
select
  hbg.candidate_id,
  hbg.canonical_game_id,
  hbg.event_id,
  hbg.sport,
  hbg.league,
  hbg.season,
  hbg.event_date,
  hbg.home_team,
  hbg.away_team,
  hbg.team_role,
  case
    when hbg.team_role = 'home' then hbg.home_team
    when hbg.team_role = 'away' then hbg.away_team
    else null::text
  end as team_name,
  case
    when hbg.team_role = 'home' then hbg.away_team
    when hbg.team_role = 'away' then hbg.home_team
    else null::text
  end as opponent_name,
  hbg.market_type,
  hbg.submarket_type,
  hbg.market_family,
  hbg.market_scope,
  hbg.side,
  hbg.line,
  hbg.odds,
  hbg.sportsbook,
  null::boolean as is_home_favorite,
  null::boolean as is_away_favorite,
  null::boolean as is_home_underdog,
  null::boolean as is_road_underdog,
  null::boolean as is_road_favorite,
  null::boolean as is_favorite,
  null::boolean as is_underdog,
  hbg.bet_on_home_team as is_home_team_bet,
  hbg.bet_on_away_team as is_away_team_bet,
  hbg.result,
  hbg.graded,
  hbg.integrity_status,
  hbg.profit_units,
  hbg.profit_dollars_10,
  hbg.roi_on_10_flat,
  null::numeric as game_total_line,
  null::numeric as over_odds,
  null::numeric as under_odds,
  null::boolean as is_total_over_bet,
  null::boolean as is_total_under_bet,
  null::boolean as is_prime_time,
  null::text as broadcast_window,
  null::boolean as is_back_to_back,
  hbg.is_divisional as is_divisional_game,
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
    when hbg.market_type ilike '%1q%' or coalesce(hbg.submarket_type, '') ilike '%1q%' then '1Q'
    when hbg.market_type ilike '%1h%' or coalesce(hbg.submarket_type, '') ilike '%1h%' then '1H'
    when hbg.market_type ilike '%2q%' or coalesce(hbg.submarket_type, '') ilike '%2q%' then '2Q'
    when hbg.market_type ilike '%3q%' or coalesce(hbg.submarket_type, '') ilike '%3q%' then '3Q'
    when hbg.market_type ilike '%4q%' or coalesce(hbg.submarket_type, '') ilike '%4q%' then '4Q'
    when hbg.market_type ilike '%1p%' or coalesce(hbg.submarket_type, '') ilike '%1p%' then '1P'
    when hbg.market_type ilike '%2p%' or coalesce(hbg.submarket_type, '') ilike '%2p%' then '2P'
    when hbg.market_type ilike '%3p%' or coalesce(hbg.submarket_type, '') ilike '%3p%' then '3P'
    else null::text
  end as segment_key,
  case when hbg.market_type = 'spread' or hbg.market_type ilike 'spread%' then true else false end as is_spread_market,
  case when hbg.market_type = 'total' or hbg.market_type ilike 'total%' then true else false end as is_total_market,
  case when hbg.market_type = 'moneyline' then true else false end as is_moneyline_market,
  'loader_v2'::text as trends_build_version
from public.historical_betting_markets_gold_v1 hbg
where hbg.team_role in ('home', 'away');
