# TODO

## Current push — fortress data + systems firing

- [x] NBA explicit feature/snapshot/debug parity
- [x] NHL explicit feature/snapshot/debug parity
- [x] MLB explicit feature/snapshot/debug parity
- [x] PGA explicit feature/snapshot/debug parity
- [x] PGA bundled fallback snapshot + 3-tier cache fallback
- [x] NBA degraded-state provenance + fallback visibility
- [x] PGA OWGR supplement rail (honest/dormant when unavailable)
- [x] PGA bundled snapshot refresh tooling (POST /api/admin/pga-snapshot-refresh — regenerates bundled snapshot from live Supabase DG cache, guarded, safe overwrite, commit-reminder output)
- [x] PGA course/weather rail (pga-course-weather.ts — Open-Meteo, 16 venues mapped, 30-min cache, weather signals wired into PGAContextHints + PGAFeatureSnapshot + PGA_SIGNAL_PRIORS)
- [x] MLB weather bug fixed (floor-to-hour matching — was 0/8 games with weather, now 8/8)
- [ ] Tighten grading/weight-learning loop across all sports now that feature snapshots exist.
- [ ] Audit every sport for stronger primary + fallback sources without adding brittle junk feeds.
- [ ] Wire ESPN leaderboard live position into PGA context hints (for make/cut bets mid-tournament).
- [ ] Add more PGA Tour venues to pga-course-weather.ts as new events come up.

## Systems Firing Audit — 2026-03-27

### NBA ✅ FIRING
- Source: ESPN (primary) + BDL fallback
- Schedule: 25 games active
- Rosters: ESPN with injury status (18 players/team, injuryStatus populated)
- Boxscores: ✅ Live, qualified players pulled
- Feature pipeline: nba-features + nba-context → pick_snapshot.factors.nba_features
- Goose model: generating picks today (e.g. Dyson Daniels 3.5 Assists)
- Debug: /api/debug/nba → all steps green

### NHL ✅ FIRING (partial degradation expected)
- Source: NHL API (api-web.nhle.com/v1) + MoneyPuck GitHub mirror
- Schedule: 13 games yesterday, 2 today
- Goalie starters: "unavailable" pre-game (normal — goalies announced closer to game time)
- Rest/travel context: ✅ (back-to-back, rest days, travel km all populated)
- MoneyPuck xGoals: ✅ 32 teams, sourced from GitHub mirror
- Feature pipeline: nhl-features + nhl-context → pick_snapshot.factors.nhl_features
- Debug: /api/debug/nhl → ok (goalie unavailable is expected pre-game)

### MLB ✅ FIRING
- Source: MLB Stats API + Open-Meteo + Statcast park factors (seeded)
- Schedule: 8 games today
- Weather: FIXED — was 0/8, now 8/8 (floor-to-hour match for Open-Meteo hourly slots)
- Park factors: 8/8 available
- Bullpen data: 8/8 available
- Probable pitchers: 8/8 (ERA null for season start — expected, qualityScore null)
- Lineups: 0/8 official (unconfirmed pre-game — expected timing)
- Feature pipeline: mlb-features → pick_snapshot.factors.mlb_features
- Debug: /api/debug/mlb → ok

### PGA ✅ FIRING
- Source: DataGolf scraper → Supabase primary → /tmp → bundled snapshot
- DG cache: ✅ Supabase primary, tournament = "Texas Children's Houston Open"
- Rankings: 500 players
- Predictions: 6 only (DG may not publish full field pre-tournament — known gap)
- CourseFit: 135 players
- Field: 135 players
- OWGR: 0% from DG field (worldRank not present in current scrape — documented gap)
- Course weather: ✅ LIVE — Open-Meteo, TPC Houston mapped (29.7656, -95.4307)
  - Today: 5.8 mph wind, 71.8°F, 0% precip → course_good_conditions signal auto-tagged
- Feature pipeline: pga-features + pga-course-weather → pick_snapshot.factors.pga_features
- Snapshot refresh: ✅ POST /api/admin/pga-snapshot-refresh updates bundled snapshot from live cache
- Bundled snapshot: refreshed from live Houston Open DG data (500 rankings, 135 courseFit)
- Debug: /api/debug/pga → ok, course_weather.status = "available"

### Soccer ✅ FIRING (no games — EPL/Serie A on international break)
- EPL: 0 games today, next matchday April 12 (international break Mar 27–Apr 10)
- Serie A: same break
- Standing data: ✅ 20 EPL teams loaded
- Rail: schedule correctly returns 0 during break — not a bug

## Source Strategy Rules
- Data quality > source quantity.
- Do not add brittle junk scrapers just to claim more coverage.
- Prefer reliable official/structured sources with explicit fallbacks.
- Every important signal should have provenance, degraded-state handling, and debug visibility.
- If a source is partial or weak, surface that honestly instead of silently blending it in.

## Remaining Blockers / Next Build Order

### P1 - Grading loop tightening
- The signal weight DB update path exists and is wired
- Need more outcomes to accumulate before signal priors naturally yield to DB weights
- Action: run /api/admin/goose-model/auto-grade daily; review which signals are accumulating

### P2 - PGA prediction coverage
- Only 6 DG predictions for Houston Open (vs 135 in field/courseFit)
- DG may not publish tournament-specific win probs until closer to round start
- Action: re-check /api/golf/scrape on Thursday after pairings are set

### P3 - OWGR from DG field
- 0% OWGR coverage despite field scrape
- worldRank key may have changed in DG field page HTML
- Action: add debug logging to fetchDGField() to see actual row keys

### P4 - PGA venue database expansion
- 16 PGA venues mapped in pga-course-weather.ts
- New venues should be added as they come up in the schedule

### P5 - SG category splits (sgT2G, sgAPP, sgPUTT)
- Currently null from DG rankings page (only dg_skill/sgTotal available)
- DG doesn't expose per-category SG on the rankings page
- Action: check if DG player profile pages expose these (would require per-player fetch)

## Review
- 1bfe9b9: NHL feature module, context scoring, debug route.
- 12588bf: MLB feature module, generator parity, debug route.
- 187134f: PGA feature module, generator parity, debug route, multi-sport source matrix.
- 7394196: PGA bundled fallback snapshot + 3-tier DG fallback chain.
- c24bc22: NBA fallback/provenance hardening + PGA OWGR supplement infrastructure.
- fca9cae: OWGR status corrected to dormant/secondary when unavailable.
- [CURRENT]: MLB weather floor-to-hour fix (0/8→8/8), PGA course weather rail, bundled snapshot refresh tooling.
