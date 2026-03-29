# Masters Week Roadmap
**Created:** 2026-03-29 | **Status:** 🟡 Yellow — not green
**Tournament:** The Masters — April 9–13, Augusta National

---

## Honest Current State

Masters week is **yellow, not green.** The PGA pipeline works but has real gaps:

- DG predictions often arrive thin pre-tournament (~6 of 135-field players get win probs until pairings are set Thursday)
- OWGR coverage is 0% from DG field scrape (worldRank key likely changed in HTML)
- Fallback odds pipeline requires a manual Wednesday-night scrape run — not yet automated
- Pick persistence follows the Supabase-backed locked-slate pattern (same as NHL/NBA/MLB post-2026-03-29) but has not been battle-tested for a full Masters week cycle
- Goose V2 PGA gate requires ≥ 50 graded tournament rounds — currently at ~0

Known bugs fixed before this sprint (sequence-relevant):
- ✅ MLB persistence gap fixed (2026-03-29, commit 2db6ba6) — same pattern needed for PGA
- ✅ History month-filter bug fixed (all-sports W-L now respects monthFilter)
- ✅ Nuclear-clear false wipe fixed (MLB _v8 and Golf _v11 no longer wiped on every load)
- ✅ MLB weather floor-to-hour fix (0/8 → 8/8 games with weather)

---

## Section 1 — Masters Week Must-Do List

> These ship before Thursday April 9. No exceptions.

### PGA Data Reliability
- [ ] **Fix OWGR from DG field** — add debug logging to `fetchDGField()` to identify actual row keys; repair worldRank extraction. OWGR is 0% and blocks ranking-based signals entirely.
- [ ] **Re-run DG scrape Thursday morning after pairings post** — DG only publishes full field predictions after R1 pairings are set. Confirm `/api/golf/scrape` returns ≥ 100 player predictions before R1 tee time.
- [ ] **Automate Wednesday-night odds ingestion** — before R1 locks, scrape real Top 5/10/20/winner odds from Bovada/DK/FanDuel and ingest alongside picks. If odds can't be confirmed → pick does not save. No placeholders (rule set 2026-03-26).

### Prediction & Pick Coverage
- [ ] **PGA snapshot refresh before tournament** — run `POST /api/admin/pga-snapshot-refresh` on Wednesday April 8 after final odds scrape to update bundled snapshot with live Masters field data.
- [ ] **Verify prediction coverage** — after Thursday pairings: target ≥ 100 DG predictions. If still < 20, flag in UI ("model predictions loading — check back Thursday AM").
- [ ] **Confirm course weather rail is active for Augusta** — Augusta National (33.5031, -82.0197) must be mapped in `pga-course-weather.ts`. Verify weather signals fire for Masters week forecast.
- [ ] **SG category splits** — sgT2G, sgAPP, sgPUTT are currently null (only sgTotal available). Check if DG player profile pages expose these before the tournament and wire if feasible. Low effort, meaningful for Augusta-specific analysis.

### Fallback Odds & Data Quality Transparency
- [ ] **Surface DG prediction coverage count in UI** — show "X of Y field players have model predictions" so users can see the honest data state rather than silently getting sparse picks.
- [ ] **Fallback odds badge** — if odds were populated from pre-tournament scrape (not live), badge picks as "Pre-tournament odds — verify before betting."
- [ ] **Data quality label for thin DG prediction weeks** — reuse/extend existing source provenance system; surface warning when picks are built primarily from courseFit + rankings with no DG win probs.

### Stability
- [ ] **Smoke test `/api/debug/pga` and `/api/golf/scrape`** on Sunday April 5 (day before Masters practice rounds begin). Confirm 3-tier DG cache (Supabase → /tmp → bundled snapshot) is warm.
- [ ] **Confirm PGA pick persistence** (Supabase locked-slate pattern) fires correctly for Masters by running a dry test pick generation before Wednesday.

---

## Section 2 — Pre-Masters QA Checklist

> Run this between April 5–8. Every item must be green before R1 Thursday.

### Data Layer
- [ ] `/api/debug/pga` → status=ok, all steps pass
- [ ] `/api/golf/scrape` → tournament = "The Masters 2026", ≥ 100 predictions (if pairings posted), ≥ 100 courseFit entries, ≥ 100 field entries
- [ ] DG Supabase cache fresh (< 2h old at time of check)
- [ ] OWGR coverage > 0% (worldRank fix must be live)
- [ ] Course weather: Augusta National mapped, `course_weather.status = "available"`, forecast returned for April 10–13 window
- [ ] Odds ingested from real source (Bovada/DK): ≥ 30 players with winner odds, ≥ 10 with Top 5/10/20 odds

### Pick Generation
- [ ] Golf picks generate without error (no empty slate)
- [ ] ≥ 3 tournament winner picks generated (if DG predictions ≥ 50)
- [ ] Lock/Top-5/Top-10/Top-20 picks present
- [ ] Pick odds NOT fabricated — all sourced from Wednesday scrape or flagged as missing
- [ ] Pick persistence: slate locks to Supabase on first generation, returns locked slate on subsequent calls
- [ ] `pick_snapshot.factors.pga_features` present on at least 1 pick (model learning hook)

### History & Resolution
- [ ] Pick history resolves correctly for prior tournament (Houston Open picks should show final W/L, not "pending")
- [ ] History month-filter works: selecting "April" shows only April picks
- [ ] Nuclear-clear does NOT wipe Golf _v11 cache on page load

### UX / Surface
- [ ] `/picks` shows golf section during tournament week (not blank)
- [ ] Data quality warning displays if prediction coverage < 20 players
- [ ] Fallback badge renders on picks with pre-tournament odds

