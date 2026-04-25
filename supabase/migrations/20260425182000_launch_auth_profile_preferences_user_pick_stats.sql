-- Launch hardening: account/profile base schema, persisted user preferences,
-- and automatic user-pick stats for My Picks/gamification rails.

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
alter table public.profiles add column if not exists last_login_at timestamptz;

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Service role full access" on public.profiles;

create policy "Users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Service role full access"
  on public.profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_league text not null default 'All' check (default_league in ('All', 'NHL', 'NBA', 'NFL', 'MLB', 'PGA')),
  odds_format text not null default 'american' check (odds_format in ('american')),
  notifications_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can read own preferences" on public.user_preferences;
drop policy if exists "Users can insert own preferences" on public.user_preferences;
drop policy if exists "Users can update own preferences" on public.user_preferences;
drop policy if exists "Service role full access on user preferences" on public.user_preferences;

create policy "Users can read own preferences"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own preferences"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own preferences"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access on user preferences"
  on public.user_preferences
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.refresh_user_pick_stats(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer;
  settled_count integer;
  wins_count integer;
  losses_count integer;
  pushes_count integer;
  pending_count integer;
  profit numeric;
  risked numeric;
begin
  select
    count(*)::integer,
    count(*) filter (where status in ('win', 'loss', 'push', 'void', 'cancelled'))::integer,
    count(*) filter (where status = 'win')::integer,
    count(*) filter (where status = 'loss')::integer,
    count(*) filter (where status in ('push', 'void', 'cancelled'))::integer,
    count(*) filter (where status = 'pending')::integer,
    coalesce(sum(profit_units), 0),
    coalesce(sum(case when status in ('win', 'loss') then greatest(units, 0) else 0 end), 0)
  into total_count, settled_count, wins_count, losses_count, pushes_count, pending_count, profit, risked
  from public.user_picks
  where user_id = target_user_id;

  insert into public.user_pick_stats (
    user_id,
    total_picks,
    settled_picks,
    wins,
    losses,
    pushes,
    pending,
    win_rate,
    profit_units,
    roi,
    updated_at
  ) values (
    target_user_id,
    total_count,
    settled_count,
    wins_count,
    losses_count,
    pushes_count,
    pending_count,
    case when settled_count > 0 then round((wins_count::numeric / settled_count::numeric) * 100, 2) else 0 end,
    round(profit, 2),
    case when risked > 0 then round((profit / risked) * 100, 2) else 0 end,
    now()
  )
  on conflict (user_id) do update set
    total_picks = excluded.total_picks,
    settled_picks = excluded.settled_picks,
    wins = excluded.wins,
    losses = excluded.losses,
    pushes = excluded.pushes,
    pending = excluded.pending,
    win_rate = excluded.win_rate,
    profit_units = excluded.profit_units,
    roi = excluded.roi,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.refresh_user_pick_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_user_pick_stats(old.user_id);
    return old;
  end if;

  perform public.refresh_user_pick_stats(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.refresh_user_pick_stats(old.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_user_pick_stats_after_change on public.user_picks;
create trigger refresh_user_pick_stats_after_change
  after insert or update or delete on public.user_picks
  for each row execute function public.refresh_user_pick_stats_trigger();
