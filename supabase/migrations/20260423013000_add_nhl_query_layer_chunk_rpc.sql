create or replace function public.refresh_ask_goose_query_layer_nhl_v2_chunk(
  p_event_date date,
  p_chunk_start integer default 1,
  p_chunk_size integer default 2000,
  p_delete_existing boolean default false
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  if p_event_date is null then
    raise exception 'p_event_date is required';
  end if;

  if p_delete_existing then
    delete from public.ask_goose_query_layer_v1 q
    where q.league = 'NHL'
      and q.event_date = p_event_date;
  end if;

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
  with ranked as (
    select
      s.*,
      gc.home_team,
      gc.away_team,
      gc.home_back_to_back,
      gc.away_back_to_back,
      gc.is_divisional,
      gc.home_rest_days,
      gc.away_rest_days,
      row_number() over (order by s.candidate_id) as rn
    from public.ask_goose_nhl_serving_source_v2 s
    join public.ask_goose_game_context_v1 gc
      on gc.canonical_game_id = s.canonical_game_id
    where s.event_date = p_event_date
  )
  select
    r.candidate_id,
    r.canonical_game_id,
    r.event_id,
    'NHL'::text as sport,
    r.league,
    r.season,
    r.event_date,
    r.home_team,
    r.away_team,
    case
      when r.is_home_team_bet then 'home'
      when r.is_away_team_bet then 'away'
      else null::text
    end as team_role,
    r.team_name,
    r.opponent_name,
    r.market_type,
    r.submarket_type,
    r.market_family,
    r.market_scope,
    r.side,
    r.line,
    r.odds,
    r.sportsbook,
    r.is_favorite,
    r.is_underdog,
    r.is_home_team_bet,
    r.is_away_team_bet,
    case when r.is_home_team_bet and r.is_favorite then true else false end as is_home_favorite,
    case when r.is_away_team_bet and r.is_favorite then true else false end as is_away_favorite,
    case when r.is_home_team_bet and r.is_underdog then true else false end as is_home_underdog,
    case when r.is_away_team_bet and r.is_underdog then true else false end as is_road_underdog,
    case when r.is_away_team_bet and r.is_favorite then true else false end as is_road_favorite,
    r.result,
    r.graded,
    r.integrity_status,
    r.profit_units,
    r.profit_dollars_10,
    r.roi_on_10_flat,
    null::numeric as game_total_line,
    null::numeric as over_odds,
    null::numeric as under_odds,
    case when r.market_type = 'total' and lower(coalesce(r.side, '')) = 'over' then true else false end as is_total_over_bet,
    case when r.market_type = 'total' and lower(coalesce(r.side, '')) = 'under' then true else false end as is_total_under_bet,
    null::boolean as is_prime_time,
    null::text as broadcast_window,
    case
      when r.is_home_team_bet then r.home_back_to_back
      when r.is_away_team_bet then r.away_back_to_back
      else null::boolean
    end as is_back_to_back,
    r.is_divisional,
    null::numeric as team_win_pct_pre_game,
    null::numeric as opponent_win_pct_pre_game,
    null::boolean as team_above_500_pre_game,
    null::boolean as opponent_above_500_pre_game,
    null::boolean as previous_game_shutout,
    case
      when r.is_home_team_bet then r.home_rest_days
      when r.is_away_team_bet then r.away_rest_days
      else null::integer
    end as days_since_previous_game,
    null::text as previous_team_role,
    null::text as previous_moneyline_result,
    null::text as previous_over_result,
    null::text as previous_under_result,
    r.segment_key,
    (r.market_type like 'spread%') as is_spread_market,
    (r.market_type = 'total' or r.market_type like 'total_%') as is_total_market,
    (r.market_type = 'moneyline') as is_moneyline_market,
    r.build_version,
    now()
  from ranked r
  where r.rn >= p_chunk_start
    and r.rn < p_chunk_start + p_chunk_size;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;