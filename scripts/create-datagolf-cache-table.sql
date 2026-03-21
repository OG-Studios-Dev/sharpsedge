create table if not exists public.datagolf_cache (
  id uuid primary key default gen_random_uuid(),
  tournament text not null,
  data jsonb not null,
  last_scrape timestamptz not null,
  created_at timestamptz not null default now(),
  unique (tournament)
);

create index if not exists datagolf_cache_last_scrape_idx
  on public.datagolf_cache (last_scrape desc);

alter table public.datagolf_cache enable row level security;

drop policy if exists datagolf_read on public.datagolf_cache;
drop policy if exists datagolf_service_write on public.datagolf_cache;

create policy datagolf_read
  on public.datagolf_cache
  for select
  using (true);

create policy datagolf_service_write
  on public.datagolf_cache
  for all
  to service_role
  using (true)
  with check (true);
