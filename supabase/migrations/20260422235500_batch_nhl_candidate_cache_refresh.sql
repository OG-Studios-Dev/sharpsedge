create or replace function public.refresh_ask_goose_nhl_candidate_cache_v1_batch(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_start date;
  v_end date;
  v_day date;
  v_total integer := 0;
  v_rows integer := 0;
begin
  select coalesce(p_start_date, min(event_date)), coalesce(p_end_date, max(event_date))
    into v_start, v_end
  from public.goose_market_events
  where league = 'NHL'
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date);

  if v_start is null or v_end is null then
    return 0;
  end if;

  v_day := v_start;
  while v_day <= v_end loop
    delete from public.ask_goose_nhl_candidate_cache_v1 c
    where c.event_date = v_day;

    insert into public.ask_goose_nhl_candidate_cache_v1 (
      candidate_id,
      event_id,
      sport,
      event_date,
      market_type,
      submarket_type,
      participant_name,
      side,
      line,
      odds,
      sportsbook,
      cached_at
    )
    select
      gmc.candidate_id,
      gmc.event_id,
      gmc.sport,
      gmc.event_date,
      gmc.market_type,
      gmc.submarket_type,
      gmc.participant_name,
      gmc.side,
      gmc.line,
      gmc.odds,
      gmc.sportsbook,
      now()
    from public.goose_market_candidates gmc
    where gmc.sport = 'NHL'
      and gmc.event_date = v_day;

    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
    v_day := v_day + interval '1 day';
  end loop;

  return v_total;
end;
$$;
