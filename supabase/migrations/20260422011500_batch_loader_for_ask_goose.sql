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
    candidate_id,
    canonical_game_id,
    event_id,
    sport,
    league,
    season,
    event_date,
    home_team,
    away_team,
    team_role,
    team_name,
    opponent_name,
    market_type,
    submarket_type,
    market_family,
    market_scope,
    side,
    line,
    odds,
    sportsbook,
    is_favorite,
    is_underdog,
    is_home_team_bet,
    is_away_team_bet,
    is_home_favorite,
    is_away_favorite,
    is_home_underdog,
    is_road_underdog,
    is_road_favorite,
    result,
    graded,
    integrity_status,
    profit_units,
    profit_dollars_10,
    roi_on_10_flat,
    game_total_line,
    over_odds,
    under_odds,
    is_total_over_bet,
    is_total_under_bet,
    is_prime_time,
    broadcast_window,
    is_back_to_back,
    is_divisional_game,
    team_win_pct_pre_game,
    opponent_win_pct_pre_game,
    team_above_500_pre_game,
    opponent_above_500_pre_game,
    previous_game_shutout,
    days_since_previous_game,
    previous_team_role,
    previous_moneyline_result,
    previous_over_result,
    previous_under_result,
    segment_key,
    is_spread_market,
    is_total_market,
    is_moneyline_market,
    trends_build_version,
    refreshed_at
  )
  select
    candidate_id,
    canonical_game_id,
    canonical_game_id as event_id,
    sport,
    league,
    season,
    event_date,
    home_team,
    away_team,
    team_role,
    team_name,
    opponent_name,
    market_type,
    submarket_type,
    market_family,
    market_scope,
    side,
    line,
    odds,
    sportsbook,
    is_favorite,
    is_underdog,
    is_home_team_bet,
    is_away_team_bet,
    is_home_favorite,
    is_away_favorite,
    is_home_underdog,
    is_road_underdog,
    is_road_favorite,
    result,
    graded,
    integrity_status,
    profit_units,
    profit_dollars_10,
    roi_on_10_flat,
    game_total_line,
    over_odds,
    under_odds,
    is_total_over_bet,
    is_total_under_bet,
    is_prime_time,
    broadcast_window,
    is_back_to_back,
    is_divisional_game,
    team_win_pct_pre_game,
    opponent_win_pct_pre_game,
    team_above_500_pre_game,
    opponent_above_500_pre_game,
    previous_game_shutout,
    days_since_previous_game,
    previous_team_role,
    previous_moneyline_result,
    previous_over_result,
    previous_under_result,
    segment_key,
    is_spread_market,
    is_total_market,
    is_moneyline_market,
    trends_build_version,
    now()
  from public.historical_trends_question_surface_v1
  where league = p_league
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
