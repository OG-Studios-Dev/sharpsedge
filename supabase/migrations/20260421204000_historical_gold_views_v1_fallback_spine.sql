create or replace view public.dim_historical_games_v1 as
with canonical_spine as (
  select
    cg.canonical_game_id,
    cg.sport,
    cg.league,
    cg.event_date,
    cg.scheduled_start,
    cg.home_team,
    cg.away_team,
    cg.home_team_key,
    cg.away_team_key,
    null::text as home_team_id,
    null::text as away_team_id,
    cg.source_event_ids,
    cg.identity_confidence
  from public.canonical_games cg

  union all

  select
    gme.event_id as canonical_game_id,
    gme.sport,
    gme.league,
    gme.event_date,
    gme.commence_time as scheduled_start,
    gme.home_team,
    gme.away_team,
    null::text as home_team_key,
    null::text as away_team_key,
    gme.home_team_id,
    gme.away_team_id,
    case
      when gme.odds_api_event_id is not null then to_jsonb(array[gme.odds_api_event_id])
      else '[]'::jsonb
    end as source_event_ids,
    null::numeric as identity_confidence
  from public.goose_market_events gme
  where not exists (
    select 1
    from public.canonical_games cg
    where cg.canonical_game_id = gme.event_id
  )
),
ranked_spine as (
  select
    cs.*,
    row_number() over (
      partition by cs.canonical_game_id
      order by
        case when cs.identity_confidence is not null then 0 else 1 end,
        case when cs.home_team_id is not null and cs.away_team_id is not null then 0 else 1 end,
        cs.scheduled_start desc nulls last,
        cs.canonical_game_id
    ) as rn
  from canonical_spine cs
)
select
  rs.canonical_game_id,
  rs.sport,
  rs.league,
  case
    when rs.league = 'MLB' then extract(year from rs.event_date)::int::text
    when rs.league = 'NFL' then (
      case
        when extract(month from rs.event_date) >= 8 then extract(year from rs.event_date)::int
        else extract(year from rs.event_date)::int - 1
      end
    )::text
    when rs.league in ('NBA', 'NHL') then concat(
      case
        when extract(month from rs.event_date) >= 7 then extract(year from rs.event_date)::int
        else extract(year from rs.event_date)::int - 1
      end,
      '-',
      right((
        case
          when extract(month from rs.event_date) >= 7 then extract(year from rs.event_date)::int + 1
          else extract(year from rs.event_date)::int
        end
      )::text, 2)
    )
    else extract(year from rs.event_date)::int::text
  end as season,
  case
    when rs.league = 'MLB' then extract(year from rs.event_date)::int
    when rs.league = 'NFL' then case
      when extract(month from rs.event_date) >= 8 then extract(year from rs.event_date)::int
      else extract(year from rs.event_date)::int - 1
    end
    when rs.league in ('NBA', 'NHL') then case
      when extract(month from rs.event_date) >= 7 then extract(year from rs.event_date)::int
      else extract(year from rs.event_date)::int - 1
    end
    else extract(year from rs.event_date)::int
  end as season_year,
  rs.event_date,
  rs.scheduled_start,
  rs.home_team,
  rs.away_team,
  rs.home_team_key,
  rs.away_team_key,
  rs.home_team_id,
  rs.away_team_id,
  rs.source_event_ids,
  rs.identity_confidence,
  null::boolean as is_divisional,
  null::integer as home_rest_days,
  null::integer as away_rest_days,
  null::boolean as home_back_to_back,
  null::boolean as away_back_to_back,
  'v1'::text as build_version
from ranked_spine rs
where rs.rn = 1;
