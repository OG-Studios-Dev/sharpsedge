create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  username text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  tier text not null default 'free' check (tier in ('free', 'pro', 'sharp', 'beta')),
  stripe_customer_id text,
  subscription_status text not null default 'none',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.profiles add column if not exists tier text not null default 'free';
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists subscription_status text not null default 'none';

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
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

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

alter table public.pick_history add column if not exists id text;
alter table public.pick_history add column if not exists pick_type text;
alter table public.pick_history add column if not exists provenance text not null default 'original';
alter table public.pick_history add column if not exists provenance_note text;
alter table public.pick_history add column if not exists pick_snapshot jsonb;
alter table public.pick_history add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pick_history'
      and column_name = 'pick_id'
  ) then
    execute 'update public.pick_history set id = coalesce(id, pick_id) where id is null';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pick_history'
      and column_name = 'type'
  ) then
    execute 'update public.pick_history set pick_type = coalesce(pick_type, type) where pick_type is null';
  end if;
end
$$;

update public.pick_history
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create unique index if not exists pick_history_id_uidx on public.pick_history (id);
create index if not exists pick_history_date_league_created_idx on public.pick_history (date, league, created_at desc);

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
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.pick_slates (
  date text not null,
  league text not null,
  status text not null default 'incomplete' check (status in ('locked', 'incomplete')),
  provenance text not null default 'original' check (provenance in ('original', 'reconstructed', 'manual_repair')),
  provenance_note text,
  expected_pick_count integer not null default 3,
  pick_count integer not null default 0,
  status_note text,
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  primary key (date, league)
);

create index if not exists pick_slates_locked_at_idx on public.pick_slates (locked_at desc);

alter table public.pick_slates enable row level security;

drop policy if exists "Anyone can read pick slates" on public.pick_slates;
drop policy if exists "Service role manages pick slates" on public.pick_slates;

create policy "Anyone can read pick slates"
  on public.pick_slates
  for select
  using (true);

create policy "Service role manages pick slates"
  on public.pick_slates
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- One-time live follow-up:
-- Relabel the 2026-03-17 and 2026-03-18 reconstructed/backfilled slates explicitly
-- in both public.pick_history and public.pick_slates after inspecting the live rows.
