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
