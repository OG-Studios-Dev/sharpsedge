-- Migration: pga_finish_odds
-- Stores Top 5/10/20 finish-market odds snapshots.
-- Sources: manual Oddschecker injection, Bovada snapshots, or provisional.

create table if not exists pga_finish_odds (
  id           bigint generated always as identity primary key,
  tournament   text        not null,
  source       text        not null default 'provisional',
  captured_at  timestamptz not null default now(),
  snapshot     jsonb       not null  -- Full FinishOddsSnapshot JSON
);

-- Index for fast lookup by tournament + source
create index if not exists idx_pga_finish_odds_tournament
  on pga_finish_odds (tournament, captured_at desc);

-- RLS: service role can read/write; anon can read
alter table pga_finish_odds enable row level security;

create policy "Service role full access"
  on pga_finish_odds for all
  to service_role using (true) with check (true);

create policy "Anon read"
  on pga_finish_odds for select
  to anon using (true);

comment on table pga_finish_odds is
  'Stores provisional + manual Top 5/10/20 finish-market odds for PGA majors. '
  'Source column: oddschecker-manual (priority 1), bovada-snapshot, or provisional.';
