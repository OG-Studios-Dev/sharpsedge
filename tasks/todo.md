# Cross-sport data layer foundation — 2026-03-21
- [x] Lock the data-source roadmap into repo docs so implementation order stays honest
- [x] Add a reusable market snapshot/archive foundation for aggregated odds boards (schema + store + API route)
- [x] Capture source freshness/metadata so future scrapers and paid feeds can plug into the same model
- [x] Add tracked Supabase migration for market snapshots + better error surfacing
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

# MLB enrichment foundation — 2026-03-21
- [x] Add lineup/weather/park-factor rails
- [x] Add bullpen fatigue + honest F5 availability/completeness rails
- [x] Add unified MLB enrichment board/API with freshness/source metadata
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

# NHL context foundation — 2026-03-21
- [x] Add MoneyPuck-backed context loading with safe fallback
- [x] Add rest/travel/fatigue/playoff-pressure scaffolding
- [x] Add goalie context + lightweight official-team news context
- [x] Add NHL context board/API with sourced vs derived separation
- [x] Build and verify locally
- [x] Commit cleanly with a clear message

# Snapshot cadence + hardening — 2026-03-21
- [x] Wire and validate live market snapshot capture cadence
- [x] Harden cron route auth to fail closed when `CRON_SECRET` is missing
- [x] Build and commit cleanly

# Systems/pages integration push — 2026-03-21
- [x] Integrate MLB enrichment rails into Falcons and report data gaps
- [x] Integrate MLB enrichment rails into Tony’s Hot Bats foundation and report data gaps
- [x] Integrate NHL context rails into Swaggy and report data gaps
- [x] Strengthen movement/history-driven views with the new snapshot rail where appropriate
- [x] Build and commit each completed integration slice cleanly

# Next wave — systems intelligence push — 2026-03-21
- [ ] Strengthen movement/history-driven views with the new snapshot rail and report gaps
- [x] Build the first honest weighted scoring model for Falcons and report gaps
- [ ] Build the first actual trigger model for Tony’s Hot Bats and report gaps
- [x] Define and wire Swaggy’s real entry + price discipline rules and report gaps
- [ ] Build and commit each completed slice cleanly

# Swaggy entry rules — execution review
- [x] Inspect current Swaggy catalog entry, tracker coverage, and NHL context integration
- [x] Define conservative v1 entry gates using sourced goalie + MoneyPuck and derived urgency/fatigue context
- [x] Add Swaggy qualifier tracker with auditable stored notes and no fake records
- [x] Update system detail surfaces so the rulebook is visible/auditable
- [ ] Run build and commit cleanly
