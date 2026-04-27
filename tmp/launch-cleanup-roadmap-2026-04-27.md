# Goosalytics Audit Cleanup Roadmap — 2026-04-27

Owner: Magoo
Goal: turn the 04:00 launch audit findings into a proof-based cleanup plan that gets Goosalytics from “site is up” to “launch-trustworthy”.
Proof required: every item closes only with command output, HTTP response, build result, artifact, or data audit result.
Last updated: 2026-04-27 06:37 EDT

## Executive verdict

Current state: Partial. Production is live and mostly responding, but launch-readiness is blocked by trust gaps in routing, asset fallback QA, historical backfill errors, Supabase timeout risk, and learning-model cleanliness.

Launch posture: do not publicly launch until P0/P1/P2 gates are green and P3 is explicitly labeled either “learning-only” or “production-eligible” with proof.

## P0 — Stop the bleeding / define truth gates

### 1. Create one canonical launch gate script
Owner: Magoo + Quinn
Goal: replace scattered checks with one repeatable launch-readiness command.
Tasks:
- Bundle route smokes, dashboard API, Ask Goose API, asset QA, build, learning status, and backfill health into one script/report.
- Require clear PASS/WARN/FAIL output.
- Save dated report under `logs/launch-qa/` and a compact summary under `tmp/`.
Proof required:
- `npm run launch:gate` or equivalent exits 0 only when launch-safe.
- Latest report shows all required gates.
Status: Pending

### 2. Separate “site health” from “model launch readiness”
Owner: Magoo
Goal: prevent a green site check from implying the model is ready.
Tasks:
- Add two explicit labels to reports: `site_status` and `model_status`.
- Acceptable model labels: `learning_only`, `shadow_comparison`, `production_candidate`, `production_live`.
Proof required:
- Launch report shows `site_status: pass` and `model_status: learning_only` until model proof improves.
Status: Pending

## P1 — User-facing bugs from the 04:00 audit

### 3. Fix `/standings` 404 or remove it from nav/audit
Owner: Finch
Goal: no dead public route in launch audit.
Tasks:
- Decide whether `/standings` is supposed to exist as a page or only `/api/standings`.
- If public page: implement/restore page.
- If not public: remove from smoke test/nav references.
Proof required:
- `curl -L https://goosalytics.vercel.app/standings` returns intended result: HTTP 200 page or audit no longer expects it.
Status: Pending

### 4. Fix PlayerAvatar asset fallback audit
Owner: Slate + Quinn
Goal: broken player images degrade gracefully without failed QA.
Tasks:
- Inspect `PlayerAvatar` implementation and `scripts/qa-asset-fallbacks.mjs`.
- Determine if component is wrong or test pattern is stale.
- Fix the exact issue, not by weakening the audit blindly.
Proof required:
- `npm run qa:assets` passes.
- PlayerAvatar still has a real broken-image fallback.
Status: Pending

### 5. Re-run route smoke after fixes
Owner: Quinn
Goal: public UX routes are launch-clean.
Routes:
- `/`
- `/ask-goose`
- `/trends`
- `/props`
- `/my-picks`
- `/schedule`
- `/golf`
- `/standings` if intentionally public
Proof required:
- HTTP 200/expected responses with bytes and timing captured in launch report.
Status: Pending

## P2 — Data pipeline and backfill cleanup

### 6. Classify SportsGameOdds backfill errors by root cause
Owner: Atlas
Goal: distinguish stale/no-data windows from real ingestion failure.
Tasks:
- Parse 04:20 and 05:20 logs by league/month/window.
- Classify each `status:error` as API no-data, source cap, transform error, Supabase write failure, timeout, or unknown.
- Stop treating aggregate `ok:true` as clean if chunks errored.
Proof required:
- A table of all errored chunks with cause + next action.
- Backfill report includes `chunk_errors_count` and `fatal_errors_count`.
Status: Pending

### 7. Fix misleading backfill success output
Owner: Atlas
Goal: a run with chunk errors cannot look green.
Tasks:
- Update backfill runner/report so top-level status is `partial` or `error` when chunks fail.
- Preserve Supabase health as separate field.
Proof required:
- A test or dry run where chunk errors produce top-level non-green status.
Status: Pending

### 8. Resume targeted backfill only after classification
Owner: Atlas + Magoo
Goal: avoid burning API quota blindly.
Tasks:
- Retry only windows classified as real retry candidates.
- Skip completed/no-data windows explicitly.
- Keep ledger clean.
Proof required:
- Updated ledger with fewer unknown/errors.
- No duplicate contaminated data introduced.
Status: Pending

