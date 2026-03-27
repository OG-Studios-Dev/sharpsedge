# TODO

## NHL Shot Event Rail — 2026-03-27 (v2, PBP aggregate implemented)

### What was implemented in this build

**5. Shot Event Ingestion + Zone Classification + xG Model** ✅ LIVE
- **New file:** `src/lib/nhl-shot-events.ts` (pure TypeScript, no external deps)
- Source: `api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play`
  - All shot event types: shot-on-goal, missed-shot, blocked-shot, goal
  - Each event has x/y coordinates (x ∈ [-100, 100], y ∈ [-42, 42]), shot type, situationCode
  - `homeTeamDefendingSide` per event handles period-to-period side switching
- **Zone classification** (NST convention): HD ≤ 20ft, MD ≤ 55ft, LD > 55ft
  - Distance computed: sqrt((netX - x)^2 + (netY - y)^2), net at (±89, 0)
  - Coordinate normalization uses `homeTeamDefendingSide` + event owner team ID
- **xG model**: logistic(β0=-1.5, β_dist=-0.030/ft, β_angle=-0.009/°) + shot type + situation mods
  - Calibrated: HD tip-in 5ft → 26.2%, avg shot 40ft → 5.3%, LD 60ft slap → 2.1%
  - Shot type modifiers: deflection +0.97, tip-in +0.82, wrist 0 (baseline), slap -0.35
  - Situation mods: PP +0.12, SH -0.08, EN +0.20, 5v5 0
- **`aggregateTeamShotProfile()`**: last 10 completed regular-season games per team
  - Returns: CF%, HDCF%, HDCA%, HDSV% (goalie), xGF%, xGAgainst%, score-adj CF%
  - Cache: 24hr per completed game PBP (data immutable), 60min per team profile
- **`getShotEventsForGame()`**: raw shot events with classification for any gameId
- **`getTeamRecentGameIds()`**: last N regular-season completed games per team
- **`getMatchupShotContext()`**: both teams' profiles + HD edge + xG edge + quality tier

**6. New Signals: shot_danger_edge + opponent_goalie_hd_weakness** ✅ LIVE
- `shot_danger_edge`: fires when team HDCF% ≥ 3.0pp above opponent (prior 0.58)
- `opponent_goalie_hd_weakness`: fires when opponent goalie HDSV% < 0.80 (prior 0.56)
- Both added to `GOOSE_SIGNALS` in types.ts + patterns in signal-tagger.ts
- Signal priors in `NHL_SIGNAL_PRIORS` in nhl-features.ts

**7. NHLContextHints + NHLFeatureSnapshot Extended** ✅
- New fields: `team_hdcf_pct`, `opponent_hdcf_pct`, `hd_edge`, `team_xgf_pct`,
  `opponent_xgf_pct`, `team_hd_save_pct`, `opponent_hd_save_pct`, `shot_quality_tier`
- `fetchNHLContextHints()` now calls `aggregateTeamShotProfile()` for both teams in parallel
- `shot_danger_edge` and `opponent_goalie_hd_weakness` auto-tagged in context hints
- `scoreNHLFeaturesWithSnapshot()` includes all new shot zone fields in frozen snapshot

**8. Debug Route Updated** ✅
- Step 4b: `shot_zone_profile` — 5-game PBP profile for sample team (live)
- Context hints now show all shot zone fields
- Feature scorer shows `shot_danger_edge_active` + new snapshot keys

**9. Source Map Updated** ✅
- `nhl-data-lattice.ts`: HDSV% and HDCF% now LIVE (was BLOCKED)
- `NHLDataSource` enum: added `nhl-gamecenter-pbp` and `nhl-pbp-aggregate`
- `NHLGoalieGameContext.provenance.zoneSplits`: now accepts `"nhl-pbp-aggregate"`

### Current vs Blocked Matrix

| Feature | Status | Source |
|---|---|---|
| Schedule/standings | ✅ LIVE | api-web.nhle.com/v1 |
| Team PP/PK stats | ✅ LIVE | api.nhle.com/stats/rest |
| Goalie EV/PP/SH SV% | ✅ LIVE | api.nhle.com/stats/rest (savesByStrength) |
| Goalie HDSV% | ✅ LIVE (2026-03-27) | nhl-pbp-aggregate (PBP x/y coords) |
| Team HDCF%/HDCA% | ✅ LIVE (2026-03-27) | nhl-pbp-aggregate (PBP x/y coords) |
| Zone-level xG model | ✅ LIVE (2026-03-27) | nhl-pbp-aggregate (dist+angle+type) |
| CF% (Corsi) | ✅ LIVE (2026-03-27) | nhl-pbp-aggregate |
| MoneyPuck aggregate xG% | ✅ LIVE | GitHub mirror CSV |
| PP efficiency signal | ✅ LIVE | NHL stats REST |
| Goalie PP weakness | ✅ LIVE | NHL stats REST (savesByStrength) |
| Shot danger edge signal | ✅ LIVE (2026-03-27) | nhl-pbp-aggregate HDCF% diff |
| Goalie HD weakness signal | ✅ LIVE (2026-03-27) | nhl-pbp-aggregate HDSV% |
| Player injury certainty | ✅ IMPROVED (2026-03-27) | nhl-roster-api injuryStatus + news tags; healthy scratches still blocked |
| Per-player xG attribution | ✅ LIVE IN PICKS (2026-03-27 v3) | aggregatePlayerShotProfiles() in fetchNHLContextHints(); player_shot_quality_edge signal wired |
| Shot aggregate Supabase storage | ✅ IMPLEMENTED (2026-03-27) | nhl_shot_aggregates + nhl_player_shot_profiles tables; L2 persistent cache |
| Season-long HDCF (full 73 games) | ✅ LIVE (2026-03-27 v3) | /api/admin/nhl-shot-refresh?mode=full — 50-game window, Supabase L2 |

