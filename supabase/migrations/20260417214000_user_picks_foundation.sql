create table if not exists public.user_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('ai_pick', 'prop', 'team_trend', 'manual', 'parlay')),
  source_id text,
  parent_pick_id uuid references public.user_picks(id) on delete cascade,
  kind text not null default 'single' check (kind in ('single', 'parlay_leg', 'parlay')),
  status text not null default 'pending' check (status in ('pending', 'win', 'loss', 'push', 'void', 'cancelled')),
  league text not null,
  game_date text,
  game_id text,
  team text,
  opponent text,
  player_name text,
  pick_label text not null,
  detail text,
  bet_type text,
  market_type text,
  line numeric,
  odds integer,
  book text,
  units numeric not null default 1,
  risk_amount numeric,
  to_win_amount numeric,
  profit_units numeric not null default 0,
  result_settled_at timestamptz,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  locked_snapshot jsonb
);

create index if not exists user_picks_user_id_placed_at_idx on public.user_picks (user_id, placed_at desc);
create index if not exists user_picks_user_id_status_idx on public.user_picks (user_id, status, placed_at desc);
create index if not exists user_picks_user_id_game_date_idx on public.user_picks (user_id, game_date desc);
create index if not exists user_picks_parent_pick_id_idx on public.user_picks (parent_pick_id);
create index if not exists user_picks_source_idx on public.user_picks (source_type, source_id);

alter table public.user_picks enable row level security;

drop policy if exists "Users can read own user picks" on public.user_picks;
drop policy if exists "Users can insert own user picks" on public.user_picks;
drop policy if exists "Users can update own user picks" on public.user_picks;
drop policy if exists "Users can delete own user picks" on public.user_picks;
drop policy if exists "Service role full access on user picks" on public.user_picks;

create policy "Users can read own user picks"
  on public.user_picks
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own user picks"
  on public.user_picks
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own user picks"
  on public.user_picks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own user picks"
  on public.user_picks
  for delete
  using (auth.uid() = user_id);

create policy "Service role full access on user picks"
  on public.user_picks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.user_pick_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_picks integer not null default 0,
  settled_picks integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  pushes integer not null default 0,
  pending integer not null default 0,
  win_rate numeric not null default 0,
  profit_units numeric not null default 0,
  roi numeric not null default 0,
  current_streak integer not null default 0,
  best_win_streak integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_pick_stats enable row level security;

drop policy if exists "Users can read own pick stats" on public.user_pick_stats;
drop policy if exists "Service role full access on user pick stats" on public.user_pick_stats;

create policy "Users can read own pick stats"
  on public.user_pick_stats
  for select
  using (auth.uid() = user_id);

create policy "Service role full access on user pick stats"
  on public.user_pick_stats
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