## P3 — Learning model trust cleanup

### 9. Fix training anomaly audit timeout
Owner: Atlas
Goal: anomaly audit must run reliably on large ranges.
Tasks:
- Chunk query by sport/date/month instead of one broad Supabase query.
- Add resumable output cache.
- Add timeout-safe progress logging.
Proof required:
- Full 2024-01-01 to 2026-12-31 anomaly audit completes without Supabase statement timeout.
Status: Pending

### 10. Reduce implausible-line contamination at source, not just during scoring
Owner: Atlas
Goal: bad lines should not keep poisoning training examples.
Audit evidence:
- Shadow backtest excluded 14,452 implausible train lines and 10,780 implausible test lines.
Tasks:
- Trace top implausible categories: low full-game totals, high totals, wide spreads.
- Identify source adapters/normalizers creating them.
- Add source-level validation before warehouse/training ingestion.
Proof required:
- New training dataset shows sharply reduced implausible-line exclusions.
- Backtest still uses sanity filters, but no longer relies on them as the primary cleanup layer.
Status: Pending

### 11. Keep model in `learning_only` until it earns promotion
Owner: Magoo + Quinn
Goal: no fake confidence.
Current audit state:
- 0 eligible signals
- 0 shadow picks
- 0 settled shadow picks
- readiness says not ready
Tasks:
- Keep production UI from implying model-backed certainty.
- Require eligible clean signals + settled shadow comparison before promotion.
Proof required:
- Learning status report shows explicit readiness reasons.
- No production promotion until rules pass.
Status: Pending

### 12. Design the promotion gate
Owner: Magoo + Atlas
Goal: define exactly what “model ready” means.
Initial proposed gate:
- Minimum training examples met.
- Minimum test examples met.
- At least 1 sanity-clean eligible signal.
- At least 100 settled shadow picks.
- No top candidates rejected for obvious line/source artifacts.
- Walk-forward folds have non-zero eligible candidates.
- ROI/win-rate in plausible range.
Proof required:
- Gate encoded in status script, not just written in docs.
Status: Pending

## P4 — Ask Goose quality and honesty

### 13. Add Ask Goose answer-quality assertions
Owner: Rory + Quinn
Goal: Ask Goose must answer with proof and avoid fake certainty.
Tasks:
- For each league prompt, verify response includes sample size, W/L/push, units/ROI, filters, and caveats when data is thin.
- Block/refuse unsupported claims.
- Flag NFL as limited if historical coverage remains weak.
Proof required:
- Ask Goose QA script checks content, not just HTTP 200.
Status: Pending

### 14. Add data freshness labels to Ask Goose
Owner: Finch + Atlas
Goal: users know whether answers are live, historical, partial, or learning-only.
Tasks:
- Add response metadata to UI: source, date range, rows, deduped rows, graded rows.
- Show “learning-only / not a pick recommendation” where appropriate.
Proof required:
- `/ask-goose` UI screenshot or HTML inspection confirms labels.
Status: Pending

## P5 — Launch polish and final acceptance

### 15. Full launch QA pass
Owner: Quinn
Goal: run the full gate clean after fixes.
Proof required:
- Build passes.
- Route smoke passes.
- Asset audit passes.
- Dashboard API passes.
- Ask Goose API + answer-quality audit passes.
- Backfill health has no unknown fatal errors.
- Learning model status honestly reported.
Status: Pending

### 16. Marco-ready launch summary
Owner: Magoo
Goal: give Marco a clear go/no-go without technical fog.
Proof required:
- One-page summary with:
  - What is fixed
  - What is still learning-only
  - Known limitations
  - Launch recommendation
  - Evidence links/artifacts
Status: Pending

## Recommended execution order

1. Fix `/standings` and PlayerAvatar audit.
2. Build canonical launch gate.
3. Classify backfill errors and fix misleading green output.
4. Chunk/fix anomaly audit timeout.
5. Move contamination cleanup upstream.
6. Add Ask Goose answer-quality/freshness checks.
7. Run final launch gate and produce go/no-go.

## Non-negotiables

- No “done” without proof.
- No public model promotion while status is `learning_only`.
- No broad backfill retries until errors are classified.
- No hiding 404s, chunk errors, or audit failures behind green summaries.
- If the data is thin, Ask Goose says it is thin.

## Progress update — 2026-04-27 06:58 EDT

