-- ============================================================
-- Golf Odds Snapshots
-- Stores scraped Bovada golf odds for all upcoming PGA Tour
-- events. Populated 3x daily by /api/golf/odds-snapshot cron.
--
-- One row per (tournament, start_date) — later scrapes for
-- the same event overwrite the existing row via upsert.
--
-- Consumed by:
--   - Golf picks pipeline (getBovadaTopFinishOdds in golf-odds.ts)
--   - GolfTopFinishOddsRail component
--   - Admin inspection at /admin/ops
-- ============================================================

create table if not exists golf_odds_snapshots (
  id           uuid        primary key default gen_random_uuid(),

  -- Event identification
  tournament   text        not null,       -- e.g. "The Masters 2026"
  start_date   date        not null,       -- tournament start date
  event_id     text,                       -- Bovada internal event ID

  -- Provenance
  source       text        not null default 'bovada',
  scraped_at   timestamptz not null,       -- when this snapshot was captured

  -- Odds data
  markets      jsonb       not null default '{}',   -- winner, top5, top10, top20, makeCut, matchups
  analysis     jsonb               default '{}',    -- h2hPicks, outrightValue arrays

  -- Timestamps
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Unique constraint: one snapshot per tournament per start_date.
-- Later scrapes update the existing row.
create unique index if not exists uq_golf_odds_snapshots_tournament_date
  on golf_odds_snapshots (tournament, start_date);

-- Index for latest-snapshot queries
create index if not exists idx_golf_odds_snapshots_scraped
  on golf_odds_snapshots (scraped_at desc);

-- Auto-update updated_at on every write
create or replace function update_golf_odds_snapshots_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_golf_odds_snapshots_updated_at on golf_odds_snapshots;

create trigger trg_golf_odds_snapshots_updated_at
  before update on golf_odds_snapshots
  for each row execute function update_golf_odds_snapshots_updated_at();

-- Enable RLS
alter table golf_odds_snapshots enable row level security;

create policy "Service role full access to golf_odds_snapshots"
  on golf_odds_snapshots
  for all
  using (auth.role() = 'service_role');

create policy "Allow authenticated read of golf_odds_snapshots"
  on golf_odds_snapshots
  for select
  using (auth.role() in ('service_role', 'authenticated', 'anon'));
