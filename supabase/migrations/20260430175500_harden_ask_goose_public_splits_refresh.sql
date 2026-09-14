-- Harden Ask Goose public split refresh wiring.
-- Fixes two issues found in the public-splits audit:
-- 1) batch refreshes repopulated ask_goose_query_layer_v1 but did not re-join public splits,
--    so public_bets_pct/public_handle_pct could be wiped back to null after any serving refresh;
-- 2) the split join used market_family, which can leak full-game split data into derived period
--    markets such as first_quarter_spread. Public split rows only describe full-game ML/spread/total.

create or replace function public.refresh_ask_goose_public_splits_v1(
  p_league text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  -- Clear the target window first so stale/previously over-broad matches do not survive
  -- when the join logic becomes more conservative.
  update public.ask_goose_query_layer_v1 q
  set
    public_bets_pct = null,
    public_handle_pct = null,
    public_split_source = null,
    public_split_snapshot_at = null
  where (p_league is null or q.league = p_league)
    and (p_start_date is null or q.event_date >= p_start_date)
    and (p_end_date is null or q.event_date <= p_end_date)
    and (
      q.public_bets_pct is not null
      or q.public_handle_pct is not null
      or q.public_split_source is not null
      or q.public_split_snapshot_at is not null
    );

  with split_ranked as (
    select
      s.*,
      regexp_replace(lower(coalesce(s.home_team_name, s.home_team_abbrev, '')), '[^a-z0-9]+', '', 'g') as s_home_norm,
      regexp_replace(lower(coalesce(s.away_team_name, s.away_team_abbrev, '')), '[^a-z0-9]+', '', 'g') as s_away_norm,
      row_number() over (
        partition by s.league, s.game_date, s.home_team_name, s.away_team_name, s.market_type, s.side
        order by
          coalesce(s.is_primary, false) desc,
          case lower(coalesce(s.source, ''))
            when 'action-network-dk' then 1
            when 'action-network-fd' then 2
            else 9
          end,
          s.snapshot_at desc,
          s.id desc
      ) as rn
    from public.public_betting_splits_v1 s
    where (p_league is null or s.league = p_league)
      and (p_start_date is null or s.game_date >= p_start_date)
      and (p_end_date is null or s.game_date <= p_end_date)
      and s.market_type in ('moneyline', 'spread', 'total')
      and s.bets_percent is not null
      and s.handle_percent is not null
  ),
  splits as (
    select * from split_ranked where rn = 1
  ),
  query_rows as (
    select
      q.*,
      regexp_replace(lower(coalesce(q.home_team, '')), '[^a-z0-9]+', '', 'g') as q_home_norm,
      regexp_replace(lower(coalesce(q.away_team, '')), '[^a-z0-9]+', '', 'g') as q_away_norm
    from public.ask_goose_query_layer_v1 q
    where (p_league is null or q.league = p_league)
      and (p_start_date is null or q.event_date >= p_start_date)
      and (p_end_date is null or q.event_date <= p_end_date)
      -- Public split sources are full-game only. Do not attach them to period/quarter/half props.
      and lower(coalesce(q.market_type, '')) in ('moneyline', 'spread', 'total')
      and coalesce(q.home_team, '') <> ''
      and coalesce(q.away_team, '') <> ''
  ),
  matched as (
    select
      q.candidate_id,
      s.bets_percent,
      s.handle_percent,
      s.source,
      s.snapshot_at
    from query_rows q
    join splits s
      on s.league = q.league
     and s.game_date = q.event_date
     and s.market_type = lower(q.market_type)
     and (
       (
         s.market_type = 'total'
         and lower(coalesce(q.side, '')) like '%' || s.side || '%'
         and (
           (s.s_home_norm like '%' || q.q_home_norm || '%' and s.s_away_norm like '%' || q.q_away_norm || '%')
           or
           (s.s_home_norm like '%' || q.q_away_norm || '%' and s.s_away_norm like '%' || q.q_home_norm || '%')
         )
       )
       or
       (
         s.market_type in ('moneyline', 'spread')
         and lower(coalesce(q.team_role, '')) = s.side
         and s.s_home_norm like '%' || q.q_home_norm || '%'
         and s.s_away_norm like '%' || q.q_away_norm || '%'
       )
     )
  )
  update public.ask_goose_query_layer_v1 q
  set
    public_bets_pct = m.bets_percent,
    public_handle_pct = m.handle_percent,
    public_split_source = m.source,
    public_split_snapshot_at = m.snapshot_at
  from matched m
  where q.candidate_id = m.candidate_id;

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

  -- Rehydrate public splits after the serving-layer delete/insert cycle.
  perform public.refresh_ask_goose_public_splits_v1(p_league, p_start_date, p_end_date);

  return v_rows;
end;
$$;