### Status after 2026-03-27 pass (items 1–3, v3 — learning model wired)

**Item 1 (v3): Cron/prewarm route for NHL shot aggregate storage** ✅ COMPLETE
- `src/app/api/admin/nhl-shot-refresh/route.ts` — new admin route
  - GET: dry-run status (returns all 32 teams, cadence guidance, mode options)
  - POST: force-prewarm Supabase L2 cache for all 32 NHL teams
  - `mode=rolling` (default): last-10-game rolling profiles + player profiles (fast, daily cadence)
  - `mode=full`: rolling + 50-game full-season profiles (slower, weekly cadence)
  - `mode=players`: per-player xG profiles only
  - `?team=TOR`: single-team refresh for debugging
  - Per-team error isolation: failures collected, non-fatal, reported in response
  - Guarded by ADMIN_SECRET or SCRAPE_SECRET (dev-unrestricted when no secrets set)
  - maxDuration=300s for full 32-team run
- Data flow: same `aggregateTeamShotProfileWithStorage()` function used by pick generation
  → consistent with what live picks see (no separate pipeline)

**Item 2 (v3): Player shot-quality / xG profile signals → pick generation + goose learning** ✅ COMPLETE
- `fetchNHLContextHints()` now fetches `aggregatePlayerShotProfiles()` for both teams in parallel
  (alongside existing team-level shot profiles — one `Promise.all`)
- `top3AvgXg()`: extracts average xG/game for team's top-3 xG generators
- New `NHLContextHints` fields:
  - `team_top3_avg_xg_per_game` — team's top-3 xG/game average (0.421 for DET in live test)
  - `opponent_top3_avg_xg_per_game` — opponent top-3 xG/game average
  - `player_xg_edge` — team top3 - opp top3 (0.039 live; >= 0.025 fires signal)
- New signal: `player_shot_quality_edge` added to `GOOSE_SIGNALS` in types.ts
  - Prior: 0.57 in `NHL_SIGNAL_PRIORS`
  - Auto-tags in `fetchNHLContextHints()` when `player_xg_edge >= 0.025`
  - Text patterns in `signal-tagger.ts` for reasoning-text tagging
- Live test (DET @ home game, 2026-03-27): 24 players, top-3 avg = 0.421, edge = 0.039 → fires

**Item 3 (v3): Snapshot/provenance capture for goose learning model** ✅ COMPLETE
- `NHLFeatureSnapshot` now includes:
  - `team_top3_avg_xg_per_game: number | null` — top xG generator concentration
  - `opponent_top3_avg_xg_per_game: number | null`
  - `player_xg_edge: number | null` — differential for this specific matchup
  - `player_shot_quality_edge_active: boolean` — was signal fired for this pick?
- All fields frozen into `pick_snapshot.factors.nhl_features` at pick generation time
  → learning model can query these fields to correlate player xG quality with outcomes
- `scoreNHLFeaturesWithSnapshot()` properly propagates from `contextHints` → snapshot

**Debug route v3 updates** ✅
- Step 4c (new): `player_xg_profiles` — top-5 players by xG/game + top-3 average + signal threshold note
- Step 6 (updated): feature scorer now shows `player_shot_quality_edge_active`, `player_xg_edge`,
  `team_top3_avg_xg_per_game`, `opponent_top3_avg_xg_per_game`, and `player_shot_quality_edge: 0.57` in priors
- Pipeline description updated with `playerXgRail` and `prewarmRoute` entries

**Build + live API verification** ✅
- `tsc --noEmit`: 0 errors
- `npm run build`: clean (no type or build failures)
- `GET /api/admin/nhl-shot-refresh`: dry-run response with all 32 teams ✅
- `GET /api/debug/nhl`: status=ok, all 8 steps pass ✅
  - `player_xg_profiles.playersFound = 24` (DET), `top3AvgXgPerGame = 0.421`
  - `context_hints.player_xg_edge = 0.039` (above 0.025 threshold)
  - `feature_scorer.player_shot_quality_edge_active = True`
  - `feature_scorer.priors_applied.player_shot_quality_edge = 0.57`

**Remaining blockers** (unchanged):
- Full-season cron invocation: route exists; wire into Vercel cron config (vercel.json) if desired
- Healthy scratches / DTD certainty: no public API; paid injury feed only real fix
- Player injury certainty at lineup announcement time (~1hr pre-puck): real-time monitor needed

---

### Status after 2026-03-27 pass (items 1–3)

