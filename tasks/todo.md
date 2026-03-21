# Cross-sport data layer foundation — 2026-03-21
- [x] Lock the data-source roadmap into repo docs so implementation order stays honest
- [x] Add a reusable market snapshot/archive foundation for aggregated odds boards (schema + store + API route)
- [x] Capture source freshness/metadata so future scrapers and paid feeds can plug into the same model
- [x] Add a Supabase migration for durable market snapshot storage with safe read/service-role write policies
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

## Review
- Added `docs/CROSS-SPORT-DATA-LAYER.md` to document the first concrete cross-sport snapshot rail and keep scope honest.
- Added `src/lib/market-snapshot-store.ts` to normalize aggregated boards into snapshot/event/price records, archive them locally by day, and optionally write the same payloads to Supabase when service-role env vars exist.
- Added `src/app/api/odds/aggregated/snapshot/route.ts` for manual/API/cron-triggered capture without changing the existing aggregated odds endpoint behavior.
- Extended `src/app/api/odds/aggregated/route.ts` to expose lightweight source/freshness metadata with the live board response.
- Added tracked Supabase migration `supabase/migrations/20260321184500_create_market_snapshots.sql` and improved snapshot write error surfacing.
- Verified with `npm run build`.

# MLB enrichment foundation — 2026-03-21
- [x] Add lineup/weather/park-factor enrichment rails
- [x] Add a unified MLB enrichment board/API with freshness/source metadata
- [x] Add bullpen fatigue context and honest F5 availability/completeness rails
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

## Review
- Added `docs/MLB-ENRICHMENT.md` plus reusable modules for MLB lineups, weather, stadium mapping, park factors, bullpen fatigue, and F5 enrichment.
- Added `/api/mlb/enrichment` and validated it returned today's board cleanly.
- Park factors are file-seeded, bullpen is a contextual workload heuristic, and F5 only appears when explicitly exposed by source books.

# NHL context foundation — 2026-03-21
- [x] Add MoneyPuck-backed context loading with safe fallback
- [x] Add derived rest/travel/fatigue/playoff-pressure scaffolding
- [x] Add goalie context + lightweight official-team news context
- [x] Add NHL context board/API with sourced vs derived separation
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

## Review
- Added `docs/NHL-CONTEXT.md`, a bundled MoneyPuck snapshot fallback, and `/api/nhl/context`.
- Output keeps sourced vs derived fields explicit, avoids fake sentiment, and now includes goalie plus official-team news context.

# Snapshot cadence + hardening — 2026-03-21
- [x] Wire and validate live market snapshot capture cadence
- [x] Verify new data routes behave cleanly under real calls and fail safely
- [x] Harden cron route auth to fail closed when `CRON_SECRET` is missing
- [x] Build and commit cleanly

## Review
- Snapshot cadence wired conservatively in `vercel.json`, route validation performed, and snapshot warnings/failure-safe behavior improved.
- `?cron=true` now requires `CRON_SECRET`; manual/dev capture still works separately.

# Tony’s Hot Bats foundation integration — 2026-03-21
- [x] Wire Tony’s Hot Bats to the MLB enrichment board instead of leaving it as catalog-only copy
- [x] Surface honest context rows for lineup/weather/park/bullpen/market availability on the system detail page
- [x] Keep the copy explicit that the rolling offense model still does not exist
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

## Review
- Tony’s Hot Bats now refreshes from the MLB enrichment board and stores daily context rows per game.
- The system detail page surfaces lineup status, weather, park factor, bullpen workload, F5 completeness, and market availability without pretending they are picks.
- Remaining gap is the actual rolling offense / lineup-quality trigger model; the system now has real rails but still stops short of fake automation.

# Systems/pages integration push — 2026-03-21
- [ ] Integrate MLB enrichment rails into Falcons and report data gaps
- [x] Integrate MLB enrichment rails into Tony’s Hot Bats foundation and report data gaps
- [ ] Integrate NHL context rails into Swaggy and report data gaps
- [ ] Strengthen movement/history-driven views with the new snapshot rail where appropriate
- [ ] Build and commit each completed integration slice cleanly
