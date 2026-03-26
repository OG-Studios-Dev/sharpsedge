-- ============================================================
-- Goose AI Picks Model — Sandbox / Analytics Fields
-- Adds capture-time snapshot fields + experiment tracking.
-- Run this after 20260325120000_goose_model_picks.sql.
--
-- Hard rules encoded in application layer (not enforced in DB,
-- but documented here for audit purposes):
--   1. -200 odds cap: no pick with odds < -200 ever inserted.
--   2. PGA outright winner minimum: +200 odds (bookOdds >= 200).
--   3. PGA timing: all PGA picks locked by Wednesday 10 PM ET
--      of tournament week. No picks generated after cutoff.
-- ============================================================

-- Capture-time snapshot columns (frozen values at generation time)
alter table goose_model_picks
  add column if not exists edge_at_capture        double precision,
  add column if not exists hit_rate_at_capture    double precision,
  add column if not exists odds_at_capture        double precision,
  add column if not exists signals_count          integer,
  add column if not exists experiment_tag         text;

-- Index for analytics bucketing
create index if not exists goose_model_picks_edge_bucket_idx
  on goose_model_picks (edge_at_capture, result)
  where result != 'pending';

create index if not exists goose_model_picks_hit_rate_bucket_idx
  on goose_model_picks (hit_rate_at_capture, result)
  where result != 'pending';

create index if not exists goose_model_picks_experiment_tag_idx
  on goose_model_picks (experiment_tag);

create index if not exists goose_model_picks_date_sport_source_idx
  on goose_model_picks (date desc, sport, source);

-- Back-fill signals_count from existing signals_present arrays
update goose_model_picks
  set signals_count = array_length(signals_present, 1)
  where signals_count is null
    and signals_present is not null
    and array_length(signals_present, 1) > 0;

-- Back-fill capture fields from existing columns (best-effort)
update goose_model_picks
  set
    hit_rate_at_capture = hit_rate_at_time,
    odds_at_capture     = odds
  where hit_rate_at_capture is null
     or odds_at_capture is null;
