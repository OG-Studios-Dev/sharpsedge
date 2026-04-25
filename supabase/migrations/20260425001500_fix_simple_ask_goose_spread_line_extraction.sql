create or replace function public.refresh_ask_goose_simple_league_v1(
  p_league text,
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
  v_league text := upper(p_league);
begin
  if v_league not in ('NBA', 'MLB') then
    raise exception 'refresh_ask_goose_simple_league_v1 only supports NBA/MLB for now, got %', p_league;
  end if;

  delete from public.ask_goose_query_layer_v1 q
  where q.league = v_league
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
    segment_key,
    is_spread_market,
    is_total_market,
    is_moneyline_market,
    trends_build_version,
    refreshed_at
  )
  with base as (
    select
      gmc.candidate_id,
      coalesce(gmc.event_id, gme.event_id) as event_id,
      coalesce(gme.event_id, gmc.event_id) as canonical_game_id,
      v_league as sport,
      v_league as league,
      extract(year from coalesce(gmc.event_date, gme.event_date))::int::text as season,
      coalesce(gmc.event_date, gme.event_date)::date as event_date,
      gme.home_team,
      gme.away_team,
      gmc.market_type,
      gmc.submarket_type,
      gmc.participant_name,
      lower(coalesce(gmc.participant_name, '')) as participant_lc,
      lower(coalesce(gmc.side, '')) as side_lc,
      gmc.side,
      case
        when gmc.market_type like '%spread%' and gmc.line is null then coalesce(
          nullif(regexp_replace(coalesce(gmc.raw_payload ->> 'bookSpread', ''), '[^0-9+\.-]', '', 'g'), '')::numeric,
          nullif(regexp_replace(coalesce(gmc.raw_payload ->> 'fairSpread', ''), '[^0-9+\.-]', '', 'g'), '')::numeric,
          nullif(regexp_replace(coalesce(gmc.raw_payload #>> array['byBookmaker', coalesce(gmc.book, gmc.sportsbook, ''), 'spread'], ''), '[^0-9+\.-]', '', 'g'), '')::numeric,
          gmc.line
        )
        else gmc.line
      end as line,
      gmc.odds,
      gmc.sportsbook,
      case
        when gmc.market_type = 'moneyline' then 'moneyline'
        when gmc.market_type like '%spread%' then 'spread'
        when gmc.market_type = 'total' or gmc.market_type like '%total%' then 'total'
        when gmc.market_type like 'player_prop_%' then 'player_prop'
        else 'other'
      end as market_family,
      case
        when gmc.market_type like 'player_prop_%' then 'player'
        when gmc.market_type like 'first_quarter_%' then 'quarter'
        when gmc.market_type like 'first_half_%' then 'half'
        when gmc.market_type in ('moneyline','spread','total') or gmc.market_type like '%spread%' or gmc.market_type like '%total%' then 'game'
        else 'other'
      end as market_scope,
      case
        when lower(coalesce(gmc.participant_name, '')) = lower(coalesce(gme.home_team, '')) then 'home'
        when lower(coalesce(gmc.participant_name, '')) = lower(coalesce(gme.away_team, '')) then 'away'
        when lower(coalesce(gmc.participant_name, '')) = lower(regexp_replace(coalesce(gme.home_team, ''), '^.*\s', '')) then 'home'
        when lower(coalesce(gmc.participant_name, '')) = lower(regexp_replace(coalesce(gme.away_team, ''), '^.*\s', '')) then 'away'
        when lower(coalesce(gmc.side, '')) = 'home' then 'home'
        when lower(coalesce(gmc.side, '')) = 'away' then 'away'
        else null::text
      end as team_role
    from public.goose_market_candidates gmc
    join public.goose_market_events gme
      on gme.event_id = gmc.event_id
     and gme.league = v_league
    where gmc.sport = v_league
      and (p_start_date is null or gmc.event_date >= p_start_date)
      and (p_end_date is null or gmc.event_date <= p_end_date)
      and gmc.market_type not like 'player_prop_%'
      and not (
        gmc.market_type = 'moneyline'
        and lower(coalesce(gmc.participant_name, '')) in ('', 'all', 'draw', 'na')
        and lower(coalesce(gmc.side, '')) in ('draw', 'away-draw', 'home-draw')
      )
      and (
        gmc.market_type = 'moneyline'
        or gmc.market_type like '%spread%'
        or (
          (gmc.market_type = 'total' or gmc.market_type like '%total%')
          and lower(coalesce(gmc.participant_name, '')) in ('', 'all', 'na')
          and lower(coalesce(gmc.side, '')) in ('over', 'under')
        )
      )
  ), shaped as (
    select
      b.*,
      case
        when b.market_family = 'total' then b.home_team
        when b.team_role = 'home' then b.home_team
        when b.team_role = 'away' then b.away_team
        else null::text
      end as team_name,
      case
        when b.market_family = 'total' then b.away_team
        when b.team_role = 'home' then b.away_team
        when b.team_role = 'away' then b.home_team
        else null::text
      end as opponent_name,
      case
        when b.market_family in ('moneyline','spread') then b.team_role
        when b.market_family = 'total' and b.side_lc in ('over','under') then b.side_lc
        else b.side
      end as normalized_side
    from base b
    where b.market_family = 'total' or b.team_role is not null
  )
  select
    s.candidate_id,
    s.canonical_game_id,
    s.event_id,
    s.sport,
    s.league,
    s.season,
    s.event_date,
    s.home_team,
    s.away_team,
    s.team_role,
    s.team_name,
    s.opponent_name,
    s.market_type,
    s.submarket_type,
    s.market_family,
    s.market_scope,
    s.normalized_side,
    s.line,
    s.odds,
    s.sportsbook,
    case
      when s.market_family = 'moneyline' and s.odds < 0 then true
      when s.market_family = 'spread' and s.line < 0 then true
      when s.market_family = 'spread' and s.line is null and s.odds < 0 then true
      else false
    end as is_favorite,
    case
      when s.market_family = 'moneyline' and s.odds > 0 then true
      when s.market_family = 'spread' and s.line > 0 then true
      when s.market_family = 'spread' and s.line is null and s.odds > 0 then true
      else false
    end as is_underdog,
    (s.team_role = 'home') as is_home_team_bet,
    (s.team_role = 'away') as is_away_team_bet,
    (s.team_role = 'home' and ((s.market_family = 'moneyline' and s.odds < 0) or (s.market_family = 'spread' and coalesce(s.line, case when s.odds < 0 then -1 else 1 end) < 0))) as is_home_favorite,
    (s.team_role = 'away' and ((s.market_family = 'moneyline' and s.odds < 0) or (s.market_family = 'spread' and coalesce(s.line, case when s.odds < 0 then -1 else 1 end) < 0))) as is_away_favorite,
    (s.team_role = 'home' and ((s.market_family = 'moneyline' and s.odds > 0) or (s.market_family = 'spread' and coalesce(s.line, case when s.odds > 0 then 1 else -1 end) > 0))) as is_home_underdog,
    (s.team_role = 'away' and ((s.market_family = 'moneyline' and s.odds > 0) or (s.market_family = 'spread' and coalesce(s.line, case when s.odds > 0 then 1 else -1 end) > 0))) as is_road_underdog,
    (s.team_role = 'away' and ((s.market_family = 'moneyline' and s.odds < 0) or (s.market_family = 'spread' and coalesce(s.line, case when s.odds < 0 then -1 else 1 end) < 0))) as is_road_favorite,
    gmr.result,
    case
      when gmr.result in ('win','loss','push','void','cancelled') and coalesce(gmr.integrity_status, 'ok') in ('ok','void','cancelled') then true
      else false
    end as graded,
    gmr.integrity_status,
    case
      when gmr.result = 'win' and s.odds > 0 then round((s.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and s.odds < 0 then round((100.0 / abs(s.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_units,
    case
      when gmr.result = 'win' and s.odds > 0 then round(((s.odds / 100.0) * 10.0)::numeric, 4)
      when gmr.result = 'win' and s.odds < 0 then round(((100.0 / abs(s.odds)) * 10.0)::numeric, 4)
      when gmr.result = 'loss' then -10.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_dollars_10,
    case
      when gmr.result = 'win' and s.odds > 0 then round((s.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and s.odds < 0 then round((100.0 / abs(s.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as roi_on_10_flat,
    null::text as segment_key,
    (s.market_family = 'spread') as is_spread_market,
    (s.market_family = 'total') as is_total_market,
    (s.market_family = 'moneyline') as is_moneyline_market,
    'simple_league_v1_spread_line_extraction',
    now()
  from shaped s
  left join public.goose_market_results gmr
    on gmr.candidate_id = s.candidate_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
