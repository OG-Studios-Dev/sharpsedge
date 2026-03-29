# Goose V2 — Production Readiness Spec

**Status:** 🔴 NOT PRODUCTION READY  
**Last Updated:** 2026-03-29  
**Audience:** Engineering, Product

---

## 1. What Is Goose V2 / The Learning Model?

Goose V2 refers to the ML-signal-weighted picks engine in `src/lib/goose-model/`. It generates sports picks by scoring a feature vector (signal priors × Bayesian weights), stores them as sandbox picks in `goose_model_picks` (Supabase), auto-grades outcomes via cron, and incrementally updates signal weights based on results.

The V1 picks surface (what users see today) is a **separate, hand-curated rail** that generates from the same enrichment data but does NOT use the Goose model's learned weights for user-facing output.

Goose V2 picks are currently **admin-only / internal sandbox**. They are not shown to end users.

---

## 2. Current State

### What Is Live
- Pick generation cron (`/api/admin/goose-model/generate-daily` — 11 AM ET daily) ✅
- Auto-grade cron (`/api/admin/goose-model/auto-grade` — 7 AM ET daily) ✅
- Signal weight update loop (post-grade DB updates) ✅
- Promotion gate endpoint (`/api/admin/goose-model/promotion-candidates`) ✅
- Signal scorecard (`/api/admin/goose-model/signal-scorecard`) ✅
- Pick explainability (`/api/admin/goose-model/explain`) ✅
- Admin UI at `/admin/goose-model` for monitoring ✅
- Sandbox isolation (`sandbox: true`, `experiment_tag: "baseline-v1"`) ✅

### What Is NOT Ready
- No graded outcomes yet — model launched on Opening Day 2026-03-27; sample is near-zero
- Signal priors are hand-calibrated estimates, not empirically derived
- Promotion gates have never been triggered (0 eligible candidates is expected and correct)
- No user-facing toggle, surface, or mention exists in the consumer app
- Model accuracy, ROI, and calibration are all unknown at this stage

---

## 3. Production-Readiness Gates

All six gates must pass before Goose V2 picks can be exposed to users in any form.

### Gate 1 — Minimum Sample Volume
- **Requirement:** ≥ 200 graded picks per active sport (NHL, NBA, MLB; PGA separate threshold of ≥ 50 tournament rounds)
- **Current:** ~0 graded (launched 2026-03-27)
- **Why:** No meaningful signal-weight learning occurs below this threshold

### Gate 2 — Signal Win Rate Floor
- **Requirement:** At least 3 signals per sport with ≥ 62% win rate at ≥ 15 appearances (`promotion-candidates` gate 1)
- **Current:** 0 qualifying signals
- **Why:** Confirmed-edge signals are the foundation of pick quality

### Gate 3 — Hit Rate Floor
- **Requirement:** Rolling 30-day hit rate ≥ 58% per sport on picks scored ≥ 7 (high-confidence picks only)
- **Current:** Insufficient data
- **Why:** Below 55% hit rate on high-confidence picks = model is no better than noise

### Gate 4 — Edge at Capture
- **Requirement:** Average edge_at_capture ≥ 6% across graded picks per sport (`promotion-candidates` gate 2)
- **Current:** Insufficient data
- **Why:** Price discipline is non-negotiable; picks leaning into juice destroy bankroll

### Gate 5 — Odds Distribution
- **Requirement:** Average graded odds ≥ -150 and ≤ +350; no single sport >40% picks at or below -150 (`promotion-candidates` gate 5)
- **Current:** Unchecked — too few graded picks
- **Why:** Chalk-heavy output is low-value and signals the model is finding false edges

### Gate 6 — Stability Over Time
- **Requirement:** Signal win rates stable (±5%) across two consecutive 30-day windows — i.e., not spiking/collapsing between windows
- **Current:** Cannot measure — need 60+ days of data
- **Why:** A model that spikes then collapses is overfit to recent variance, not a real edge

---

## 4. Automation Requirements

> **Rule: Admin must never need to manually trigger pick generation or grading.**  
> The admin UI is for **monitoring, auditing, overrides, and debugging only.**

### What Must Be Fully Automated (already wired — maintain this)

| Action | Route | Cron Schedule |
|---|---|---|
| Daily pick generation | `GET /api/admin/goose-model/generate-daily` | `0 15 * * *` (11 AM ET) |
| MLB lineup refresh | `POST /api/admin/goose-model/mlb-lineup-refresh` | `0 21 * * *` (5 PM ET) |
| Daily auto-grade | `GET /api/admin/goose-model/auto-grade` | `0 7 * * *` (2 AM ET) |
| Sandbox auto-grade | `GET /api/admin/sandbox/auto-grade` | `30 7 * * *` |

### What Must NOT Require Manual Intervention
- Generating picks for any sport on any given day
- Grading picks after game results are final
- Updating signal weights after grading
- Detecting and logging degraded data sources
- Skipping off-season sports (MLB timing, NFL timing already guard this)

### What Admin IS For
- **Monitoring:** Source health (`/api/admin/source-health`), signal scorecards, pick volume
- **Auditing:** Reviewing pick decisions (`/api/admin/goose-model/explain`), signal weight drift
- **Overrides:** Manually voiding a pick (DNP, postponed game), correcting a mis-grade
- **Debugging:** Triggering a one-off generate/grade via POST when investigating a specific issue
- **Promotion review:** Reviewing `promotion-candidates` output before any model promotion decision

