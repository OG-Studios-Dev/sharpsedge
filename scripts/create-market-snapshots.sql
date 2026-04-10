create table if not exists public.market_snapshots (
  id text primary key,
  captured_at timestamptz not null,
  date_key text not null,
  source text not null,
  trigger text not null default 'manual' check (trigger in ('manual', 'cron', 'api')),
  reason text,
  storage_version integer not null default 1,
  sport_count integer not null default 0,
  game_count integer not null default 0,
  event_count integer not null default 0,
  price_count integer not null default 0,
  source_summary jsonb not null default '{}'::jsonb,
  freshness jsonb not null default '{}'::jsonb,
  sport_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshot_events (
  id text primary key,
  snapshot_id text not null references public.market_snapshots(id) on delete cascade,
  sport text not null,
  game_id text not null,
  odds_api_event_id text,
  commence_time timestamptz,
  matchup text not null,
  home_team text not null,
  away_team text not null,
  home_abbrev text not null,
  away_abbrev text not null,
  captured_at timestamptz not null,
  source text not null,
  source_summary jsonb not null default '{}'::jsonb,
  freshness jsonb not null default '{}'::jsonb,
  book_count integer not null default 0,
  price_count integer not null default 0,
  best_prices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshot_prices (
  id text primary key,
  snapshot_id text not null references public.market_snapshots(id) on delete cascade,
  event_snapshot_id text not null references public.market_snapshot_events(id) on delete cascade,
  sport text not null,
  game_id text not null,
  odds_api_event_id text,
  commence_time timestamptz,
  captured_at timestamptz not null,
  book text not null,
  market_type text not null check (market_type in ('moneyline', 'spread', 'spread_q1', 'spread_q3', 'total', 'first_five_moneyline', 'first_five_total')),
  outcome text not null,
  odds numeric not null,
  line numeric,
  source text not null,
  source_updated_at timestamptz,
  source_age_minutes integer,
  created_at timestamptz not null default now()
);

create index if not exists market_snapshots_captured_at_idx
  on public.market_snapshots (captured_at desc);

create index if not exists market_snapshots_date_key_idx
  on public.market_snapshots (date_key, captured_at desc);

create index if not exists market_snapshot_events_snapshot_idx
  on public.market_snapshot_events (snapshot_id, sport, commence_time);

create index if not exists market_snapshot_events_game_idx
  on public.market_snapshot_events (sport, game_id, captured_at desc);

create index if not exists market_snapshot_prices_snapshot_idx
  on public.market_snapshot_prices (snapshot_id, sport, book);

create index if not exists market_snapshot_prices_lookup_idx
  on public.market_snapshot_prices (sport, game_id, market_type, outcome, captured_at desc);

create index if not exists market_snapshot_prices_book_time_idx
  on public.market_snapshot_prices (book, market_type, captured_at desc);

alter table public.market_snapshots enable row level security;
alter table public.market_snapshot_events enable row level security;
alter table public.market_snapshot_prices enable row level security;

drop policy if exists market_snapshots_read on public.market_snapshots;
drop policy if exists market_snapshots_service_write on public.market_snapshots;
drop policy if exists market_snapshot_events_read on public.market_snapshot_events;
drop policy if exists market_snapshot_events_service_write on public.market_snapshot_events;
drop policy if exists market_snapshot_prices_read on public.market_snapshot_prices;
drop policy if exists market_snapshot_prices_service_write on public.market_snapshot_prices;

create policy market_snapshots_read
  on public.market_snapshots
  for select
  using (true);

create policy market_snapshots_service_write
  on public.market_snapshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy market_snapshot_events_read
  on public.market_snapshot_events
  for select
  using (true);

create policy market_snapshot_events_service_write
  on public.market_snapshot_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy market_snapshot_prices_read
  on public.market_snapshot_prices
  for select
  using (true);

create policy market_snapshot_prices_service_write
  on public.market_snapshot_prices
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
