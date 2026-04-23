create or replace function public.refresh_ask_goose_query_layer_nhl_v2(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  perform public.refresh_ask_goose_nhl_serving_source_v2(p_start_date, p_end_date);

  delete from public.ask_goose_query_layer_v1 q
  where q.league = 'NHL'
    and (p_start_date is null or q.event_date >= p_start_date)
    and (p_end_date is null or q.event_date <= p_end_date);

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
    s.candidate_id,
    s.canonical_game_id,
    s.event_id,
    'NHL'::text as sport,
    s.league,
    s.season,
    s.event_date,
    gc.home_team,
    gc.away_team,
    case
      when s.is_home_team_bet then 'home'
      when s.is_away_team_bet then 'away'
      else null::text
    end as team_role,
    s.team_name,
    s.opponent_name,
    s.market_type,
    s.submarket_type,
    s.market_family,
    s.market_scope,
    s.side,
    s.line,
    s.odds,
    s.sportsbook,
    s.is_favorite,
    s.is_underdog,
    s.is_home_team_bet,
    s.is_away_team_bet,
    case when s.is_home_team_bet and s.is_favorite then true else false end as is_home_favorite,
    case when s.is_away_team_bet and s.is_favorite then true else false end as is_away_favorite,
    case when s.is_home_team_bet and s.is_underdog then true else false end as is_home_underdog,
    case when s.is_away_team_bet and s.is_underdog then true else false end as is_road_underdog,
    case when s.is_away_team_bet and s.is_favorite then true else false end as is_road_favorite,
    s.result,
    s.graded,
    s.integrity_status,
    s.profit_units,
    s.profit_dollars_10,
    s.roi_on_10_flat,
    null::numeric as game_total_line,
    null::numeric as over_odds,
    null::numeric as under_odds,
    case when s.market_type = 'total' and lower(coalesce(s.side, '')) = 'over' then true else false end as is_total_over_bet,
    case when s.market_type = 'total' and lower(coalesce(s.side, '')) = 'under' then true else false end as is_total_under_bet,
    null::boolean as is_prime_time,
    null::text as broadcast_window,
    case
      when s.is_home_team_bet then gc.home_back_to_back
      when s.is_away_team_bet then gc.away_back_to_back
      else null::boolean
    end as is_back_to_back,
    gc.is_divisional,
    null::numeric as team_win_pct_pre_game,
    null::numeric as opponent_win_pct_pre_game,
    null::boolean as team_above_500_pre_game,
    null::boolean as opponent_above_500_pre_game,
    null::boolean as previous_game_shutout,
    case
      when s.is_home_team_bet then gc.home_rest_days
      when s.is_away_team_bet then gc.away_rest_days
      else null::integer
    end as days_since_previous_game,
    null::text as previous_team_role,
    null::text as previous_moneyline_result,
    null::text as previous_over_result,
    null::text as previous_under_result,
    s.segment_key,
    (s.market_type like 'spread%') as is_spread_market,
    (s.market_type = 'total' or s.market_type like 'total_%') as is_total_market,
    (s.market_type = 'moneyline') as is_moneyline_market,
    s.build_version,
    now()
  from public.ask_goose_nhl_serving_source_v2 s
  join public.ask_goose_game_context_v1 gc
    on gc.canonical_game_id = s.canonical_game_id
  where (p_start_date is null or s.event_date >= p_start_date)
    and (p_end_date is null or s.event_date <= p_end_date)
    and not (
      s.market_type = 'moneyline'
      and lower(coalesce(s.side, '')) not in ('home', 'away')
    )
    and not (
      s.market_type = 'moneyline'
      and lower(coalesce(s.team_name, '')) in ('all', 'draw', 'not draw', 'not-draw')
    )
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
