create or replace function public.refresh_ask_goose_loader_source_cache_v1_batch(
  p_league text,
  p_start_date date default null,
  p_end_date date default null,
  p_chunk_days integer default 6
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
  v_chunk_rows integer := 0;
  v_chunk_start date;
  v_chunk_end date;
  v_final_start date;
  v_final_end date;
begin
  if p_league is null then
    raise exception 'p_league is required for loader cache batch refresh';
  end if;

  if p_chunk_days is null or p_chunk_days < 0 then
    raise exception 'p_chunk_days must be >= 0';
  end if;

  select min(event_date), max(event_date)
    into v_final_start, v_final_end
  from public.historical_trends_loader_source_v1
  where league = p_league
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  if v_final_start is null or v_final_end is null then
    return 0;
  end if;

  delete from public.ask_goose_loader_source_cache_v1
  where league = p_league
    and event_date >= v_final_start
    and event_date <= v_final_end;

  v_chunk_start := v_final_start;

  while v_chunk_start <= v_final_end loop
    v_chunk_end := least(v_chunk_start + p_chunk_days, v_final_end);

    insert into public.ask_goose_loader_source_cache_v1 (
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
      trends_build_version, now()
    from public.historical_trends_loader_source_v1
    where league = p_league
      and event_date >= v_chunk_start
      and event_date <= v_chunk_end;

    get diagnostics v_chunk_rows = row_count;
    v_rows := v_rows + v_chunk_rows;
    v_chunk_start := v_chunk_end + 1;
  end loop;

  return v_rows;
end;
$$;

create or replace function public.refresh_ask_goose_source_stage_v1(
  p_league text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
  v_chunk_rows integer := 0;
  v_cache_rows integer := 0;
  v_chunk_start date;
  v_chunk_end date;
  v_final_start date;
  v_final_end date;
begin
  if p_league is null then
    v_cache_rows := public.refresh_ask_goose_loader_source_cache_v1(p_league, p_start_date, p_end_date);
  else
    v_cache_rows := public.refresh_ask_goose_loader_source_cache_v1_batch(p_league, p_start_date, p_end_date, 6);
  end if;

  if p_league is null then
    truncate table public.ask_goose_source_stage_v1;
  else
    delete from public.ask_goose_source_stage_v1
    where league = p_league
      and (p_start_date is null or event_date >= p_start_date)
      and (p_end_date is null or event_date <= p_end_date);
  end if;

  if v_cache_rows = 0 then
    return 0;
  end if;

  select min(event_date), max(event_date)
    into v_final_start, v_final_end
  from public.ask_goose_loader_source_cache_v1
  where (p_league is null or league = p_league)
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  if v_final_start is null or v_final_end is null then
    return 0;
  end if;

  v_chunk_start := v_final_start;

  while v_chunk_start <= v_final_end loop
    v_chunk_end := least(v_chunk_start + 6, v_final_end);

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
    from public.ask_goose_loader_source_cache_v1
    where (p_league is null or league = p_league)
      and event_date >= v_chunk_start
      and event_date <= v_chunk_end
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
      staged_at = now();

    get diagnostics v_chunk_rows = row_count;
    v_rows := v_rows + v_chunk_rows;
    v_chunk_start := v_chunk_end + 1;
  end loop;

  return v_rows;
end;
$$;