**Item 1: Full-season / rolling shot-event aggregate storage** ✅ IMPLEMENTED
- Supabase migration: `supabase/migrations/20260327150000_nhl_shot_aggregates.sql`
  - `nhl_shot_aggregates` table (team-level rolling + full_season profiles)
  - `nhl_player_shot_profiles` table (per-player xG attribution)
  - Unique indexes on (team_abbrev,season,aggregate_type) and (player_id,season)
  - RLS: public read, authenticated write
- `aggregateTeamShotProfileWithStorage()` — L1 (memory 60min) → L2 (Supabase 3hr/rolling, 24hr/full_season) → L3 (fresh PBP)
- `saveTeamShotProfileToDB()` / `loadTeamShotProfileFromDB()` — upsert/read from Supabase
- Context hints in `fetchNHLContextHints()` now use `aggregateTeamShotProfileWithStorage()` (was direct compute)
- Full-season path: call `aggregateTeamShotProfileWithStorage(team, 30-50, "full_season")` — uses same cache/storage, just wider game window
- Blocked: cron job to pre-compute full-season profiles for all 32 teams (73 fetches per team = too slow on-demand; would need a scheduled route)

**Item 2: Injury certainty** ✅ IMPROVED (best achievable from public APIs)
- New: `getNHLTeamInjuries(teamAbbrev)` in `nhl-api.ts`
  - Source: `api-web.nhle.com/v1/roster/{abbrev}/current` — structured injuryStatus field
  - `injuryStatus = "IR" | "IR-NR" | "LTIR"` → `certainty: "confirmed_out"` (high confidence)
  - `injuryStatus = "DTD"` → `certainty: "day_to_day"` (uncertain — may still play)
  - All other statuses → `certainty: "unverified"`
  - `likelyUnavailable: boolean` only true for confirmed_out
  - Explicit `uncertaintyNote` per player, `railNote` per report
- `TeamInjuryReport` wired into `NHLContextTeamBoardEntry.sourced.injuries`
- `NHLContextHints` extended: `team_confirmed_out_count`, `team_day_to_day_count`, `opponent_has_confirmed_injuries`, `injury_rail_note`, etc.
- Source health: new `nhl-injuries` check in context board
- **STILL BLOCKED**: Healthy scratches (coach day-of-game decisions) — not in any public API. Pre-game lineup (~1hr before puck drop) remains the only true confirmation. DTD is still uncertain.

**Item 3: Per-player xG attribution** ✅ IMPLEMENTED
- `aggregatePlayerShotProfiles(teamAbbrev, limit)` in `nhl-shot-events.ts`
  - Source: NHL PBP `details.shootingPlayerId` — present on all shot events (confirmed on live data)
  - `accumulatePlayerShots()` — groups shots by playerId, counts zones/types/situations
  - Player names resolved from `api-web.nhle.com/v1/roster/{abbrev}/current`
  - `PlayerShotProfile` type: totalShots, SOG, goals, HD/MD/LD breakdown, xG total, xG/game, xG/shot, HD xG, shot type distribution, 5v5/PP splits
  - Sorted by xG/game desc (best shot quality generators first)
  - Persisted to `nhl_player_shot_profiles` Supabase table (batch upsert, 20 rows/chunk)
  - `savePlayerShotProfilesToDB()` — Supabase upsert, non-blocking
  - API-verified: TOR game 2025021136 → 33 players with shots, top 5 confirmed correct

| Remaining blockers | Notes |
|---|---|
| Full-season cron pre-compute | 73 PBP fetches × 32 teams too slow on-demand; needs `/api/admin/nhl-shot-refresh` cron route |
| Healthy scratches | No public API exposes day-of-game coach decisions; only real fix is a paid injury feed |
| DTD certainty | NHL API DTD status does not confirm unavailability; pre-game lineup is ground truth |
| Mid-danger zone HDSV% | Could add to aggregateTeamShotProfile() but not yet needed |
| Per-player xG in context hints | profiles computed on-demand; not yet surfaced in pick generation signals |

---

## NHL Data Lattice Implementation — 2026-03-27 (v1, PP + goalie splits)

### What was implemented

**1. PP Efficiency Differential Signal** ✅ LIVE
- New API functions: `getNHLTeamPPStats()`, `getNHLTeamPKStats()` in `nhl-api.ts`
- Source: `api.nhle.com/stats/rest/en/team/{powerplay,penaltykill}` — 32 teams, live
- New context types: `SourcedPPContext`, `SourcedPKContext`, `DerivedPPEfficiency`
- PP efficiency differential wired into every `NHLContextTeamBoardEntry` as `sourced.pp`, `sourced.pk`, `derived.ppEfficiency`
- New signals: `pp_efficiency_edge` (fires at ≥0.02 diff) + `goalie_pp_weakness` (ppSavePct < 0.85)
- Signal priors: `pp_efficiency_edge: 0.57`, `goalie_pp_weakness: 0.55`
- Net special teams differential computed (team PP+PK vs opponent PP+PK)

