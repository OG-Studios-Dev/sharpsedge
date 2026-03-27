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
| Player injury certainty | ⚠️ PARTIAL | nhl.com news URL slug tags only |
| Per-player shot quality | ❌ TODO | Would require player ID→team roster join |
| Season-long HDCF (full 73 games) | ❌ NOT DONE | Too expensive per-request; need cron |

### Remaining blockers / next steps

| Item | Status | Notes |
|---|---|---|
| Full-season HDCF% | Not implemented | 73 PBP fetches per team too slow; cron+cache recommended |
| Per-player xG attribution | Not implemented | Needs player ID → team mapping, skip for now |
| Mid-danger HDSV%/LDSV% | Not implemented | Could add to aggregateTeamShotProfile() when needed |
| Player-level injury certainty | Partial | nhl.com news URL tags only |
| Grading loop tightening | P1 | More outcomes needed before DB weights overtake priors |

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

## Review
- 1bfe9b9: NHL feature module, context scoring, debug route.
- 12588bf: MLB feature module, generator parity, debug route.
- 187134f: PGA feature module, generator parity, debug route, multi-sport source matrix.
- 7394196: PGA bundled fallback snapshot + 3-tier DG fallback chain.
- c24bc22: NBA fallback/provenance hardening + PGA OWGR supplement infrastructure.
- fca9cae: OWGR status corrected to dormant/secondary when unavailable.
- [CURRENT]: MLB weather floor-to-hour fix (0/8→8/8), PGA course weather rail, bundled snapshot refresh tooling.
