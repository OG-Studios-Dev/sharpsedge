# Goosalytics 100% Functionality Sprint Audit

Updated: 2026-04-25 13:25 EDT  
Owner: Magoo  
Goal: identify and sequence all work needed to reach full feature functionality across product, backend/data, Ask Goose, systems, learning lab, and monetization.  
Proof required: build output, route/API checks, audit scripts, Supabase migration/audit evidence.  
Terminal state: Partial — audit completed and P0 ops fixes started; fresh daily capture remains blocked by missing local/prod cron secret proof.

## Evidence collected

- `npm run build` passed after changes: compiled successfully and generated 49 static pages.
- Live API spot checks returned 200 for `/api/dashboard`, `/api/picks`, `/api/nba/picks`, `/api/mlb/picks`, `/api/golf/picks`, `/api/ask-goose`, `/api/admin/goose-learning-lab/status`.
- `node scripts/qa-audit.mjs` passed page/source/resolve checks; warning: resolve persistence hooks complained locally because service role env is not configured in that test context.
- Production coverage audit now runs after script fixes: `logs/goose-audits/2026-04-25_13-23-31-summary.txt`.
- Warehouse completeness audit runs but fails health: latest `snapshotsLast24h=0`, `candidatesLast24h=0`, `playerPropRowsLast24h=0`.
- Goose learning lab status: `ready_to_record=false`, `eligible_signals=0`, `sanity_rejected_signals=59`.

## Fixes already made in this sprint

1. Recreated missing daily warehouse refresh entrypoint
   - Added `scripts/run-daily-warehouse-refresh.mjs`.
   - It calls `/api/odds/aggregated/snapshot?cron=true&capture=true&sports=...&reason=lm-daily-archive` with `CRON_SECRET`.
   - It intentionally fails closed if `CRON_SECRET` is missing.

2. Fixed Goose production audit cron node path
   - Updated `scripts/run-goose-production-coverage-audit.sh` to use `NODE_BIN=${NODE_BIN:-/opt/homebrew/bin/node}`.
   - Verified it now writes audit + summary artifacts.

3. Removed `npm` dependency inside daily refresh shell
   - Updated `scripts/run-sgo-daily-refresh.sh` to call `"$NODE_BIN" scripts/goose-warehouse-completeness-audit.mjs` directly.

4. Added Goose ops/audit DB indexes
   - Migration: `supabase/migrations/20260425181500_goose_ops_audit_indexes.sql`.
   - Applied successfully with `supabase db push` after raising statement timeout.

5. Made production coverage audit less timeout-prone
   - Updated `scripts/goose-production-coverage-audit.mjs` to use HEAD/planned counts and lower broad row limits.
   - Verified summary writes successfully.

## Current highest-risk blockers

### P0 — Daily warehouse capture is still not proven fresh

Status: Blocked for local proof.  
Evidence:
- `node scripts/run-daily-warehouse-refresh.mjs` fails locally with: `CRON_SECRET is required because /api/odds/aggregated/snapshot?cron=true fails closed without it`.
- Warehouse audit: `Snapshots last 24h: 0`, `Candidates last 24h: 0`, `Player prop rows last 24h: 0`.

Required next proof:
- Confirm `CRON_SECRET` is configured in Vercel/cron environment, or add it locally for manual proof.
- Run daily capture.
- Verify `market_snapshots` and `market_snapshot_prices` have rows with `captured_at` inside last 24h.

### P0 — Learning model data is artifact-contaminated

Evidence:
- Lab is blocked: `eligible_signals=0`, `ready_to_record=false`.
- Top backtest candidates show impossible broad economics: NBA totals around 85–90% WR and long-dog ROI anomalies.

Required fixes:
1. Audit `goose_training_examples_v1` by league/market/side/book/odds bucket.
2. Fix NBA/NHL totals grading and line extraction.
3. Fix moneyline profit math/stale odds handling.
4. Add event-level dedupe/leakage controls.
5. Add walk-forward validation before any shadow pick recording.

### P0 — Auth / monetization are not launch-functional

Evidence:
- Google OAuth callback only redirects; it does not complete app session cookie creation.
- Upgrade page subscription buttons have no handlers.

Required fixes:
1. Complete Supabase OAuth callback session handoff to `/api/auth/login`.
2. Wire Stripe checkout or make subscription CTAs explicitly disabled/waitlist.
3. Add test accounts for free/pro/sharp/admin flows.

## Full sprint backlog to reach 100% functionality

### Sprint 1 — Data rails and health proof

1. Prove daily market snapshot capture works end-to-end.
2. Fix/confirm cron secrets in Vercel and local ops.
3. Keep production coverage + warehouse audit artifacts non-empty daily.
4. Rewrite warehouse audit joins to stay index-friendly.
5. Add freshness badge/admin health check for latest market snapshot.
6. Re-run Ask Goose serving refresh after capture is healthy.

Definition of done:
- Latest warehouse audit passes or only reports expected slate-empty warnings.
- Snapshots/prices/candidates have fresh last-24h rows.
- Production coverage summary writes every day.

### Sprint 2 — Learning lab truth repair

1. Build `goose_training_examples_v1` anomaly audit.
2. Repair totals grading artifacts.
3. Repair moneyline odds/profit artifacts.
4. Add event-level dedupe mode to backtests.
5. Add walk-forward validation folds.
6. Only flip lab to `recording_ready` when at least one sanity-clean eligible signal survives.

Definition of done:
- No impossible aggregate ROI buckets.
- `eligible_signals > 0` only from plausible folds.
- Lab remains isolated from production.

### Sprint 3 — Shadow picks and comparison

1. Build daily shadow-pick recorder into `goose_learning_shadow_picks`.
2. Build shadow settlement job.
3. Build production-vs-shadow comparison materializer.
4. Add admin UI/status for shadow record, blockers, and promotion readiness.

Definition of done:
- 100+ settled shadow picks.
- Same-side/opposite/no-production-match comparison populated.
- No production writes from learning lab.

### Sprint 4 — Auth, subscriptions, and tier gates

1. Complete OAuth callback.
2. Wire Stripe checkout and promo code handling.
3. Hide admin nav unless admin.
4. Re-enable/standardize middleware route gates.
5. Test free/pro/sharp/admin access states.

Definition of done:
- User can sign up/login/logout reliably.
- Paid CTA creates a real checkout/session or explicit waitlist record.
- Protected routes are actually protected server-side.

### Sprint 5 — Product drill-down completeness

1. Search routes players to player research pages instead of generic `/props`.
2. Add/repair MLB team route and make MLB standings clickable.
3. Add matchup pages or honest labels for MLB/NFL/soccer schedule-only results.
4. Add mobile page titles/context where header hides text.
5. Replace silent API failure states with error/retry/source health messaging.

Definition of done:
- No dead-feeling search results.
- League drill-down behavior is consistent across NHL/NBA/MLB.
- Empty/error states distinguish no data from broken data.

### Sprint 6 — Market-specific completeness

1. MLB F5 systems: promote first because coverage is closest.
2. NBA Q1/Q3: improve line coverage and scoring settlement.
3. NHL period markets: add market classification and period score settlement.
4. PGA: fix stale DataGolf/odds cache path and complete odds tabs or hide them.
5. NFL/soccer: either complete picks/data or remove from launch-prominent UI.

Definition of done:
- Each visible system/market has data, settlement, record, and UI proof.
- No “coming soon” looks like a live feature.

## Launch read

Not launch-100 yet.

The app builds and core public APIs respond, but 100% functionality requires restoring fresh data capture, hardening data truth, completing auth/subscription flows, and replacing partial/dead UX with real routes or honest roadmap states.
