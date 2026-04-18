create table if not exists public.market_events (
  id text primary key,
  league text not null,
  event_date text,
  game_id text,
  commence_time timestamptz,
  home_team text,
  away_team text,
  event_label text,
  status text,
  result_payload jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_events_league_event_date_idx on public.market_events (league, event_date desc);
create index if not exists market_events_game_id_idx on public.market_events (game_id);

alter table public.market_events enable row level security;
drop policy if exists "Anyone can read market events" on public.market_events;
drop policy if exists "Service role manages market events" on public.market_events;
create policy "Anyone can read market events"
  on public.market_events
  for select
  using (true);
create policy "Service role manages market events"
  on public.market_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.market_picks (
  id text primary key,
  event_id text references public.market_events(id) on delete set null,
  source_type text not null check (source_type in ('model', 'user', 'manual', 'imported')),
  source_system text not null,
  source_pick_id text,
  league text not null,
  game_date text,
  game_id text,
  pick_type text not null,
  market_type text,
  bet_type text,
  player_name text,
  team text,
  opponent text,
  pick_label text not null,
  line numeric,
  direction text,
  book text,
  odds integer,
  confidence numeric,
  hit_rate numeric,
  edge numeric,
  reasoning text,
  status text not null default 'pending' check (status in ('pending', 'win', 'loss', 'push', 'void', 'cancelled', 'ungraded')),
  grading_status text not null default 'pending' check (grading_status in ('pending', 'graded', 'manual_review', 'ungradeable')),
  graded_at timestamptz,
  grading_source text,
  grading_notes text,
  result_value numeric,
  result_text text,
  settled_at timestamptz,
  snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_picks_event_id_idx on public.market_picks (event_id);
create index if not exists market_picks_source_idx on public.market_picks (source_type, source_system, source_pick_id);
create index if not exists market_picks_game_idx on public.market_picks (league, game_date desc, game_id);
create index if not exists market_picks_grading_idx on public.market_picks (grading_status, status, graded_at desc);

alter table public.market_picks enable row level security;
drop policy if exists "Anyone can read market picks" on public.market_picks;
drop policy if exists "Service role manages market picks" on public.market_picks;
create policy "Anyone can read market picks"
  on public.market_picks
  for select
  using (true);
create policy "Service role manages market picks"
  on public.market_picks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.user_pick_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_pick_id uuid references public.user_picks(id) on delete cascade,
  market_pick_id text references public.market_picks(id) on delete set null,
  entry_kind text not null default 'single' check (entry_kind in ('single', 'parlay', 'parlay_leg')),
  entry_status text not null default 'pending' check (entry_status in ('pending', 'win', 'loss', 'push', 'void', 'cancelled')),
  display_order integer not null default 0,
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  profit_units numeric not null default 0,
  locked_odds integer,
  locked_line numeric,
  locked_book text,
  locked_snapshot jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_pick_entries_user_id_idx on public.user_pick_entries (user_id, placed_at desc);
create index if not exists user_pick_entries_market_pick_id_idx on public.user_pick_entries (market_pick_id);
create index if not exists user_pick_entries_user_pick_id_idx on public.user_pick_entries (user_pick_id);

alter table public.user_pick_entries enable row level security;
drop policy if exists "Users can read own pick entries" on public.user_pick_entries;
drop policy if exists "Users can insert own pick entries" on public.user_pick_entries;
drop policy if exists "Users can update own pick entries" on public.user_pick_entries;
drop policy if exists "Users can delete own pick entries" on public.user_pick_entries;
drop policy if exists "Service role full access on user pick entries" on public.user_pick_entries;
create policy "Users can read own pick entries"
  on public.user_pick_entries
  for select
  using (auth.uid() = user_id);
create policy "Users can insert own pick entries"
  on public.user_pick_entries
  for insert
  with check (auth.uid() = user_id);
create policy "Users can update own pick entries"
  on public.user_pick_entries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Users can delete own pick entries"
  on public.user_pick_entries
  for delete
  using (auth.uid() = user_id);
create policy "Service role full access on user pick entries"
  on public.user_pick_entries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
