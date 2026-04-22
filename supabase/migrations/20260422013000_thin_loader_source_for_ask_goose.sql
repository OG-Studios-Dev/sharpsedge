create or replace view public.historical_trends_loader_source_v1 as
select
  hbq.candidate_id,
  hbq.canonical_game_id,
  hbq.canonical_game_id as event_id,
  hbq.sport,
  hbq.league,
  hbq.season,
  hbq.event_date,
  hbq.home_team,
  hbq.away_team,
  hbq.team_role,
  case
    when hbq.team_role = 'home' then hbq.home_team
    when hbq.team_role = 'away' then hbq.away_team
    else null::text
  end as team_name,
  case
    when hbq.team_role = 'home' then hbq.away_team
    when hbq.team_role = 'away' then hbq.home_team
    else null::text
  end as opponent_name,
  hbq.market_type,
  hbq.submarket_type,
  hbq.market_family,
  hbq.market_scope,
  hbq.side,
  hbq.line,
  hbq.odds,
  hbq.sportsbook,
  hbq.is_favorite,
  hbq.is_underdog,
  hbq.is_home_team_bet,
  hbq.is_away_team_bet,
  hbq.is_home_favorite,
  hbq.is_away_favorite,
  hbq.is_home_underdog,
  hbq.is_road_underdog,
  hbq.is_road_favorite,
  hbq.result,
  hbq.graded,
  hbq.integrity_status,
  hbq.profit_units,
  hbq.profit_dollars_10,
  hbq.roi_on_10_flat,
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
  case when hbq.market_type = 'spread' or hbq.market_type ilike 'spread%' then true else false end as is_spread_market,
  case when hbq.market_type = 'total' or hbq.market_type ilike 'total%' then true else false end as is_total_market,
  case when hbq.market_type = 'moneyline' then true else false end as is_moneyline_market,
  'loader_v1'::text as trends_build_version
from public.historical_betting_markets_query_graded_v1 hbq
where hbq.team_role in ('home', 'away');

create or replace function public.refresh_ask_goose_query_layer_v1_batch(
  p_league text,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  if p_league is null then
    raise exception 'p_league is required for batch refresh';
  end if;

  delete from public.ask_goose_query_layer_v1
  where league = p_league
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  insert into public.ask_goose_query_layer_v1 (
    candidate_id, canonical_game_id, event_id, sport, league, season, event_date,
    home_team, away_team, team_role, team_name, opponent_name,
    market_type, submarket_type, market_family, market_scope, side, line, odds, sportsbook,
    is_favorite, is_underdog, is_home_team_bet, is_away_team_bet,
    is_home_favorite, is_away_favorite, is_home_underdog, is_road_underdog, is_road_favorite,
    result, graded, integrity_status, profit_units, profit_dollars_10, roi_on_10_flat,
    game_total_line, over_odds, under_odds, is_total_over_bet, is_total_under_bet,
    is_prime_time, broadcast_window, is_back_to_back, is_divisional_game,
    team_win_pct_pre_game, opponent_win_pct_pre_game, team_above_500_pre_game, opponent_above_500_pre_game,
    previous_game_shutout, days_since_previous_game, previous_team_role,
    previous_moneyline_result, previous_over_result, previous_under_result,
    segment_key, is_spread_market, is_total_market, is_moneyline_market,
    trends_build_version, refreshed_at
  )
  select
    candidate_id, canonical_game_id, event_id, sport, league, season, event_date,
    home_team, away_team, team_role, team_name, opponent_name,
    market_type, submarket_type, market_family, market_scope, side, line, odds, sportsbook,
    is_favorite, is_underdog, is_home_team_bet, is_away_team_bet,
    is_home_favorite, is_away_favorite, is_home_underdog, is_road_underdog, is_road_favorite,
    result, graded, integrity_status, profit_units, profit_dollars_10, roi_on_10_flat,
    game_total_line, over_odds, under_odds, is_total_over_bet, is_total_under_bet,
    is_prime_time, broadcast_window, is_back_to_back, is_divisional_game,
    team_win_pct_pre_game, opponent_win_pct_pre_game, team_above_500_pre_game, opponent_above_500_pre_game,
    previous_game_shutout, days_since_previous_game, previous_team_role,
    previous_moneyline_result, previous_over_result, previous_under_result,
    segment_key, is_spread_market, is_total_market, is_moneyline_market,
    trends_build_version, now()
  from public.historical_trends_loader_source_v1
  where league = p_league
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
