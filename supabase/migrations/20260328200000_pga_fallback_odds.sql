-- ============================================================
-- PGA Fallback Odds Storage
-- Captures player odds from fallback sources (The Odds API,
-- BettingPros, etc.) when primary Bovada scraper fails or
-- returns partial data.
--
-- Every row stores full provenance: player, market, odds,
-- source, source_url, captured_at, tournament, book.
--
-- Populated by:
--   - POST /api/admin/pga-fallback-capture
--   - GET  /api/golf/odds-snapshot (automatic fallback arm)
--
-- Consumed by:
--   - Golf picks pipeline (reads latest snapshot per tournament)
--   - Admin inspection at /admin/ops (source-health endpoint)
-- ============================================================

create table if not exists pga_fallback_odds (
  id             uuid primary key default gen_random_uuid(),

  -- Core line fields
  player         text    not null,
  market         text    not null check (
                   market in ('winner','top5','top10','top20','top40','make_cut','miss_cut','h2h')
                 ),
  odds           integer not null,  -- American format (e.g. +1200, -110)

  -- Provenance (required on every row)
  source         text    not null,  -- 'theoddsapi', 'bettingpros', 'bovada', 'manual', etc.
  source_url     text,              -- full URL fetched (null for manual entry)
  captured_at    timestamptz not null,  -- when this line was observed
  tournament     text    not null,  -- e.g. "Masters Tournament", "Houston Open"
  book           text,              -- which bookmaker's line (e.g. "BetMGM", "DraftKings")
  event_id       text,              -- source-specific event identifier

  -- Meta
  is_fallback    boolean not null default true,  -- always true for this table
  created_at     timestamptz not null default now()
);

-- Index for efficient tournament lookups
create index if not exists idx_pga_fallback_odds_tournament
  on pga_fallback_odds (tournament, captured_at desc);

-- Index for market-level queries
create index if not exists idx_pga_fallback_odds_market
  on pga_fallback_odds (market, captured_at desc);

-- Enable RLS (admin and service role can read; no public access)
alter table pga_fallback_odds enable row level security;

create policy "Service role full access to pga_fallback_odds"
  on pga_fallback_odds
  for all
  using (auth.role() = 'service_role');

-- Allow anon read for admin inspection dashboards
create policy "Allow authenticated read of pga_fallback_odds"
  on pga_fallback_odds
  for select
  using (auth.role() in ('service_role', 'authenticated'));