**2. Goalie Zone Save Breakdown (EV/PP/SH)** ✅ LIVE (high-danger BLOCKED — see below)
- New API function: `getNHLGoalieStrengthStats()` in `nhl-api.ts`
- Source: `api.nhle.com/stats/rest/en/goalie/savesByStrength` — 80 goalies, live
- EV/PP/SH save % + shot counts now attached to `SourcedGoalieContext.strengthSplits`
- Propagated into `DerivedGoalieContext.strengthSplits`
- Alert flag `weak_pp_save_pct` fires when goalie ppSavePct < 0.85 with ≥10 shots
- New context hints: `opponent_goalie_pp_sv_pct`, `opponent_goalie_ev_sv_pct`

**3. NHL Data Lattice** ✅ NEW FILE
- `src/lib/nhl-data-lattice.ts` — canonical schema for all NHL ingestion layers:
  - `NHLIngestRecord` (audit trail per fetch)
  - `NHLOutcomeRecord` (graded pick + feature reference for model learning)
  - `NHLPickFeatureReference` (compact feature freeze for backtest queries)
  - `NHLBacktestConfig` + `NHLBacktestResult` + `NHLBacktestStratum` (multi-season backtest direction)
  - `NHLShotDangerContext` + `NHLMatchupXGByZone` (blocked schema, defined for when source gap resolves)
  - `NHLGoalieGameContext` (unified goalie schema combining available + blocked fields)
  - Full source gap map with explicit blockers and unblock paths

**4. Signal Registry** ✅
- `pp_efficiency_edge` and `goalie_pp_weakness` added to `GOOSE_SIGNALS` in `types.ts`
- Signal patterns added to `signal-tagger.ts`
- `NHLContextHints` expanded with PP fields + goalie strength split fields
- `NHLFeatureSnapshot` expanded with PP differential + PP signal flags

**5. Debug Route** ✅ UPDATED
- `GET /api/debug/nhl` now includes:
  - Step 2: Direct PP/PK/goalie strength API health check
  - Step 3: Context board (expanded with PP, PK, ppEfficiency, goalieStrength in sampleGame)
  - Step 4: Context hints (expanded with all new PP + goalie strength fields)
  - Step 6: Feature scorer (includes pp_efficiency_edge signal)
  - Pipeline description updated with source gap list

**6. Source Health** ✅
- New `special-teams` source health entry in `NHLContextBoardResponse`
- `meta.sources.specialTeams` with team counts, degradation flag, and source gap note

### What remains BLOCKED by source gaps

**Shot danger zones / xG-by-zone (HDSV%, HDCF%, HDSA%):**
- NHL API does NOT expose zone-level shot coordinates as team aggregates
- MoneyPuck GitHub mirror only exposes aggregate xGoalsPercentage (no zone breakdown)
- `NHLShotDangerContext` and `NHLMatchupXGByZone` types defined in lattice file for when this resolves
- Unblock path A: Aggregate NHL play-by-play shot x/y per team per season (doable, expensive)
- Unblock path B: MoneyPuck API subscription or find public NST/MP zone JSON endpoint

**High-danger SV% (HDSV%):**
- Only EV/PP/SH strength splits available from NHL stats REST API
- HDSV% specifically requires play-by-play shot coordinate classification
- `NHLGoalieGameContext` has hdSavePct/mdSavePct/ldSavePct fields defined but null until resolved

**Player-level injury certainty:**
- nhl.com team news links give URL-slug roster-move signals only
- No structured NHL injury/availability feed exists in the public API

### Multi-season backtest storage direction

Schema defined in `NHLBacktestConfig` / `NHLBacktestResult` / `NHLBacktestStratum`.
Requires: `NHLOutcomeRecord` rows populated as picks are graded (each graded pick in goose_model_picks
Supabase table should have its nhl_features snapshot extracted into this compact format for fast query).

To implement: add a post-grading hook that extracts NHLPickFeatureReference from pick_snapshot.factors.nhl_features and writes it to a `nhl_outcome_records` Supabase table. Then backtest runs can JOIN on signals, feature tiers, and season.

---

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

### NHL ✅ FIRING — upgraded 2026-03-27
- Source: NHL API (api-web.nhle.com/v1) + NHL Stats REST (api.nhle.com/stats/rest) + MoneyPuck GitHub mirror
- Schedule: 13 games yesterday, 2 today
- Goalie starters: "unavailable" pre-game (normal — goalies announced closer to game time)
- Rest/travel context: ✅ (back-to-back, rest days, travel km all populated)
- MoneyPuck xGoals: ✅ 32 teams, sourced from GitHub mirror
- PP stats: ✅ 32 teams, from NHL stats REST API (live)
- PK stats: ✅ 32 teams, from NHL stats REST API (live)
- Goalie EV/PP/SH strength splits: ✅ 80 goalie rows from savesByStrength
- PP efficiency differential signal: ✅ fires at ≥0.02 diff (moderate/strong tier)
- Goalie PP weakness signal: ✅ fires when ppSavePct < 0.85 with ≥10 shots
- Data lattice: ✅ nhl-data-lattice.ts — schemas, provenance, backtest types, source gap map
- Feature pipeline: nhl-features + nhl-context → pick_snapshot.factors.nhl_features (PP fields added)
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

---

## 2026-03-27 — MLB Live Production + Learning Activation (pass 4)

### MLB Activation Status (as of this pass)

