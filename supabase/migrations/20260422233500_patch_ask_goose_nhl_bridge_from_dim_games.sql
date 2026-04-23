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
  with nhl_events as (
    select
      gme.event_id,
      gme.odds_api_event_id,
      gme.league,
      gme.event_date,
      lower(split_part(split_part(gme.event_id, ':', 4), '@', 1)) as away_slug,
      lower(split_part(split_part(gme.event_id, ':', 4), '@', 2)) as home_slug
    from public.goose_market_events gme
    where (p_league is null or gme.league = p_league)
      and (p_start_date is null or gme.event_date >= p_start_date)
      and (p_end_date is null or gme.event_date <= p_end_date)
  ),
  dim_games as (
    select
      dhg.canonical_game_id,
      dhg.sport,
      dhg.league,
      dhg.event_date,
      lower(replace(replace(replace(dhg.home_team, ' ', '-'), '.', ''), '&', 'and')) as home_slug,
      lower(replace(replace(replace(dhg.away_team, ' ', '-'), '.', ''), '&', 'and')) as away_slug
    from public.dim_historical_games_v1 dhg
    where (p_league is null or dhg.league = p_league)
      and (p_start_date is null or dhg.event_date >= p_start_date)
      and (p_end_date is null or dhg.event_date <= p_end_date)
  ),
  matched as (
    select
      e.event_id,
      e.odds_api_event_id,
      d.canonical_game_id,
      d.sport,
      d.league,
      d.event_date,
      'dim_games_slug_date_match'::text as mapping_source,
      0.90::numeric as mapping_confidence,
      row_number() over (
        partition by e.event_id
        order by d.canonical_game_id
      ) as rn
    from nhl_events e
    join dim_games d
      on d.event_date = e.event_date
     and d.home_slug like '%' || e.home_slug || '%'
     and d.away_slug like '%' || e.away_slug || '%'
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
  from matched
  where rn = 1;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