---

## 5. Rollout Stages

### Stage 0 — Internal Lab (Current)
**State:** All picks sandbox-only. Admin-visible only.  
**Exit criteria:** All 6 readiness gates pass.

### Stage 1 — Experimental Toggle (Earned)
**State:** Goose V2 picks exposed via a server-side feature flag, visible only to internal testers or allowlisted users.  
**Requirements before entering Stage 1:**
- Gates 1–6 all green
- Feature flag infrastructure in place (e.g., `GOOSE_V2_ENABLED=true` env var or Supabase flag table)
- Goose V2 picks clearly labeled as "experimental" in UI
- No user-facing marketing around the model yet

### Stage 2 — Soft Launch (Optional Mode)
**State:** Opt-in toggle or slider in app settings. Off by default.  
**UX requirements (see Section 6).**  
**Requirements before Stage 2:**
- ≥ 30 days stable at Stage 1 with no regressions
- Win rate and ROI trending positive across ≥ 2 sports
- Clear "experimental / not financial advice" disclaimer in UI

### Stage 3 — Default Mode (Only if Earned)
**State:** Goose V2 picks become the default picks surface, replacing or supplementing the hand-curated rail.  
**Requirements:** Demonstrated ROI superiority over 90+ days; explicit product decision.

---

## 6. UX Requirements for Consumer-Facing Mode

> Do not build this until Stage 1 gates are cleared. These requirements define what must be true before any user sees Goose V2 picks.

- **Labeling:** Every Goose V2 pick must be visually distinct from curated picks — e.g., a "model pick" badge or different card treatment
- **Disclaimer:** A clear, non-dismissable disclaimer on first use: "These picks are generated by an experimental model and are not financial or betting advice."
- **No confidence inflation:** Model confidence scores must NOT be displayed as win probabilities (e.g., "75% chance of winning") — only as internal tiers (e.g., "High Edge", "Moderate Edge")
- **Toggle UX:** If implemented as a slider/toggle, the default state must be OFF until Stage 3
- **Explainability surface:** Users must be able to tap a pick and see the primary reason it was selected (signal chain from `pick_why.primary_reason`) — no black-box picks for users
- **Override visibility:** Voided or manually adjusted picks must show a "manually reviewed" indicator

---

## 7. Key Metrics / Success Criteria

These are the metrics that determine whether Goose V2 is earning its way to production.

| Metric | Target | Measurement |
|---|---|---|
| Graded pick volume | ≥ 200/sport | `goose_model_picks` WHERE result != 'pending' |
| Overall hit rate (high-conf) | ≥ 58% | Picks with score ≥ 7, 30-day rolling |
| Signal win rate (top signal/sport) | ≥ 62% at ≥ 15 appearances | `/api/admin/goose-model/signal-scorecard` |
| Average edge at capture | ≥ 6% | `promotion-candidates` edge gate |
| Odds distribution | Avg ≥ -150, ≤ -200 cap always | `goose_model_picks.odds_at_capture` |
| Signal stability | Win rate delta ≤ ±5% across 2 windows | Manual scorecard comparison |
| Auto-grade success rate | ≥ 95% of picks graded within 24h | `integrity_status != 'unresolvable'` |
| Cron failure rate | 0 consecutive missed cron runs | Vercel cron logs |

---

## 8. What NOT to Ship Yet

The following must not ship until gates are cleared:

- ❌ Any user-facing mention of "AI picks", "model picks", or "learning model" in the consumer app
- ❌ A picks mode toggle or slider in app settings
- ❌ Marketing copy claiming model-driven pick performance
- ❌ Displaying Goose V2 confidence scores as probabilities to users
- ❌ Removing the sandbox isolation (`sandbox: true`) from any active experiment
- ❌ Promoting picks to production using the `promote` route without gate review
- ❌ Bypassing the `-200` odds hard cap for any reason
- ❌ Merging Goose V2 picks with the curated picks rail without an explicit feature flag

---

## 9. Automation Health Checklist (Ongoing)

Run this checklist when auditing the model's operational health. No manual steps should be required on a normal day.

- [ ] `generate-daily` cron ran successfully today (check Vercel cron logs)
- [ ] Pick volume for active sports is within expected range (2–10 picks/sport/day)
- [ ] `auto-grade` cron ran successfully this morning
- [ ] Unresolvable pick count is low (< 5% of yesterday's picks)
- [ ] Source health endpoint shows no critical degradations (`/api/admin/source-health`)
- [ ] Signal scorecard shows no signals with win rate < 40% at ≥ 10 appearances (red flag for inverted signal)

---

## 10. Promotion Decision Process

When all 6 gates eventually pass:

1. Review `promotion-candidates` output — must show ≥ 1 eligible candidate per active sport
2. Review signal scorecard for anomalies (no inverted signals, no thin-sample spikes)
3. Make explicit promotion decision in `DECISIONS.md` with date, rationale, and gate evidence
4. Enable Stage 1 feature flag — internal testers only
5. Monitor for 30 days before Stage 2 consideration
6. Never auto-promote — always a conscious decision with evidence logged

---

*This document governs Goose V2 rollout. Any change to the readiness gates or automation requirements must be recorded in `DECISIONS.md` with rationale.*
