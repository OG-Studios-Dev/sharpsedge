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
        when lower(coalesce(gmc.participant_name, '')) = lower(regexp_replace(coalesce(agc.home_team, ''), '^.*\\s', '')) then 'home'
        when lower(coalesce(gmc.participant_name, '')) = lower(regexp_replace(coalesce(agc.away_team, ''), '^.*\\s', '')) then 'away'
        when gmc.market_type = 'moneyline' and lower(coalesce(gmc.side, '')) = lower(coalesce(agc.home_team, '')) then 'home'
        when gmc.market_type = 'moneyline' and lower(coalesce(gmc.side, '')) = lower(coalesce(agc.away_team, '')) then 'away'
        when (gmc.market_type = 'moneyline' or gmc.market_type like 'spread%')
          and lower(coalesce(gmc.participant_name, '')) in ('', 'all', 'draw', 'na')
          and lower(coalesce(gmc.side, '')) in ('home', 'away')
          then lower(gmc.side)
        else null::text
      end as team_role,
      case
        when gmc.market_type = 'moneyline' and lower(coalesce(gmc.side, '')) = lower(coalesce(agc.home_team, '')) then 'home'
        when gmc.market_type = 'moneyline' and lower(coalesce(gmc.side, '')) = lower(coalesce(agc.away_team, '')) then 'away'
        when gmc.market_type = 'moneyline'
          and lower(coalesce(gmc.participant_name, '')) in ('', 'all', 'draw', 'na')
          and lower(coalesce(gmc.side, '')) in ('home', 'away')
          then lower(gmc.side)
        when gmc.market_type = 'moneyline'
          and lower(coalesce(gmc.side, '')) in ('home', 'away')
          then lower(gmc.side)
        when gmc.market_type = 'moneyline'
          and lower(coalesce(gmc.side, '')) in ('draw', 'away-draw', 'home-draw')
          then null::text
        else gmc.side
      end as normalized_side
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
      and not (
        gmc.market_type = 'moneyline'
        and lower(coalesce(gmc.participant_name, '')) in ('', 'all', 'draw', 'na')
        and lower(coalesce(gmc.side, '')) in ('draw', 'away-draw', 'home-draw')
      )
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
    cb.normalized_side as side,
    cb.line,
    cb.odds,
    cb.sportsbook,
    null::text as segment_key,
    (cb.team_role = 'home') as is_home_team_bet,
    (cb.team_role = 'away') as is_away_team_bet,
    case
      when cb.market_type = 'moneyline' and cb.odds < 0 then true
      when cb.market_type like 'spread%' and cb.line < 0 then true
      when cb.market_type like 'spread%' and cb.line is null and cb.odds < 0 then true
      else false
    end as is_favorite,
    case
      when cb.market_type = 'moneyline' and cb.odds > 0 then true
      when cb.market_type like 'spread%' and cb.line > 0 then true
      when cb.market_type like 'spread%' and cb.line is null and cb.odds > 0 then true
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
    'nhl_serving_v2_spread_odds_fallback',
    now()
  from candidate_base cb
  left join public.goose_market_results gmr
    on gmr.candidate_id = cb.candidate_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;