**MLB Production picks: ✅ LIVE**
- Route: `/api/mlb/picks` → `getMLBDashboardData()` → `selectMLBTopPicks()`
- Picks generate from MLB Stats API schedule + enrichment board (park/weather/bullpen/starters/umpire/BvP)
- 8 games active today (Opening Day 2026)
- Production picks stored on correct rail (not sandbox)

**MLB Goose Learning/Sandbox picks: ✅ LIVE (bug fixed this pass)**
- Critical bug fixed: `MLB_SEASON_START_MONTH` was `3` (April) instead of `2` (March, 0-indexed)
- `canGenerateMLBPicksNow()` was returning `false` on March 27 → MLB was being SKIPPED from generate-daily
- After fix: `canGenerateMLBPicksNow()` returns `true` correctly for March 27
- Cron: `generate-daily` runs at `0 15 * * *` UTC (11 AM ET), includes MLB in sandbox mode
- Sandbox store: `goose_model_picks` table in Supabase, `experiment_tag: "baseline-v1"`, `sandbox: true`
- Picks accumulate daily for signal-weight learning loop
- Hard rules enforced: -200 odds cap ✅, sandbox separate from production ✅

**BvP matchup rail: ✅ LIVE (prior session wiring confirmed complete)**
- `mlb-bvp.ts` — MLB Stats API vsPlayer career splits per batter vs opposing starter
- Only fires when lineup is official (9+ confirmed batters in live feed)
- Aggregates PA-weighted OPS for top-5 batting-order batters
- Signal `lineup_bvp_edge` fires when avg OPS ≥ .750 with ≥ 3 batters having career history
- Prior: 0.61 (calibrated — lineup-confirmed matchup edge)
- Degrades gracefully: `insufficient_lineup` / `no_pitcher` / `insufficient_bvp_history`
- Cache: 24hr per (batterId, pitcherId) — career BvP won't change intra-game
- Wired: `mlb-enrichment.ts` → `mlb-features.ts` → `fetchMLBContextHints()` → snapshot → `generate-daily`
- `lineup_bvp_edge` in `GOOSE_SIGNALS`, `signal-tagger.ts`, `MLBFeatureSnapshot`
- Debug route: `/api/debug/mlb` Step 3 shows `bvp_matchup` sub-object; Step 5 confirms prior

**MLB signal matrix (complete):**

| Signal | Status | Source | Prior |
|---|---|---|---|
| park_factor | ✅ LIVE | Seeded Statcast park factors | 0.61 |
| weather_wind | ✅ LIVE | Open-Meteo via mlb-weather.ts | 0.61 |
| bullpen_fatigue | ✅ LIVE | MLB Stats API L3 boxscores | 0.60 |
| probable_pitcher_weak | ✅ LIVE | ERA quality score ≤ 45 | 0.63 |
| probable_pitcher_ace | ✅ LIVE | ERA quality score ≥ 65 | 0.62 |
| pitcher_command | ✅ LIVE | K/BB from schedule hydrate | 0.60 |
| home_away_edge | ✅ LIVE | Standings homeRecord/awayRecord | 0.57 |
| opponent_era_lucky | ✅ LIVE | ERA-FIP divergence (< -0.75) | 0.61 |
| team_era_unlucky | ✅ LIVE | ERA-FIP divergence (> +0.75) | 0.60 |
| umpire_pitcher_friendly | ✅ LIVE | MLB boxscore officials + seeded UmpScorecards | 0.58 |
| umpire_hitter_friendly | ✅ LIVE | MLB boxscore officials + seeded UmpScorecards | 0.57 |
| handedness_advantage | ✅ LIVE | MLB Stats API vsLeft/vsRight splits | 0.58 |
| lineup_bvp_edge | ✅ LIVE (2026-03-27 p4) | MLB Stats API vsPlayer career splits (official lineup only) | 0.61 |
| home_field | 🟡 PRIORS ONLY | No auto-tag yet | 0.54 |
| streak_form | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.60 |
| matchup_edge | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.62 |
| lineup_change | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.57 |

**Blockers remaining:**
- BvP fires only post-lineup-confirmation (~1-2h pre-game); generates during daily cron at 11 AM ET — may be before lineups are published. Not a bug — degrades gracefully to `insufficient_lineup` and picks still score from other signals.
- K/BB, handedness, home/away splits: self-resolve as the season accumulates stats (by April ~week 2).
- Healthy scratches / DTD certainty: no public API — existing caveats still apply.

---

## 2026-03-27 — NHL Cron Wire + MLB Regular Season Enablement

### NHL — Cron wired ✅
- **vercel.json**: Added two NHL shot refresh cron entries
  - `0 11 * * *` → `GET /api/admin/nhl-shot-refresh?cron=true` — daily rolling prewarm (6 AM ET)
  - `0 12 * * 1` → `GET /api/admin/nhl-shot-refresh?cron=true&mode=full` — weekly full-season prewarm (7 AM ET Mon)
- **Route updated** (`nhl-shot-refresh/route.ts`):
  - GET now handles `?cron=true` — executes prewarm instead of dry-run
  - `isAuthorized()` now accepts `CRON_SECRET` (Vercel cron pattern, consistent with rest of codebase)
  - Dry-run cadence doc updated to reflect cron schedule

