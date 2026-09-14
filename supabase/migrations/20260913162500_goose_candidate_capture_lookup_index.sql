-- Support the live NFL scorer's latest-capture lookup without scanning and
-- sorting the full cross-sport historical candidate warehouse. Historical
-- scoring does not use this lookup, so keep the index narrow and cheap.
set statement_timeout = '10min';

create index if not exists goose_market_candidates_live_nfl_capture_idx
  on public.goose_market_candidates (event_date, capture_ts desc)
  where sport = 'NFL' and event_date >= date '2026-09-01';

reset statement_timeout;
