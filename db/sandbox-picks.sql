-- Sandbox picks pilot: isolated tables only.
-- Do NOT point production history code at these tables.

create table if not exists public.sandbox_pick_slates (
  sandbox_key text primary key,
  date text not null,
  league text not null,
  experiment_tag text null,
  status text not null default 'draft',
  pick_count integer not null default 0,
  expected_pick_count integer not null default 3,
  review_status text not null default 'pending',
  review_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sandbox_pick_slates_date_league_key
  on public.sandbox_pick_slates (date, league, sandbox_key);

create table if not exists public.sandbox_pick_history (
  id text primary key,
  sandbox_key text not null references public.sandbox_pick_slates(sandbox_key) on delete cascade,
  date text not null,
  league text not null,
  pick_type text not null,
  player_name text null,
  team text not null,
  opponent text null,
  pick_label text not null,
  hit_rate double precision null,
  edge double precision null,
  odds double precision null,
  book text null,
  result text not null default 'pending',
  game_id text null,
  reasoning text null,
  confidence double precision null,
  units integer not null default 1,
  pick_snapshot jsonb null,
  experiment_tag text null,
  review_status text not null default 'pending',
  review_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sandbox_pick_history_sandbox_key_idx
  on public.sandbox_pick_history (sandbox_key);

create index if not exists sandbox_pick_history_date_league_idx
  on public.sandbox_pick_history (date, league);
