create table if not exists public.ask_goose_nhl_serving_source_v2 (
  candidate_id text primary key,
  canonical_game_id text,
  event_id text,
  league text,
  season text,
  event_date date,
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
  segment_key text,
  is_home_team_bet boolean,
  is_away_team_bet boolean,
  is_favorite boolean,
  is_underdog boolean,
  result text,
  graded boolean,
  profit_units numeric,
  profit_dollars_10 numeric,
  roi_on_10_flat numeric,
  integrity_status text,
  build_version text not null default 'nhl_serving_v2',
  cached_at timestamptz not null default now()
);

create index if not exists ask_goose_nhl_serving_source_v2_event_date_idx
  on public.ask_goose_nhl_serving_source_v2 (event_date);

create index if not exists ask_goose_nhl_serving_source_v2_team_idx
  on public.ask_goose_nhl_serving_source_v2 (team_name, event_date);

create index if not exists ask_goose_nhl_serving_source_v2_opponent_idx
  on public.ask_goose_nhl_serving_source_v2 (opponent_name, event_date);

create index if not exists ask_goose_nhl_serving_source_v2_market_idx
  on public.ask_goose_nhl_serving_source_v2 (market_type, market_family, market_scope);

create index if not exists ask_goose_nhl_serving_source_v2_profit_idx
  on public.ask_goose_nhl_serving_source_v2 (graded, result);

create index if not exists ask_goose_nhl_serving_source_v2_fav_dog_idx
  on public.ask_goose_nhl_serving_source_v2 (is_favorite, is_underdog, event_date);

create or replace function public.refresh_ask_goose_nhl_serving_source_v2(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  perform public.refresh_ask_goose_event_bridge_v1('NHL', p_start_date, p_end_date);
  perform public.refresh_ask_goose_game_context_v1('NHL', p_start_date, p_end_date);

  delete from public.ask_goose_nhl_serving_source_v2 s
  where (p_start_date is null or s.event_date >= p_start_date)
    and (p_end_date is null or s.event_date <= p_end_date);

  insert into public.ask_goose_nhl_serving_source_v2 (
    candidate_id,
    canonical_game_id,
    event_id,
    league,
    season,
    event_date,
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
    segment_key,
    is_home_team_bet,
    is_away_team_bet,
    is_favorite,
    is_underdog,
    result,
    graded,
    profit_units,
    profit_dollars_10,
    roi_on_10_flat,
    integrity_status,
    build_version,
    cached_at
  )
  with candidate_base as (
    select
      gmc.candidate_id,
      gmc.event_id,
      agb.canonical_game_id,
      agc.league,
      agc.season,
      gmc.event_date,
      agc.home_team,
      agc.away_team,
      gmc.market_type,
      gmc.submarket_type,
      gmc.participant_name,
      gmc.side,
      gmc.line,
      gmc.odds,
      gmc.sportsbook,
      case
        when gmc.market_type = 'moneyline' then 'moneyline'
        when gmc.market_type like 'spread%' then 'spread'
        when gmc.market_type = 'total' or gmc.market_type like 'total_%' then 'total'
        when gmc.market_type like 'player_prop_%' then 'player_prop'
        else 'other'
      end as market_family,
      case
        when gmc.market_type like 'player_prop_%' then 'player'
        when gmc.market_type in ('moneyline', 'spread', 'total') or gmc.market_type like 'spread%' or gmc.market_type like 'total_%' then 'game'
        else 'other'
      end as market_scope,
      case
        when lower(coalesce(gmc.participant_name, '')) = lower(coalesce(agc.home_team, '')) then 'home'
        when lower(coalesce(gmc.participant_name, '')) = lower(coalesce(agc.away_team, '')) then 'away'
        else null::text
      end as team_role
    from public.ask_goose_nhl_candidate_cache_v1 gmc
    join public.goose_market_events gme
      on gme.event_id = gmc.event_id
    join public.ask_goose_event_bridge_v1 agb
      on agb.event_id = gmc.event_id
     and agb.league = 'NHL'
    join public.ask_goose_game_context_v1 agc
      on agc.canonical_game_id = agb.canonical_game_id
     and agc.league = 'NHL'
    where gmc.sport = 'NHL'
      and gme.league = 'NHL'
      and (p_start_date is null or gmc.event_date >= p_start_date)
      and (p_end_date is null or gmc.event_date <= p_end_date)
  )
  select
    cb.candidate_id,
    cb.canonical_game_id,
    cb.event_id,
    cb.league,
    cb.season,
    cb.event_date,
    case
      when cb.team_role = 'home' then cb.home_team
      when cb.team_role = 'away' then cb.away_team
      else cb.participant_name
    end as team_name,
    case
      when cb.team_role = 'home' then cb.away_team
      when cb.team_role = 'away' then cb.home_team
      else null::text
    end as opponent_name,
    cb.market_type,
    cb.submarket_type,
    cb.market_family,
    cb.market_scope,
    cb.side,
    cb.line,
    cb.odds,
    cb.sportsbook,
    null::text as segment_key,
    (cb.team_role = 'home') as is_home_team_bet,
    (cb.team_role = 'away') as is_away_team_bet,
    case
      when cb.market_type = 'moneyline' and cb.odds < 0 then true
      when cb.market_type like 'spread%' and cb.line < 0 then true
      else false
    end as is_favorite,
    case
      when cb.market_type = 'moneyline' and cb.odds > 0 then true
      when cb.market_type like 'spread%' and cb.line > 0 then true
      else false
    end as is_underdog,
    gmr.result,
    case
      when gmr.result in ('win','loss','push','void','cancelled') and gmr.integrity_status in ('ok','void','cancelled') then true
      else false
    end as graded,
    case
      when gmr.result = 'win' and cb.odds > 0 then round((cb.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and cb.odds < 0 then round((100.0 / abs(cb.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_units,
    case
      when gmr.result = 'win' and cb.odds > 0 then round(((cb.odds / 100.0) * 10.0)::numeric, 4)
      when gmr.result = 'win' and cb.odds < 0 then round(((100.0 / abs(cb.odds)) * 10.0)::numeric, 4)
      when gmr.result = 'loss' then -10.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_dollars_10,
    case
      when gmr.result = 'win' and cb.odds > 0 then round((cb.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and cb.odds < 0 then round((100.0 / abs(cb.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as roi_on_10_flat,
    gmr.integrity_status,
    'nhl_serving_v2',
    now()
  from candidate_base cb
  left join public.goose_market_results gmr
    on gmr.candidate_id = cb.candidate_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

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
