create table if not exists public.ask_goose_nhl_candidate_cache_v1 (
  candidate_id text primary key,
  event_id text not null,
  sport text not null,
  event_date date not null,
  market_type text,
  submarket_type text,
  participant_name text,
  side text,
  line numeric,
  odds numeric,
  sportsbook text,
  cached_at timestamptz not null default now()
);

create index if not exists ask_goose_nhl_candidate_cache_v1_event_date_idx
  on public.ask_goose_nhl_candidate_cache_v1 (event_date);

create index if not exists ask_goose_nhl_candidate_cache_v1_event_idx
  on public.ask_goose_nhl_candidate_cache_v1 (event_id);

create index if not exists ask_goose_nhl_candidate_cache_v1_market_idx
  on public.ask_goose_nhl_candidate_cache_v1 (market_type, submarket_type);

create or replace function public.refresh_ask_goose_nhl_candidate_cache_v1(
  p_start_date date default null,
  p_end_date date default null
)
returns integer
language plpgsql
as $$
declare
  v_rows integer := 0;
begin
  delete from public.ask_goose_nhl_candidate_cache_v1 c
  where (p_start_date is null or c.event_date >= p_start_date)
    and (p_end_date is null or c.event_date <= p_end_date);

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
    and (p_start_date is null or gmc.event_date >= p_start_date)
    and (p_end_date is null or gmc.event_date <= p_end_date);

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
