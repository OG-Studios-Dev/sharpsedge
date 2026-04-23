create or replace function public.refresh_ask_goose_nhl_serving_source_v2(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
  v_batch_rows integer := 0;
  v_start date;
  v_end date;
  v_cursor date;
begin
  perform public.refresh_ask_goose_nhl_serving_base_v1(p_start_date, p_end_date);

  v_start := coalesce(p_start_date, (select min(event_date) from public.ask_goose_nhl_serving_base_v1));
  v_end := coalesce(p_end_date, (select max(event_date) from public.ask_goose_nhl_serving_base_v1));

  if v_start is null or v_end is null then
    return 0;
  end if;

  delete from public.ask_goose_nhl_serving_source_v2 s
  where s.event_date >= v_start
    and s.event_date <= v_end;

  v_cursor := v_start;
  while v_cursor <= v_end loop
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
    where sb.event_date = v_cursor;

    get diagnostics v_batch_rows = row_count;
    v_rows := v_rows + v_batch_rows;
    v_cursor := v_cursor + interval '1 day';
  end loop;

  return v_rows;
end;
$$;