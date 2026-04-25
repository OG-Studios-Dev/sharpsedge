create or replace function public.refresh_ask_goose_nfl_simple_v1(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  delete from public.ask_goose_query_layer_v1 q
  where q.league = 'NFL'
    and (p_start_date is null or q.event_date >= p_start_date)
    and (p_end_date is null or q.event_date <= p_end_date);

  insert into public.ask_goose_query_layer_v1 (
    candidate_id, canonical_game_id, event_id, sport, league, season, event_date,
    home_team, away_team, team_role, team_name, opponent_name,
    market_type, submarket_type, market_family, market_scope, side, line, odds, sportsbook,
    is_favorite, is_underdog, is_home_team_bet, is_away_team_bet,
    is_home_favorite, is_away_favorite, is_home_underdog, is_road_underdog, is_road_favorite,
    result, graded, integrity_status, profit_units, profit_dollars_10, roi_on_10_flat,
    segment_key, is_spread_market, is_total_market, is_moneyline_market,
    trends_build_version, refreshed_at
  )
  with base as (
    select
      gmc.candidate_id,
      coalesce(gmc.event_id, gme.event_id) as event_id,
      coalesce(gme.event_id, gmc.event_id) as canonical_game_id,
      'NFL'::text as sport,
      'NFL'::text as league,
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
          gmc.line
        )
        else gmc.line
      end as line,
      gmc.odds,
      coalesce(gmc.sportsbook, gmc.book) as sportsbook,
      case
        when gmc.market_type = 'moneyline' then 'moneyline'
        when gmc.market_type like '%spread%' then 'spread'
        when gmc.market_type = 'total' or gmc.market_type like '%total%' then 'total'
        else 'other'
      end as market_family,
      case
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
     and gme.league = 'NFL'
    where gmc.sport = 'NFL'
      and (p_start_date is null or gmc.event_date >= p_start_date)
      and (p_end_date is null or gmc.event_date <= p_end_date)
      and gmc.market_type not like 'player_prop_%'
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
      case when b.market_family = 'total' then b.home_team when b.team_role = 'home' then b.home_team when b.team_role = 'away' then b.away_team else null::text end as team_name,
      case when b.market_family = 'total' then b.away_team when b.team_role = 'home' then b.away_team when b.team_role = 'away' then b.home_team else null::text end as opponent_name,
      case when b.market_family in ('moneyline','spread') then b.team_role when b.market_family = 'total' and b.side_lc in ('over','under') then b.side_lc else b.side end as normalized_side
    from base b
    where b.market_family = 'total' or b.team_role is not null
  )
  select
    s.candidate_id, s.canonical_game_id, s.event_id, s.sport, s.league, s.season, s.event_date,
    s.home_team, s.away_team, s.team_role, s.team_name, s.opponent_name,
    s.market_type, s.submarket_type, s.market_family, s.market_scope, s.normalized_side, s.line, s.odds, s.sportsbook,
    case when s.market_family = 'moneyline' and s.odds < 0 then true when s.market_family = 'spread' and s.line < 0 then true else false end,
    case when s.market_family = 'moneyline' and s.odds > 0 then true when s.market_family = 'spread' and s.line > 0 then true else false end,
    (s.team_role = 'home'), (s.team_role = 'away'),
    (s.team_role = 'home' and ((s.market_family = 'moneyline' and s.odds < 0) or (s.market_family = 'spread' and s.line < 0))),
    (s.team_role = 'away' and ((s.market_family = 'moneyline' and s.odds < 0) or (s.market_family = 'spread' and s.line < 0))),
    (s.team_role = 'home' and ((s.market_family = 'moneyline' and s.odds > 0) or (s.market_family = 'spread' and s.line > 0))),
    (s.team_role = 'away' and ((s.market_family = 'moneyline' and s.odds > 0) or (s.market_family = 'spread' and s.line > 0))),
    (s.team_role = 'away' and ((s.market_family = 'moneyline' and s.odds < 0) or (s.market_family = 'spread' and s.line < 0))),
    gmr.result,
    case when gmr.result in ('win','loss','push','void','cancelled') and coalesce(gmr.integrity_status, 'ok') in ('ok','void','cancelled') then true else false end,
    gmr.integrity_status,
    case when gmr.result = 'win' and s.odds > 0 then round((s.odds / 100.0)::numeric, 4) when gmr.result = 'win' and s.odds < 0 then round((100.0 / abs(s.odds))::numeric, 4) when gmr.result = 'loss' then -1.0 when gmr.result in ('push','void','cancelled') then 0.0 else null::numeric end,
    case when gmr.result = 'win' and s.odds > 0 then round(((s.odds / 100.0) * 10.0)::numeric, 4) when gmr.result = 'win' and s.odds < 0 then round(((100.0 / abs(s.odds)) * 10.0)::numeric, 4) when gmr.result = 'loss' then -10.0 when gmr.result in ('push','void','cancelled') then 0.0 else null::numeric end,
    case when gmr.result = 'win' and s.odds > 0 then round((s.odds / 100.0)::numeric, 4) when gmr.result = 'win' and s.odds < 0 then round((100.0 / abs(s.odds))::numeric, 4) when gmr.result = 'loss' then -1.0 when gmr.result in ('push','void','cancelled') then 0.0 else null::numeric end,
    null::text,
    (s.market_family = 'spread'), (s.market_family = 'total'), (s.market_family = 'moneyline'),
    'nfl_simple_v1', now()
  from shaped s
  left join public.goose_market_results gmr on gmr.candidate_id = s.candidate_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