### MLB — Regular season launch ✅
- **`/api/mlb/picks` enabled**: Removed hardcoded early return ("MLB picks launch with regular season"). Opening Day 2026 is today.
  - Picks flow confirmed: 8 games today, picks generating (e.g. CLE Win ML Road +151 Pinnacle)
  - Added `meta` to response (propsConsidered, trendsConsidered, gamesActive)
- **WHIP added to starter quality**:
  - `mlb-api.ts`: Schedule hydrate now requests `probablePitcher(stats(group=[pitching],type=[season]))` for season stats
  - `parseProbablePitcher()`: Now extracts `whip`, `strikeOuts`, `baseOnBalls`, `inningsPitched`
  - `mlb-enrichment.ts`: New `buildStarterQuality()` + `computeStarterQualityScore()` helpers
    - Blends ERA (60%) + WHIP (40%) when both available; falls back to ERA-only
    - `qualityMethod` field: `"era+whip-blend"` | `"era-only"` | `"unavailable"`
    - Season start note: ERA/WHIP null is expected until innings accumulate (qualityScore=null, method="unavailable")
- **`mlb-timing.ts` created** (`src/lib/goose-model/mlb-timing.ts`):
  - `getMLBSeasonTimingStatus()` — returns inSeason, reason (off-season Nov 1 – Mar 19)
  - `canGenerateMLBPicksNow()` — gate function for generate-daily
- **`generate-daily` updated**: MLB timing check wired — off-season generates skip MLB cleanly with reason logged
- **TypeScript**: Clean — `npx tsc --noEmit` produces 0 errors

---

## MLB Signal Buildout — 2026-03-27 (pass 3 — umpire zone rail + handedness splits)

### What was implemented

**Umpire Zone Rail** ✅ LIVE
- New file: `src/lib/mlb-umpire.ts`
  - `getMLBUmpireContext(gamePk)` — fetches HP ump from MLB Stats API boxscore officials pre-game
  - Seeded ump profile lookup from `src/data/mlb-umpire-stats.json` (76 active MLB umps)
  - Zone tier classification: `pitcher_friendly` | `neutral` | `hitter_friendly`
  - Fuzzy name matching (handles MLB API name format variations)
  - 60-min cache per gamePk (assignment stable day-of)
- New file: `src/data/mlb-umpire-stats.json`
  - 76 MLB umpires seeded from UmpScorecards + Baseball Reference 2019-2024 aggregates
  - Per ump: k_per_9, bb_per_9, run_per_game, zone_tier, sample_seasons
  - Source and provenance documented in meta block — no scraping, seeded static
- New signals in `GOOSE_SIGNALS` (types.ts):
  - `umpire_pitcher_friendly` (prior: 0.58) — tight zone, suppressed run environment
  - `umpire_hitter_friendly` (prior: 0.57) — loose zone, elevated run environment
- Auto-tags in `fetchMLBContextHints()` from enrichment board umpire context
- New `MLBContextHints` fields: `hp_ump_name`, `ump_zone_tier`, `ump_pitcher_friendly`, `ump_hitter_friendly`, `ump_zone_note`
- New `MLBFeatureSnapshot` fields: `umpire_pitcher_friendly_active`, `umpire_hitter_friendly_active`, `hp_ump_name`, `ump_zone_tier`
- Signal patterns added to `signal-tagger.ts`

**Team Batting Handedness Splits** ✅ LIVE
- New file: `src/lib/mlb-handedness.ts`
  - `getMLBHandednessSplits(teamAbbrev)` — MLB Stats API vsLeft/vsRight team batting splits
  - `computeHandednessMatchup(splits, pitcherHand)` — derives advantage tier vs opponent's hand
  - Advantage tiers: strong_advantage (OPS ≥ .750), moderate_advantage (≥ .720), neutral, disadvantage (≤ .680), unknown
  - 60-min cache; null at season start (< 30 AB) — non-fatal, expected
- New signal: `handedness_advantage` (prior: 0.58)
  - Fires when team OPS vs pitcher's hand is ≥ .720 (moderate) or ≥ .750 (strong)
  - Requires pitcher throwing hand from probablePitcher.hand (available when MLB API includes it)
- Wired via enrichment board: `game.handedness.away` / `game.handedness.home`
- New `MLBContextHints` fields: `opponent_pitcher_hand`, `team_ops_vs_hand`, `handedness_advantage_tier`, `handedness_advantage_fires`, `handedness_note`
- New `MLBFeatureSnapshot` fields: `handedness_advantage_active`, `opponent_pitcher_hand`, `team_ops_vs_hand`, `handedness_advantage_tier`

**Enrichment Board Extended** ✅
- `mlb-enrichment.ts`: umpire + handedness fetched in parallel with lineups/weather per game
- Both exposed in board game objects: `game.umpire`, `game.handedness.{away,home}`
- Sources updated in board metadata
- Error-isolated (`.catch(() => null)`) — failures don't break board generation

**Debug Route Updated** ✅
- Step 3 (context_hints): new `umpire_context` and `handedness_matchup` sub-objects
- Step 5 (feature_scorer): umpire + handedness signals in test, priors confirmed, snapshot keys exported
- Remaining gaps updated to reflect what's now live vs still blocked

