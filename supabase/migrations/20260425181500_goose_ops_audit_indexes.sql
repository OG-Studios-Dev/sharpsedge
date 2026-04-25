-- Ops/audit performance indexes for Goose2 warehouse health checks.
-- These unblock daily audit and grading readiness queries that sort/filter by capture/date.

set statement_timeout = '10min';

create index if not exists goose_market_candidates_capture_ts_desc_idx
  on public.goose_market_candidates (capture_ts desc);

create index if not exists goose_market_candidates_event_date_desc_idx
  on public.goose_market_candidates (event_date desc);

create index if not exists goose_market_candidates_sport_event_date_desc_idx
  on public.goose_market_candidates (sport, event_date desc);

create index if not exists goose_market_candidates_sport_capture_ts_desc_idx
  on public.goose_market_candidates (sport, capture_ts desc);

create index if not exists goose_market_results_settlement_ts_desc_idx
  on public.goose_market_results (settlement_ts desc);

create index if not exists goose_market_results_integrity_settlement_idx
  on public.goose_market_results (integrity_status, settlement_ts desc);

reset statement_timeout;
