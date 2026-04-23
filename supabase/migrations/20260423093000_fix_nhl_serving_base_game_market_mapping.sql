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
      lower(coalesce(gmc.participant_name, '')) as participant_name_lc,
      lower(coalesce(gmc.side, '')) as side_lc,
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
        when (gmc.market_type = 'moneyline' or gmc.market_type like 'spread%') and lower(coalesce(gmc.participant_name, '')) in ('', 'all', 'draw', 'na') and lower(coalesce(gmc.side, '')) in ('home', 'away') then lower(gmc.side)
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
      when cb.market_family = 'total' then cb.home_team
      else cb.participant_name
    end as team_name,
    case
      when cb.team_role = 'home' then cb.away_team
      when cb.team_role = 'away' then cb.home_team
      when cb.market_family = 'total' then cb.away_team
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
  from candidate_base cb
  where not (
    cb.market_scope = 'game'
    and cb.market_family in ('moneyline', 'spread')
    and cb.team_role is null
  );

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
