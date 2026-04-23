create table if not exists public.ask_goose_nhl_source_cache_v1 (
  candidate_id text primary key,
  canonical_game_id text,
  event_id text,
  sport text,
  league text,
  season text,
  event_date date,
  home_team text,
  away_team text,
  team_role text,
  team_name text,
  opponent_name text,
  market_type text,
  submarket_type text,
  market_family text,
  market_scope text,
  side text,
  line numeric,
  odds numeric,
  sportsbook text,
  is_favorite boolean,
  is_underdog boolean,
  is_home_team_bet boolean,
  is_away_team_bet boolean,
  is_home_favorite boolean,
  is_away_favorite boolean,
  is_home_underdog boolean,
  is_road_underdog boolean,
  is_road_favorite boolean,
  result text,
  graded boolean,
  integrity_status text,
  profit_units numeric,
  profit_dollars_10 numeric,
  roi_on_10_flat numeric,
  game_total_line numeric,
  over_odds numeric,
  under_odds numeric,
  is_total_over_bet boolean,
  is_total_under_bet boolean,
  is_prime_time boolean,
  broadcast_window text,
  is_back_to_back boolean,
  is_divisional_game boolean,
  team_win_pct_pre_game numeric,
  opponent_win_pct_pre_game numeric,
  team_above_500_pre_game boolean,
  opponent_above_500_pre_game boolean,
  previous_game_shutout boolean,
  days_since_previous_game integer,
  previous_team_role text,
  previous_moneyline_result text,
  previous_over_result text,
  previous_under_result text,
  segment_key text,
  is_spread_market boolean,
  is_total_market boolean,
  is_moneyline_market boolean,
  trends_build_version text,
  cached_at timestamptz not null default now()
);

create index if not exists ask_goose_nhl_source_cache_v1_date_idx
  on public.ask_goose_nhl_source_cache_v1 (event_date);

create index if not exists ask_goose_nhl_source_cache_v1_team_idx
  on public.ask_goose_nhl_source_cache_v1 (team_name, opponent_name, event_date);

create or replace function public.refresh_ask_goose_nhl_source_cache_v1(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  delete from public.ask_goose_nhl_source_cache_v1
  where (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  insert into public.ask_goose_nhl_source_cache_v1 (
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
    trends_build_version, cached_at
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
    'nhl_cache_v1', now()
  from public.historical_trends_loader_source_v1
  where league = 'NHL'
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.refresh_ask_goose_query_layer_nhl_v1(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
  v_cache_rows integer;
begin
  v_cache_rows := public.refresh_ask_goose_nhl_source_cache_v1(p_start_date, p_end_date);

  if v_cache_rows = 0 then
    return 0;
  end if;

  delete from public.ask_goose_query_layer_v1
  where league = 'NHL'
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
  from public.ask_goose_nhl_source_cache_v1
  where (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date)
  on conflict (candidate_id) do update set
    canonical_game_id = excluded.canonical_game_id,
    event_id = excluded.event_id,
    sport = excluded.sport,
    league = excluded.league,
    season = excluded.season,
    event_date = excluded.event_date,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    team_role = excluded.team_role,
    team_name = excluded.team_name,
    opponent_name = excluded.opponent_name,
    market_type = excluded.market_type,
    submarket_type = excluded.submarket_type,
    market_family = excluded.market_family,
    market_scope = excluded.market_scope,
    side = excluded.side,
    line = excluded.line,
    odds = excluded.odds,
    sportsbook = excluded.sportsbook,
    is_favorite = excluded.is_favorite,
    is_underdog = excluded.is_underdog,
    is_home_team_bet = excluded.is_home_team_bet,
    is_away_team_bet = excluded.is_away_team_bet,
    is_home_favorite = excluded.is_home_favorite,
    is_away_favorite = excluded.is_away_favorite,
    is_home_underdog = excluded.is_home_underdog,
    is_road_underdog = excluded.is_road_underdog,
    is_road_favorite = excluded.is_road_favorite,
    result = excluded.result,
    graded = excluded.graded,
    integrity_status = excluded.integrity_status,
    profit_units = excluded.profit_units,
    profit_dollars_10 = excluded.profit_dollars_10,
    roi_on_10_flat = excluded.roi_on_10_flat,
    game_total_line = excluded.game_total_line,
    over_odds = excluded.over_odds,
    under_odds = excluded.under_odds,
    is_total_over_bet = excluded.is_total_over_bet,
    is_total_under_bet = excluded.is_total_under_bet,
    is_prime_time = excluded.is_prime_time,
    broadcast_window = excluded.broadcast_window,
    is_back_to_back = excluded.is_back_to_back,
    is_divisional_game = excluded.is_divisional_game,
    team_win_pct_pre_game = excluded.team_win_pct_pre_game,
    opponent_win_pct_pre_game = excluded.opponent_win_pct_pre_game,
    team_above_500_pre_game = excluded.team_above_500_pre_game,
    opponent_above_500_pre_game = excluded.opponent_above_500_pre_game,
    previous_game_shutout = excluded.previous_game_shutout,
    days_since_previous_game = excluded.days_since_previous_game,
    previous_team_role = excluded.previous_team_role,
    previous_moneyline_result = excluded.previous_moneyline_result,
    previous_over_result = excluded.previous_over_result,
    previous_under_result = excluded.previous_under_result,
    segment_key = excluded.segment_key,
    is_spread_market = excluded.is_spread_market,
    is_total_market = excluded.is_total_market,
    is_moneyline_market = excluded.is_moneyline_market,
    trends_build_version = excluded.trends_build_version,
    refreshed_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