### Closed P1 items locally

#### `/standings` route
Status: Done locally, committed.
Commit: `273b909` — `Fix standings page and asset fallback QA`
Proof:
- `npm run build` lists `○ /standings 160 B 130 kB`.
- Local production server smoke: `/standings HTTP 200 bytes 58804 time 0.032976`.

#### PlayerAvatar / PlayerHeader asset fallback QA
Status: Done locally, committed.
Commit: `273b909` — `Fix standings page and asset fallback QA`
Proof:
- `npm run qa:assets` returned:
  - `ok: true`
  - `PlayerAvatar missing-headshot fallback`
  - `PlayerAvatar broken-headshot fallback`
  - `PlayerHeader broken-headshot fallback`
  - `NBA player route exposes playerId for shared headshot resolver`

#### Build gate
Status: Done locally.
Proof:
- `npm run build` compiled successfully and generated 50 static pages.

#### Local route smoke
Status: Done locally.
Proof:
- `/ HTTP 200 bytes 74773`
- `/standings HTTP 200 bytes 58804`
- `/schedule HTTP 200 bytes 69154`
- `/ask-goose HTTP 200 bytes 53410`
- `/props HTTP 200 bytes 57411`
- `/my-picks HTTP 200 bytes 49670`

### Remaining caveat
These fixes are committed locally but not yet verified on `goosalytics.vercel.app` in production. Production verification requires pushing/deploying commit `273b909`, then re-running the production smoke.

## Progress update — 2026-04-27 07:04 EDT

### P1 deployed to production
Status: Done / verified in production.
Commit pushed: `273b909` — `Fix standings page and asset fallback QA`
Vercel deploy: `https://goosalytics-o1cr77g69-bridg3.vercel.app` — Ready, Production, 51s.
Production smoke proof:
- `/standings HTTP 200 bytes 60913 time 0.410029`
- `/schedule HTTP 200 bytes 71263 time 0.344177`
- `/ask-goose HTTP 200 bytes 54970 time 0.259437`
- `/api/dashboard HTTP 200 bytes 47937 time 1.348239`

P1 result: `/standings` 404 and asset fallback QA blocker are cleared.

## Progress update — 2026-04-27 07:08 EDT

### P0 canonical launch gate created
Status: Done / committed / pushed.
Commit: `c228d76` — `Add canonical launch gate`
New command: `npm run launch:gate`

Proof from first gate run with `--skip-build`:
- `site_status: pass`
- `model_status: learning_only`
- `model_launch_ready: false`
- `failedChecks: []`
- `failedRoutes: []`
- Report artifact: `logs/launch-qa/2026-04-27T10-56-30-440Z-launch-gate.json`

This is the scoreboard we needed: the site can now pass while the launch gate still correctly fails because the model is not production-ready.

## Progress update — 2026-04-27 08:18 EDT

### P2 backfill error classification + reporting patch
Status: Partial / code committed and pushed.
Commit: `fc33a20` — `Make SGO backfill failures explicit`

What changed:
- `scripts/sgo-run-backfill.mjs` now emits `status: partial`, `ok: false`, `failedChunks`, `chunkStatusCounts`, and `errorClassCounts` when any chunk fails.
- Each chunk log now includes `errorClass` and `error`.
- `scripts/run-sgo-historical-backfill.sh` now copies `latest.log` even when the runner exits non-zero, then exits with the runner code so cron can flag the failure.
- SGO key rotation now continues past 401/403/429 instead of stopping on the first bad/exhausted key.

Proof:
- `node --check scripts/sgo-run-backfill.mjs` passed.
- `zsh -n scripts/run-sgo-historical-backfill.sh` passed.
- `npm run build` passed.
- Verification run returned top-level `ok: false`, `status: partial`, `failedChunks: 2`, and `errorClassCounts: { source_auth_error: 2 }` before quota classification was tightened.

Classification artifact:
- `tmp/sgo-backfill-error-classification-2026-04-27.md`

Current diagnosis:
- Recent SGO failures are mostly `source_quota_exhausted`, not Supabase health.
- Active SGO keys are at/over monthly entity quota (`current-entities` >= `max-entities`), causing event pulls to return 401.
- Separate MLB March windows fetched 50 events but produced 0 candidates, so those need normalizer/market inspection — not blind retries.

Next step:
- Stop/reduce SGO historical catch-up until quota resets or new capacity is added.
- Inspect MLB March raw cache to learn why 50 fetched events normalize to 0 candidates.
