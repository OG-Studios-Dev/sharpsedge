create or replace function public.count_ask_goose_nhl_serving_rows_by_date(
  p_start_date date,
  p_end_date date
)
returns table(event_date date, row_count bigint)
language sql
as $$
  select
    s.event_date,
    count(*)::bigint as row_count
  from public.ask_goose_nhl_serving_source_v2 s
  where s.event_date >= p_start_date
    and s.event_date <= p_end_date
  group by s.event_date
  order by s.event_date
$$;
