create or replace function public.refresh_ask_goose_nhl_source_cache_v1(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer;
begin
  delete from public.ask_goose_nhl_source_cache_v1
  where (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  insert into public.ask_goose_nhl_source_cache_v1 (
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
    trends_build_version, cached_at
  )
  with candidate_base as (
    select
      gmc.candidate_id,
      gmc.event_id,
      gmc.sport,
      gme.league,
      dhg.season,
      gmc.event_date,
      dhg.canonical_game_id,
      dhg.home_team,
      dhg.away_team,
      dhg.is_divisional,
      dhg.home_rest_days,
      dhg.away_rest_days,
      dhg.home_back_to_back,
      dhg.away_back_to_back,
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
        when lower(coalesce(gmc.participant_name, '')) = lower(coalesce(dhg.home_team, '')) then 'home'
        when lower(coalesce(gmc.participant_name, '')) = lower(coalesce(dhg.away_team, '')) then 'away'
        else null::text
      end as team_role
    from public.goose_market_candidates gmc
    join public.goose_market_events gme
      on gme.event_id = gmc.event_id
    left join public.dim_historical_games_v1 dhg
      on dhg.canonical_game_id = gmc.event_id
         or dhg.source_event_ids @> to_jsonb(array[gmc.event_id])
    where gmc.sport = 'NHL'
      and gme.league = 'NHL'
      and (p_start_date is null or gmc.event_date >= p_start_date)
      and (p_end_date is null or gmc.event_date <= p_end_date)
  ),
  deduped as (
    select *
    from (
      select
        cb.*,
        row_number() over (
          partition by cb.candidate_id
          order by case when cb.canonical_game_id = cb.event_id then 0 else 1 end, cb.canonical_game_id nulls last
        ) as rn
      from candidate_base cb
    ) ranked
    where rn = 1
  )
  select
    d.candidate_id,
    d.canonical_game_id,
    d.event_id,
    d.sport,
    d.league,
    d.season,
    d.event_date,
    d.home_team,
    d.away_team,
    d.team_role,
    case
      when d.team_role = 'home' then d.home_team
      when d.team_role = 'away' then d.away_team
      else d.participant_name
    end as team_name,
    case
      when d.team_role = 'home' then d.away_team
      when d.team_role = 'away' then d.home_team
      else null::text
    end as opponent_name,
    d.market_type,
    d.submarket_type,
    d.market_family,
    d.market_scope,
    d.side,
    d.line,
    d.odds,
    d.sportsbook,
    case when d.market_type in ('moneyline') and d.odds < 0 then true when d.market_type like 'spread%' and d.line < 0 then true else false end as is_favorite,
    case when d.market_type in ('moneyline') and d.odds > 0 then true when d.market_type like 'spread%' and d.line > 0 then true else false end as is_underdog,
    (d.team_role = 'home') as is_home_team_bet,
    (d.team_role = 'away') as is_away_team_bet,
    case when d.team_role = 'home' and ((d.market_type = 'moneyline' and d.odds < 0) or (d.market_type like 'spread%' and d.line < 0)) then true else false end as is_home_favorite,
    case when d.team_role = 'away' and ((d.market_type = 'moneyline' and d.odds < 0) or (d.market_type like 'spread%' and d.line < 0)) then true else false end as is_away_favorite,
    case when d.team_role = 'home' and ((d.market_type = 'moneyline' and d.odds > 0) or (d.market_type like 'spread%' and d.line > 0)) then true else false end as is_home_underdog,
    case when d.team_role = 'away' and ((d.market_type = 'moneyline' and d.odds > 0) or (d.market_type like 'spread%' and d.line > 0)) then true else false end as is_road_underdog,
    case when d.team_role = 'away' and ((d.market_type = 'moneyline' and d.odds < 0) or (d.market_type like 'spread%' and d.line < 0)) then true else false end as is_road_favorite,
    gmr.result,
    case
      when gmr.result in ('win','loss','push','void','cancelled') and gmr.integrity_status in ('ok','void','cancelled') then true
      else false
    end as graded,
    gmr.integrity_status,
    case
      when gmr.result = 'win' and d.odds > 0 then round((d.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and d.odds < 0 then round((100.0 / abs(d.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_units,
    case
      when gmr.result = 'win' and d.odds > 0 then round(((d.odds / 100.0) * 10.0)::numeric, 4)
      when gmr.result = 'win' and d.odds < 0 then round(((100.0 / abs(d.odds)) * 10.0)::numeric, 4)
      when gmr.result = 'loss' then -10.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as profit_dollars_10,
    case
      when gmr.result = 'win' and d.odds > 0 then round((d.odds / 100.0)::numeric, 4)
      when gmr.result = 'win' and d.odds < 0 then round((100.0 / abs(d.odds))::numeric, 4)
      when gmr.result = 'loss' then -1.0
      when gmr.result in ('push','void','cancelled') then 0.0
      else null::numeric
    end as roi_on_10_flat,
    null::numeric as game_total_line,
    null::numeric as over_odds,
    null::numeric as under_odds,
    case when d.market_type = 'total' and lower(d.side) = 'over' then true else false end as is_total_over_bet,
    case when d.market_type = 'total' and lower(d.side) = 'under' then true else false end as is_total_under_bet,
    null::boolean as is_prime_time,
    null::text as broadcast_window,
    case when d.team_role = 'home' then d.home_back_to_back when d.team_role = 'away' then d.away_back_to_back else null::boolean end as is_back_to_back,
    d.is_divisional as is_divisional_game,
    null::numeric as team_win_pct_pre_game,
    null::numeric as opponent_win_pct_pre_game,
    null::boolean as team_above_500_pre_game,
    null::boolean as opponent_above_500_pre_game,
    null::boolean as previous_game_shutout,
    case when d.team_role = 'home' then d.home_rest_days when d.team_role = 'away' then d.away_rest_days else null::integer end as days_since_previous_game,
    null::text as previous_team_role,
    null::text as previous_moneyline_result,
    null::text as previous_over_result,
    null::text as previous_under_result,
    null::text as segment_key,
    (d.market_type like 'spread%') as is_spread_market,
    (d.market_type = 'total' or d.market_type like 'total_%') as is_total_market,
    (d.market_type = 'moneyline') as is_moneyline_market,
    'nhl_thin_v1',
    now()
  from deduped d
  left join public.goose_market_results gmr
    on gmr.candidate_id = d.candidate_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
