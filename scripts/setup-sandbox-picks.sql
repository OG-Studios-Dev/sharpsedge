-- Sandbox picks pilot storage scaffold
-- Run in Supabase SQL Editor before using /admin/sandbox or /api/admin/sandbox.

create table if not exists public.sandbox_pick_slates (
  sandbox_key text primary key,
  date text not null,
  league text not null,
  experiment_tag text,
  status text not null default 'draft' check (status in ('draft', 'locked', 'archived')),
  pick_count integer not null default 0,
  expected_pick_count integer not null default 0,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'approved', 'rejected')),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.sandbox_pick_history (
  id text primary key,
  sandbox_key text not null references public.sandbox_pick_slates(sandbox_key) on delete cascade,
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
  pick_snapshot jsonb,
  experiment_tag text,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'approved', 'rejected')),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists sandbox_pick_history_sandbox_key_idx on public.sandbox_pick_history (sandbox_key, created_at asc);
create index if not exists sandbox_pick_slates_created_at_idx on public.sandbox_pick_slates (created_at desc);

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

select 'sandbox picks tables ready' as status;
