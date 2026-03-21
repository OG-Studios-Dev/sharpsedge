# Today picks pipeline hardening — 2026-03-21
- [x] Reproduce why 2026-03-21 NHL slate is empty/incomplete on production
- [x] Patch API so persistence/integrity drift cannot silently zero out the live slate
- [x] Add self-healing/backfill behavior for incomplete empty slates where safe
- [x] Verify build + regression tests locally (live endpoint behavior to re-check after deploy)
- [ ] Deploy fix and re-check live today picks endpoint

# Reagan QA todo — 2026-03-19

- [x] Inspect live Goosalytics picks endpoints/pages for NHL and NBA today
- [x] Verify minimum pick volume vs actual scheduled games
- [x] Cross-check at least one live pick against a trustworthy public source/API
- [x] Verify streak claims are not false/inflated
- [x] Verify yesterday's picks resolve correctly W/L
- [x] Verify /props and /trends are populated/current-looking
- [ ] Patch trivial safe bug only if found, then verify
- [x] Summarize findings with evidence only

## Review
- Live site is generating 3 NHL picks and 3 NBA picks on 2026-03-19; minimum target is met.
- Official public schedules confirm games exist today: NHL 11 games via NHL API; NBA 8 games via ESPN scoreboard API.
- Cross-check passed for Viktor Arvidsson Over 0.5 Points: live pick says 70% hit rate over last 10; NHL public game log shows 7 hits in latest 10.
- No obvious false streak claim found in live pick reasoning. Team streak sample also matched sourced standings: BUF L10 9-1 on live pick matches NHL standings; NBA trend cards for LAC/MIL show W8 and live standings endpoint also shows W8.
- Live /props and /trends pages are populated and current-looking in browser automation; visible today matchups include WPG @ BOS, NYI @ OTT, BUF @ SJS, etc.
- Historical resolution is not healthy: /api/picks/history has 0 rows for 2026-03-18, and all six 2026-03-17 backfilled rows are still pending with null game_id. Resolver code returns pending when gameId is missing, so these rows will not auto-grade.
- No trivial safe repo-only patch was applied because the main live issue is historical/backfill grading, which needs a non-trivial fix plus deployment.

## Implementation Review
- Added authoritative daily slate locking via a new `pick_slates` schema path plus insert-only history persistence; same-date GETs now replay a locked slate instead of regenerating it.
- Stored explicit row provenance and full `pick_snapshot` payloads for new writes so original picks can be replayed without reconstructing fields from labels.
- Removed merge-style result persistence from the resolver; settlement writes now patch only `result`/`updated_at`, with legacy `pick_id` fallback.
- `/api/picks/history` and the history/admin UI now surface reconstructed and incomplete slates instead of masking them with file-backed fallback behavior.
- Local verification passed: `node --test --experimental-strip-types src/lib/pick-history-integrity.test.mts`, `npx tsc --noEmit`, and `npm run build`.
- Manual follow-up is still required in live Supabase: run the updated `scripts/setup-supabase.sql`, then explicitly relabel/seed the 2026-03-17 and 2026-03-18 reconstructed slates in `pick_history`/`pick_slates`.

# Pick performance KPIs — 2026-03-21
- [x] Add shared win % / sample-size helper for pick records
- [x] Show win % beside net units on home record bar
- [x] Show win % beside net units on picks page season record
- [x] Build + verify live UI paths

# Admin ops page — 2026-03-21
- [x] Inspect current admin dashboard structure and nav
- [x] Add IT leader / ops review page in admin
- [x] Create persistent bug log store with status/owner/severity
- [x] Surface open bugs as a dedicated unfixed queue
- [x] Add cron schedule section with add/edit controls
- [x] Build and verify admin routes
- [x] Add incident tracking section
- [x] Add cron run-health metadata (last run / success / failure / consecutive failures)
- [x] Add deploy/system snapshot cards (git + vercel cron visibility)

# Systems Tracking first pass — 2026-03-21
- [x] Inspect existing app structure, nav config, styling patterns, and admin-ops store pattern
- [x] Design a minimal file-backed systems tracking model and seed data
- [x] Add `data/systems-tracking.json` with NBA Goose System seed
- [x] Implement systems tracking store + derived metrics helper
- [x] Build public `/systems` page using existing design language
- [x] Add nav entry in the obvious shared nav config
- [x] Make the UI explicit about missing quarter spread line ingestion and placeholder metrics
- [x] Run `npm run build` and fix any issues
- [x] Commit changes locally with a clear message

## Systems Review
- `npm run build` passed locally.
- `/systems` now reads from a file-backed store and ships an honest first-pass state for the NBA Goose System.
- Metrics intentionally remain placeholder/awaiting data unless quarter-line-backed rows exist in the store.

# Systems catalog expansion + park/discard pass — 2026-03-21
- [x] Expand seeded catalog across NHL / NBA / MLB / NFL using fun public-facing system names
- [x] Mark each system clearly as trackable now, parked/definition-only, or blocked by missing data
- [x] For every blocked system, add exact missing-data notes and the source/input needed to unlock tracking later
- [x] Keep main `/systems` page compact while surfacing readiness/trackability at a glance
- [x] Ensure detail pages explain why a system is parked instead of pretending it is live
- [x] Run `npm run build` and review live drill-down UX
- [ ] Commit cleanly after review