### Known Regressions to Recheck
- [ ] Soccer goalDifference bug (2026-03-23 QA) — confirmed fixed or explicitly deprioritized
- [ ] Home/away reasoning consistency bug (pick text must match payload `isHome` flag)
- [ ] Trends dedupe / freshness (still observed stale/duplicate items in 2026-03-23 QA)

---

## Section 3 — Post-Masters Roadmap (Phased)

> Prioritized by impact. Masters week forces the data-quality discipline that benefits all sports.

---

### Phase 1 — Data Quality & Signal Hardening (April 14–30)
*Fix the foundations before scaling. Masters week will expose every gap.*

**PGA / DataGolf**
- OWGR integration complete (DG field scrape fix + fallback)
- SG category splits (sgT2G, sgAPP, sgPUTT) from DG player profiles — per-player fetch if needed
- Full-year PGA venue database (currently 16 venues; add as events come up)
- Automate Wednesday-night odds scrape as a proper cron (not manual) — wire into `vercel.json`
- ESPN leaderboard live position → PGA context hints (make/cut bets mid-tournament)
- DataGolf-powered live tournament model (win prob updates during rounds)

**MLB**
- BvP history population: sparse at season start, self-resolves; monitor by April week 2
- K/BB, handedness, home/away splits: all self-resolve as season accumulates stats; no action required unless signals remain null by April 10
- Umpire seed refresh: add any 2026 new/promoted umps that appear in boxscores
- `home_field` signal: add auto-tag (currently priors-only)

**Cross-sport**
- Schema hardening: add required-field validation on `pick_snapshot.factors` before generation — catches null-snapshot bugs early
- Source health alerting: wire `/api/admin/source-health` degradation output to a daily Telegram alert (not just an API endpoint)

---

### Phase 2 — Goose V2 Learning Loop Activation (May–June)
*The model launched 2026-03-27. Phase 2 is about earning the first promotion gate.*

- Daily auto-grade cron must run uninterrupted — confirm Vercel cron reliability (check logs weekly)
- Signal scorecard review: target ≥ 3 signals per sport with ≥ 15 appearances by May 30
- Thin-sample decay for NHL: add if xG/HDCF signals show false edges as sample grows
- CLV / price movement context: deferred (needs The Odds API `historical` or Pinnacle live feed); revisit when budget allows
- MLB lineup-refresh comparison: compare `baseline-v1` vs `lineup-refresh-v1` experiment_tag win rates by end of April
- PGA: first graded tournament rounds land in April; target ≥ 50 by end of May

**Goose V2 Gate Progress Milestones**
| Gate | Target Date | Current |
|---|---|---|
| 200 graded picks/sport (NBA/NHL/MLB) | June 15 | ~0 |
| 50 graded PGA rounds | May 31 | ~0 |
| ≥ 3 signals ≥ 62% WR per sport | June 30 | 0 signals qualified |
| Stage 1 internal toggle eligible | July 1 | Blocked on gates |

---

### Phase 3 — Systems Tracking & Blocked Systems Unblock (June–July)
*Fuch's Fade is live. Unlock the next tier.*

**Active systems (maintain quality)**
- All 6 `trackable_now` systems generating qualifier logs: monitor weekly for data staleness
- Mattys 1Q Chase NBA: verify 1Q line availability doesn't degrade mid-NBA-playoffs
- Tony's Hot Bats: MLB stats accumulate — validate price discipline / validation layer by May 1
- Fuch's Fade: first real qualifier fires after 2+ hourly Supabase snapshots for NBA games — confirm this triggers in April

**Blocked systems (unblock in priority order)**
1. **Beefs Bounce-Back**: needs prior-game closing spread archive → The Odds API `historical` endpoint or similar; cost ~$50/mo on paid tier; revisit after Phase 2 has ROI signal
2. **Fat Tonys Fade**: needs public betting handle splits → Covers/Action Network paid API; block until organic revenue covers cost
3. **BigCat Bonaza PuckLuck**: xG data live, only gap is "public rule capture" (define thresholds) — low effort, do in May during NHL playoffs
4. **Quick Rips F5**: needs F5 moneyline/total ingestion + qualifier rule definition — medium effort, schedule for June
5. **Coaches Fuming Scoring Drought**: NLP/news classifier required — complex; park for Phase 4

---

### Phase 4 — User-Facing Features & Monetization (July+)
*Only after Goose V2 has earned its gates.*

- Goose V2 Stage 1 toggle (internal testers only) — gated on 6 production-readiness gates
- Player Analysis page V2 (LineMate-level: DVP, game log, bar chart, hit rate timeline)
- Defense vs Position (DVP) for NBA + NFL
- Gamification: streak tracker, accuracy badges, leaderboard (needs ~50 active users)
- Subscription gating: free/pro/sharp tiers with clear feature demarcation
- App Store submission: Capacitor wrapper (Apple Dev account $99/yr required)

---

## Sequencing Rationale

1. Masters week forces PGA reliability — the gaps (OWGR, DG prediction coverage, odds fabrication risk) would be embarrassing in production during the biggest golf week of the year.
2. MLB is now in-season with all primary rails live. The remaining blockers are self-resolving or minor. No sprint needed.
3. Goose V2 needs quiet accumulation time — no manual intervention required, just keep crons healthy.
4. Systems unblocking has a clear cost-gated order: free unblocks (BigCat, Quick Rips rule definition) before paid-API unblocks (Beefs, Fat Tonys).
5. User-facing features come last — the model must earn its way to users, not be shipped before gates pass.

---

*This document reflects the honest state as of 2026-03-29. Update after Masters week with actual data-quality observations.*
