create table if not exists public.ask_goose_source_stage_v1 (
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
  staged_at timestamptz not null default now()
);

create index if not exists ask_goose_source_stage_v1_league_date_idx
  on public.ask_goose_source_stage_v1 (league, event_date);

create or replace function public.refresh_ask_goose_source_stage_v1(
  p_league text default null,
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
    truncate table public.ask_goose_source_stage_v1;
  else
    delete from public.ask_goose_source_stage_v1
    where league = p_league
      and (p_start_date is null or event_date >= p_start_date)
      and (p_end_date is null or event_date <= p_end_date);
  end if;

  insert into public.ask_goose_source_stage_v1 (
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
    trends_build_version, staged_at
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
  where (p_league is null or league = p_league)
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

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

  perform public.refresh_ask_goose_source_stage_v1(p_league, p_start_date, p_end_date);

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
  from public.ask_goose_source_stage_v1
  where league = p_league
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
