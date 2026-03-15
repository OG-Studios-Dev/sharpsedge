create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  username text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Service role full access" on public.profiles;

create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

create policy "Service role full access"
  on public.profiles
  for all
  using (true);

create table if not exists public.pick_history (
  id text primary key,
  date text not null,
  league text not null,
  pick_type text not null,
  player_name text,
  team text not null,
  opponent text,
  pick_label text not null,
  hit_rate real,
  edge real,
  odds integer,
  book text,
  result text not null default 'pending' check (result in ('pending', 'win', 'loss', 'push')),
  game_id text,
  reasoning text,
  confidence integer,
  units integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.pick_history enable row level security;

drop policy if exists "Anyone can read picks" on public.pick_history;
drop policy if exists "Service role manages picks" on public.pick_history;

create policy "Anyone can read picks"
  on public.pick_history
  for select
  using (true);

create policy "Service role manages picks"
  on public.pick_history
  for all
  using (true);
