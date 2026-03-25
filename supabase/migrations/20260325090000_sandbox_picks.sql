-- Sandbox picks storage: isolated from production pick_slates / pick_history.
-- Safe to apply only on the org-owned Supabase project for Goosalytics.

create table if not exists public.sandbox_pick_slates (
  sandbox_key text primary key,
  date text not null,
  league text not null,
  experiment_tag text,
  status text not null default 'draft' check (status in ('draft', 'locked', 'archived')),
  pick_count integer not null default 0,
  expected_pick_count integer not null default 10,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'approved', 'rejected')),
  review_notes text,
  review_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sandbox_pick_history (
  id text primary key,
  sandbox_key text not null references public.sandbox_pick_slates(sandbox_key) on delete cascade,
  date text not null,
  league text not null,
  pick_type text not null check (pick_type in ('player', 'team')),
  player_name text,
  team text not null,
  opponent text,
  pick_label text not null,
  hit_rate numeric,
  edge numeric,
  odds numeric,
  book text,
  result text not null default 'pending' check (result in ('pending', 'win', 'loss', 'push')),
  game_id text,
  reasoning text,
  confidence numeric,
  units numeric not null default 1,
  pick_snapshot jsonb,
  experiment_tag text,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'approved', 'rejected')),
  review_notes text,
  review_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sandbox_pick_history_sandbox_key_idx on public.sandbox_pick_history (sandbox_key, created_at asc);
create index if not exists sandbox_pick_slates_created_at_idx on public.sandbox_pick_slates (created_at desc);
create index if not exists sandbox_pick_slates_league_date_idx on public.sandbox_pick_slates (league, date desc);

alter table public.sandbox_pick_slates enable row level security;
alter table public.sandbox_pick_history enable row level security;

drop policy if exists "Anyone can read sandbox pick slates" on public.sandbox_pick_slates;
drop policy if exists "Service role manages sandbox pick slates" on public.sandbox_pick_slates;
drop policy if exists "Anyone can read sandbox pick history" on public.sandbox_pick_history;
drop policy if exists "Service role manages sandbox pick history" on public.sandbox_pick_history;

create policy "Anyone can read sandbox pick slates"
  on public.sandbox_pick_slates
  for select
  using (true);

create policy "Service role manages sandbox pick slates"
  on public.sandbox_pick_slates
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Anyone can read sandbox pick history"
  on public.sandbox_pick_history
  for select
  using (true);

create policy "Service role manages sandbox pick history"
  on public.sandbox_pick_history
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
