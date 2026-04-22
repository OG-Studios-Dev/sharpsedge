create or replace function public.refresh_ask_goose_source_stage_v1(
  p_league text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $function$
declare
  v_rows integer := 0;
  v_chunk_rows integer := 0;
  v_chunk_start date;
  v_chunk_end date;
  v_final_start date;
  v_final_end date;
begin
  if p_league is null then
    truncate table public.ask_goose_source_stage_v1;
  else
    delete from public.ask_goose_source_stage_v1
    where league = p_league
      and (p_start_date is null or event_date >= p_start_date)
      and (p_end_date is null or event_date <= p_end_date);
  end if;

  v_final_start := coalesce(p_start_date, (select min(event_date) from public.historical_trends_loader_source_v1 where p_league is null or league = p_league));
  v_final_end := coalesce(p_end_date, (select max(event_date) from public.historical_trends_loader_source_v1 where p_league is null or league = p_league));

  if v_final_start is null or v_final_end is null then
    return 0;
  end if;

  v_chunk_start := v_final_start;

  while v_chunk_start <= v_final_end loop
    v_chunk_end := least(v_chunk_start + 13, v_final_end);

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
      and event_date >= v_chunk_start
      and event_date <= v_chunk_end;

    get diagnostics v_chunk_rows = row_count;
    v_rows := v_rows + v_chunk_rows;
    v_chunk_start := v_chunk_end + 1;
  end loop;

  return v_rows;
end;
$function$;
