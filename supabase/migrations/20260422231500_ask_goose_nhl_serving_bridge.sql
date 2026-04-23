create table if not exists public.ask_goose_event_bridge_v1 (
  event_id text primary key,
  odds_api_event_id text,
  canonical_game_id text not null,
  sport text not null,
  league text not null,
  event_date date not null,
  mapping_source text not null,
  mapping_confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ask_goose_event_bridge_v1_canonical_game_idx
  on public.ask_goose_event_bridge_v1 (canonical_game_id);

create index if not exists ask_goose_event_bridge_v1_league_date_idx
  on public.ask_goose_event_bridge_v1 (league, event_date);

create index if not exists ask_goose_event_bridge_v1_odds_api_idx
  on public.ask_goose_event_bridge_v1 (odds_api_event_id)
  where odds_api_event_id is not null;

create table if not exists public.ask_goose_game_context_v1 (
  canonical_game_id text primary key,
  sport text not null,
  league text not null,
  season text,
  event_date date not null,
  home_team text,
  away_team text,
  home_team_id text,
  away_team_id text,
  is_divisional boolean,
  home_rest_days integer,
  away_rest_days integer,
  home_back_to_back boolean,
  away_back_to_back boolean,
  build_version text not null default 'v1',
  refreshed_at timestamptz not null default now()
);

create index if not exists ask_goose_game_context_v1_league_date_idx
  on public.ask_goose_game_context_v1 (league, event_date);

create index if not exists ask_goose_game_context_v1_season_league_idx
  on public.ask_goose_game_context_v1 (season, league);

create or replace function public.refresh_ask_goose_event_bridge_v1(
  p_league text default 'NHL',
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  delete from public.ask_goose_event_bridge_v1 b
  where (p_league is null or b.league = p_league)
    and (p_start_date is null or b.event_date >= p_start_date)
    and (p_end_date is null or b.event_date <= p_end_date);

  insert into public.ask_goose_event_bridge_v1 (
    event_id,
    odds_api_event_id,
    canonical_game_id,
    sport,
    league,
    event_date,
    mapping_source,
    mapping_confidence,
    created_at,
    updated_at
  )
  with direct_matches as (
    select
      gme.event_id,
      gme.odds_api_event_id,
      cg.canonical_game_id,
      cg.sport,
      cg.league,
      cg.event_date,
      'canonical_direct'::text as mapping_source,
      1.0::numeric as mapping_confidence,
      row_number() over (
        partition by gme.event_id
        order by cg.canonical_game_id
      ) as rn
    from public.goose_market_events gme
    join public.canonical_games cg
      on cg.canonical_game_id = gme.event_id
    where (p_league is null or gme.league = p_league)
      and (p_start_date is null or cg.event_date >= p_start_date)
      and (p_end_date is null or cg.event_date <= p_end_date)
  ),
  source_id_matches as (
    select
      gme.event_id,
      gme.odds_api_event_id,
      cg.canonical_game_id,
      cg.sport,
      cg.league,
      cg.event_date,
      'odds_api_source_event_id'::text as mapping_source,
      0.95::numeric as mapping_confidence,
      row_number() over (
        partition by gme.event_id
        order by cg.event_date desc, cg.canonical_game_id
      ) as rn
    from public.goose_market_events gme
    join public.canonical_games cg
      on gme.odds_api_event_id is not null
     and cg.source_event_ids @> to_jsonb(array[gme.odds_api_event_id])
    where (p_league is null or gme.league = p_league)
      and (p_start_date is null or cg.event_date >= p_start_date)
      and (p_end_date is null or cg.event_date <= p_end_date)
  ),
  bridged as (
    select * from direct_matches where rn = 1
    union all
    select * from source_id_matches where rn = 1
      and not exists (
        select 1
        from direct_matches d
        where d.rn = 1
          and d.event_id = source_id_matches.event_id
      )
  )
  select
    event_id,
    odds_api_event_id,
    canonical_game_id,
    sport,
    league,
    event_date,
    mapping_source,
    mapping_confidence,
    now(),
    now()
  from bridged;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

create or replace function public.refresh_ask_goose_game_context_v1(
  p_league text default 'NHL',
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  delete from public.ask_goose_game_context_v1 gc
  where (p_league is null or gc.league = p_league)
    and (p_start_date is null or gc.event_date >= p_start_date)
    and (p_end_date is null or gc.event_date <= p_end_date);

  insert into public.ask_goose_game_context_v1 (
    canonical_game_id,
    sport,
    league,
    season,
    event_date,
    home_team,
    away_team,
    home_team_id,
    away_team_id,
    is_divisional,
    home_rest_days,
    away_rest_days,
    home_back_to_back,
    away_back_to_back,
    build_version,
    refreshed_at
  )
  select
    dhg.canonical_game_id,
    dhg.sport,
    dhg.league,
    dhg.season,
    dhg.event_date,
    dhg.home_team,
    dhg.away_team,
    dhg.home_team_id,
    dhg.away_team_id,
    dhg.is_divisional,
    dhg.home_rest_days,
    dhg.away_rest_days,
    dhg.home_back_to_back,
    dhg.away_back_to_back,
    dhg.build_version,
    now()
  from public.dim_historical_games_v1 dhg
  where (p_league is null or dhg.league = p_league)
    and (p_start_date is null or dhg.event_date >= p_start_date)
    and (p_end_date is null or dhg.event_date <= p_end_date)
  on conflict (canonical_game_id) do update set
    sport = excluded.sport,
    league = excluded.league,
    season = excluded.season,
    event_date = excluded.event_date,
    home_team = excluded.home_team,
    away_team = excluded.away_team,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    is_divisional = excluded.is_divisional,
    home_rest_days = excluded.home_rest_days,
    away_rest_days = excluded.away_rest_days,
    home_back_to_back = excluded.home_back_to_back,
    away_back_to_back = excluded.away_back_to_back,
    build_version = excluded.build_version,
    refreshed_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