**Build + Live API Verification** ✅
- `tsc --noEmit`: 0 errors
- `npm run build`: clean
- `GET /api/debug/mlb`: status=ok, 8 games
  - `umpire_context.hp_ump_name = "Chad Fairchild"` (NYY @ SF game — successfully fetched from boxscore)
  - `umpire_context.ump_zone_note = "Chad Fairchild — neutral zone tendencies (k/9 9, bb/9 2.9)."` (seeded profile matched)
  - `handedness_matchup.handedness_advantage_tier = "unknown"` (pitcher hand null for Schlittler at season start — expected)
  - `feature_scorer.priors_applied` confirms all 3 new signals wired: umpire_pitcher_friendly=0.58, umpire_hitter_friendly=0.57, handedness_advantage=0.58

---

## MLB Signal Buildout — 2026-03-27 (pass 2 — pitcher_command + home_away_edge)

### What was implemented

**Pitcher Command Signal (K/BB)** ✅ LIVE
- `computeKBB()` in `mlb-features.ts`: K/BB ratio from season `strikeOuts / baseOnBalls`
- Requires >= 5 IP to trust ratio — returns null at season start (expected, non-fatal)
- `MLBProbablePitcher` type extended: now includes `whip`, `strikeOuts`, `baseOnBalls`, `inningsPitched`
- `buildStarterQuality()` param signature updated to accept nullable fields
- Auto-tags `pitcher_command` in `fetchMLBContextHints()` when team K/BB >= 3.0
- New signal in `GOOSE_SIGNALS` (types.ts) with text patterns in `signal-tagger.ts`
- Prior: 0.60 in `MLB_SIGNAL_PRIORS`
- New `MLBContextHints` fields: `team_starter_k_bb`, `opponent_starter_k_bb`, `team_starter_command`, `opponent_starter_weak_command`
- New `MLBFeatureSnapshot` fields: `team_starter_k_bb`, `opponent_starter_k_bb`, `pitcher_command_active`

**Home/Away Split Rates** ✅ LIVE
- `getMLBTeamSplitRates()` in `mlb-api.ts`: parses homeRecord/awayRecord from `getMLBStandings()`
  - 30-min cache (standings only update after completed games)
  - Win rate = null when < 3 games in split (season-start safe, non-fatal)
- `fetchMLBContextHints()` now fetches split rates in parallel with enrichment board (`Promise.all`)
- Edge label logic:
  - `strong_home_edge`: team home rate >= .560 while playing at home
  - `weak_road_opponent`: opponent away rate <= .440 while team is home
  - `both` / `none` / `insufficient_data` as appropriate
- Auto-tags `home_away_edge` when label is strong_home_edge, weak_road_opponent, or both
- New signal `home_away_edge` in `GOOSE_SIGNALS` + patterns in `signal-tagger.ts`
- Prior: 0.57 in `MLB_SIGNAL_PRIORS`
- New `MLBContextHints` fields: `is_home`, `team_home_win_rate`, `team_away_win_rate`, `opponent_home_win_rate`, `opponent_away_win_rate`, `home_away_edge_label`
- New `MLBFeatureSnapshot` fields: `team_home_win_rate`, `opponent_away_win_rate`, `is_home`, `home_away_edge_label`, `home_away_edge_active`

**Debug Route Updated** ✅
- Step 3 (context_hints): now shows `pitcher_command` and `home_away_splits` sub-objects with note about season-start nulls
- Step 5 (feature_scorer): tests both new signals; priors_applied confirms pitcher_command=0.60, home_away_edge=0.57

**Build + API verified** ✅
- `tsc --noEmit`: 0 errors
- `npm run build`: clean
- `GET /api/debug/mlb`: status=ok (pitcher_command null + home_away insufficient_data both expected on Opening Day)
- feature_scorer correctly applies both priors; snapshot includes all new fields
- **Commit:** `0937c04`

### Current MLB Signal Status Matrix

| Signal | Status | Source | Prior |
|---|---|---|---|
| park_factor | ✅ LIVE | Seeded Statcast park factors | 0.61 |
| weather_wind | ✅ LIVE | Open-Meteo via mlb-weather.ts | 0.61 |
| bullpen_fatigue | ✅ LIVE | MLB Stats API L3 boxscores | 0.60 |
| probable_pitcher_weak | ✅ LIVE | ERA quality score ≤ 45 | 0.63 |
| probable_pitcher_ace | ✅ LIVE | ERA quality score ≥ 65 | 0.62 |
| pitcher_command | ✅ LIVE (2026-03-27) | K/BB from schedule hydrate | 0.60 |
| home_away_edge | ✅ LIVE (2026-03-27) | Standings homeRecord/awayRecord | 0.57 |
| home_field | 🟡 PRIORS ONLY | No auto-tag yet | 0.54 |
| streak_form | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.60 |
| matchup_edge | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.62 |
| lineup_change | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.57 |

### MLB Signal Status Matrix (after 2026-03-27 pass 3)

