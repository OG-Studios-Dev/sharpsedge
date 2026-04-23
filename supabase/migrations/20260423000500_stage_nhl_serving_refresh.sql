create table if not exists public.ask_goose_nhl_serving_base_v1 (
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
  cached_at timestamptz not null default now()
);

create index if not exists ask_goose_nhl_serving_base_v1_event_date_idx
  on public.ask_goose_nhl_serving_base_v1 (event_date);

create index if not exists ask_goose_nhl_serving_base_v1_team_idx
  on public.ask_goose_nhl_serving_base_v1 (team_name, event_date);

create or replace function public.refresh_ask_goose_nhl_serving_base_v1(
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

  delete from public.ask_goose_nhl_serving_base_v1 s
  where (p_start_date is null or s.event_date >= p_start_date)
    and (p_end_date is null or s.event_date <= p_end_date);

  insert into public.ask_goose_nhl_serving_base_v1 (
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
    now()
  from candidate_base cb;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

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
  perform public.refresh_ask_goose_nhl_serving_base_v1(p_start_date, p_end_date);

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
  select
    sb.candidate_id,
    sb.canonical_game_id,
    sb.event_id,
    sb.league,
    sb.season,
    sb.event_date,
    sb.team_name,
    sb.opponent_name,
    sb.market_type,
    sb.submarket_type,
    sb.market_family,
    sb.market_scope,
    sb.side,
    sb.line,
    sb.odds,
    sb.sportsbook,
    sb.segment_key,
    sb.is_home_team_bet,
    sb.is_away_team_bet,
    sb.is_favorite,
    sb.is_underdog,
    gmr.result,
    case
      when gmr.result in ('win','loss','push','void','cancelled') and gmr.integrity_status in ('ok','void','cancelled') then true
      else false
    end as graded,
    case
      when gmr.result = 'win' and sb.odds > 0 then round((sb.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and sb.odds < 0 then round((100.0 / abs(sb.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_units,
    case
      when gmr.result = 'win' and sb.odds > 0 then round(((sb.odds / 100.0) * 10.0)::numeric, 4)
      when gmr.result = 'win' and sb.odds < 0 then round(((100.0 / abs(sb.odds)) * 10.0)::numeric, 4)
      when gmr.result = 'loss' then -10.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_dollars_10,
    case
      when gmr.result = 'win' and sb.odds > 0 then round((sb.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and sb.odds < 0 then round((100.0 / abs(sb.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as roi_on_10_flat,
    gmr.integrity_status,
    'nhl_serving_v2',
    now()
  from public.ask_goose_nhl_serving_base_v1 sb
  left join public.goose_market_results gmr
    on gmr.candidate_id = sb.candidate_id
  where (p_start_date is null or sb.event_date >= p_start_date)
    and (p_end_date is null or sb.event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;