| Signal | Status | Source | Prior |
|---|---|---|---|
| park_factor | ✅ LIVE | Seeded Statcast park factors | 0.61 |
| weather_wind | ✅ LIVE | Open-Meteo via mlb-weather.ts | 0.61 |
| bullpen_fatigue | ✅ LIVE | MLB Stats API L3 boxscores | 0.60 |
| probable_pitcher_weak | ✅ LIVE | ERA quality score ≤ 45 | 0.63 |
| probable_pitcher_ace | ✅ LIVE | ERA quality score ≥ 65 | 0.62 |
| pitcher_command | ✅ LIVE | K/BB from schedule hydrate | 0.60 |
| home_away_edge | ✅ LIVE | Standings homeRecord/awayRecord | 0.57 |
| opponent_era_lucky | ✅ LIVE | ERA-FIP divergence (< -0.75) | 0.61 |
| team_era_unlucky | ✅ LIVE | ERA-FIP divergence (> +0.75) | 0.60 |
| umpire_pitcher_friendly | ✅ LIVE (2026-03-27 p3) | MLB boxscore officials + seeded UmpScorecards 2019-2024 | 0.58 |
| umpire_hitter_friendly | ✅ LIVE (2026-03-27 p3) | MLB boxscore officials + seeded UmpScorecards 2019-2024 | 0.57 |
| handedness_advantage | ✅ LIVE (2026-03-27 p3) | MLB Stats API vsLeft/vsRight team batting splits | 0.58 |
| home_field | 🟡 PRIORS ONLY | No auto-tag yet | 0.54 |
| streak_form | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.60 |
| matchup_edge | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.62 |
| lineup_change | 🟡 REASONING-TEXT ONLY | signal-tagger patterns | 0.57 |

### Remaining Blockers / Next MLB Build Order

| Priority | Feature | Blocker | Path |
|---|---|---|---|
| P1 | Individual BvP splits | MLB Stats API per-player cross-lookup (~6 calls/game, needs official lineup) | Architecture ready; needs lineup-confirmed trigger + per-batter split-fetch |
| P2 | K/BB signal fully live | Season-start (< 5 IP) returns null; will auto-populate | No action needed — self-resolves as season progresses |
| P3 | Handedness splits live | Opening Day returns no AB (vsLeft/vsRight endpoint returns empty at season start) | Self-resolves after ~30+ AB vs each hand |
| P4 | Home/away splits live | Opening Day returns insufficient_data; populates after ~5 games | No action needed — self-resolves |
| P5 | IL/injury diff rail | No structured MLB IL feed; RotoWire scraping is brittle | Best proxy: lineup_status field already in context |
| P6 | Umpire seed refresh | 76 umps seeded; newer/less-active umps may not match | Refresh from UmpScorecards annually or add missing umps as they appear |

### MLB extraction shortlist (worth porting later)
- **P1 — Batter vs Pitcher splits** (BvP):
  - MLB Stats API has a splits endpoint: `/api/v1/people/{id}/stats?stats=vsPlayer&group=pitching&opposingPlayerId={pitcherId}`
  - Requires lineup ID × starter ID cross-lookup per game (~4-6 API calls/game)
  - Highest signal leverage for player props (K-rate, OPS vs LHP/RHP)
  - Status: architecture ready (lineup IDs + starter IDs both available); need split-fetch layer + BvP signal
- **P2 — Umpire assignment rail**:
  - MLB umpire assignments published ~2h pre-game on MLB Stats API: `/api/v1/game/{gamePk}/boxscore` → officials
  - Home plate umpire K-rate and zone-expansion tendencies matter for totals/K props
  - Source: Baseball Reference / Retrosheet have historical umpire stats (not live API)
  - Status: gamePk available; umpire lookup would need separate ump-stats seeded JSON (like park factors)
- **P3 — Team L10 home/away splits from standings**:
  - MLB Stats API standings endpoint returns `splitRecords` (homeRecord, awayRecord, lastTen)
  - Currently used for streaks/record only; could add home_win_rate and away_win_rate signals
  - Low implementation cost, moderate signal value
  - Status: `getMLBStandings()` already fetches standings; just need split extraction
- **P4 — Pitcher K/BB ratio signal**:
  - `strikeOuts` and `baseOnBalls` now available via WHIP upgrade (see this build)
  - K/BB ≥ 3.0 → `pitcher_command` signal (good command = fewer walks = harder to score)
  - Status: data available now from schedule hydrate; just need signal definition + prior
- **P5 — IL/injury diff rail**:
  - No structured MLB IL diff feed; RotoWire/beat reporters are the only real-time source
  - Best approach: compare current roster vs yesterday's cached roster for additions
  - Low ROI given implementation complexity; lineup_status captures the downstream impact

## Review
- 1bfe9b9: NHL feature module, context scoring, debug route.
- 12588bf: MLB feature module, generator parity, debug route.
- 187134f: PGA feature module, generator parity, debug route, multi-sport source matrix.
- 7394196: PGA bundled fallback snapshot + 3-tier DG fallback chain.
- c24bc22: NBA fallback/provenance hardening + PGA OWGR supplement infrastructure.
- fca9cae: OWGR status corrected to dormant/secondary when unavailable.
- [PREV]: MLB weather floor-to-hour fix (0/8→8/8), PGA course weather rail, bundled snapshot refresh tooling.
- [CURRENT]: NHL cron wired (rolling daily + full weekly), MLB picks enabled (Opening Day 2026), WHIP in starter quality, MLB timing guard, BvP/umpire shortlist documented.
