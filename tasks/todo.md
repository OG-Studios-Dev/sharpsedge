# TODO

- [x] Inspect current goose model vs sandbox responsibilities and answer whether they are the same system.
- [x] Implement an NBA feature registry / weighted signal scaffold aligned to Marco's ranked data priorities.
- [x] Expand the goose learning layer into a fuller NBA-first system: market-aware priors, structured feature snapshots, and sandbox-first learning flow.
- [x] Clean repo noise from the latest learning-system work if needed.
- [x] Add sandbox auto-grading loop.
- [x] Wire richer NBA injury / lineup / minutes context into goose feature snapshots.
- [x] Wire actual NBA numeric/context features into goose snapshots where current project data allows.
- [x] Improve explicit prop-line parsing and combo-prop mapping.
- [x] Push NBA to done-enough threshold with provenance/debug path.
- [x] Audit/test NHL mode against the same source -> ingestion -> snapshot standard.
- [x] Finish MLB parity: explicit goose feature module, snapshot provenance, and debug proof route.
- [x] Build source/fallback hardening matrix (sport-by-sport ingestion audit).
- [x] Implement PGA feature module (pga-features.ts) — highest-leverage hardening: brings PGA to feature parity with NBA/NHL/MLB in the goose generator.
- [x] Wire PGA features into generator.ts (context pre-fetch + blended scoring + pga_features in PickFactors).
- [x] Add PGA debug route (/api/debug/pga) for pipeline health visibility.
- [x] Add bundled DG snapshot fallback (similar to NHL moneypuck-team-context.snapshot.json pattern).
- [ ] Add Open-Meteo weather at course for PGA (requires course geocoordinates table).
- [ ] Wire live leaderboard position into PGA context hints for in-progress picks.
- [ ] Add formScore/courseHistoryScore passthrough from AIPick snapshot → PGA context hints.
- [x] Commit and push changes.
- [ ] Add review notes / outcome summary.

---

## Source/Fallback Hardening Matrix

### NBA
| Dimension | Detail |
|---|---|
| **Key inputs** | Schedule, odds/props, injuries/lineup, DVP (defense-vs-position), pace, player L5 game log, back-to-back, rest days |
| **Primary source** | ESPN hidden API (site.api.espn.com) — scoreboard, game summary, boxscores |
| **Fallback** | BallDontLie v1 API (BALLDONTLIE_API_KEY) — basic schedule/players only |
| **Validation/provenance** | Full `data_source_chain` in `NBAFeatureSnapshot`; `context_warnings[]`; per-fetch TTL cache |
| **Fragility** | Medium — ESPN is unofficial (ToS prohibits commercial use); BDL fallback is data-limited |
| **Feature module** | ✅ `nba-features.ts` + `nba-context.ts` |
| **Debug route** | ✅ `/api/debug/nba/pipeline` |
| **Highest-value missing** | Licensed source (MySportsFeeds ~$30/mo) for commercial path; official injury report diff feed |

### NHL
| Dimension | Detail |
|---|---|
| **Key inputs** | Schedule, goalie status (starter/backup), rest/B2B, travel fatigue (timezone hops), playoff pressure, xGoals% |
| **Primary source** | NHL official API (api-web.nhle.com/v1) — free, stable, officially supported |
| **Secondary source** | MoneyPuck xGoals data via GitHub mirror (raw CSV) |
| **Fallback** | Bundled snapshot: `data/nhl/moneypuck-team-context.snapshot.json` (survives deploys) |
| **Validation/provenance** | `source-health.ts` SourceHealthCheck per sub-source; `context_warnings[]` in NHLContextHints |
| **Fragility** | Low-Medium — NHL API is stable; MoneyPuck has bundled fallback |
| **Feature module** | ✅ `nhl-features.ts` (includes `fetchNHLContextHints`) |
| **Debug route** | ✅ `/api/debug/nhl` |
| **Highest-value missing** | Player-level scratch/injury status; goalie confirmation comes late (1–2h pre-game) |

### MLB
| Dimension | Detail |
|---|---|
| **Key inputs** | Schedule, probable pitchers (ERA/quality), park factors, weather/wind, bullpen fatigue (L3 games), lineup confirmation |
| **Primary source** | MLB Stats API (statsapi.mlb.com/api/v1) — free, official, stable |
| **Secondary sources** | Open-Meteo (weather per stadium geocoords); seeded Statcast park factors (in-repo JSON) |
| **Fallback** | Park factors: bulletproof (in-repo JSON). Weather: `status=indoor` for domes. Probable pitchers can be null (handled). |
| **Validation/provenance** | `sourceHealth` field in enrichment board (SourceHealthSummary); `context_warnings[]` in MLBContextHints |
| **Fragility** | Low — MLB Stats API is free and officially licensed; good fallback chain |
| **Feature module** | ✅ `mlb-features.ts` (includes `fetchMLBContextHints`) |
| **Debug route** | ✅ `/api/debug/mlb` |
| **Highest-value missing** | Statcast FIP/xFIP/K% (ERA-only proxy used); batter-vs-pitcher splits; umpire tendencies; structured IL/DL diff |

### PGA
| Dimension | Detail |
|---|---|
| **Key inputs** | DG rankings (SG T2G/APP/PUTT), DG predictions (win/top5/top10/top20 prob), DG course-fit score, form (recent tournaments), course history, book odds |
| **Primary source** | DataGolf HTML scraper (datagolf.com via cheerio) — parses inline JS blobs |
| **Cache layer** | Supabase DB (24h TTL) + /tmp local fallback |
| **Secondary source** | ESPN Golf API — leaderboard, schedule, player tournament history |
| **Fallback** | Supabase (24h TTL) → /tmp local file → **bundled repo snapshot** (`data/pga/datagolf-field.snapshot.json`). Bundled snapshot is book-odds-derived (Masters 2026 Bovada field + implied win probs). No DG skill/SG data in bundled tier. |
| **Validation/provenance** | `dgStatus.ready` gate in picks route; `DGCacheSummary` with reason string; `context_warnings[]` in PGAContextHints |
| **Fragility** | **Medium** — HTML scraping is brittle (DG changed URLs March 2026); bundled fallback now added (was High before this pass) |
| **Feature module** | ✅ `pga-features.ts` (added in this hardening pass) — `fetchPGAContextHints` + `scorePGAFeaturesWithSnapshot` |
| **Debug route** | ✅ `/api/debug/pga` (added in this hardening pass) |
| **Highest-value missing** | Bundled DG snapshot fallback; Open-Meteo weather at course; live leaderboard position context |

---

## Hardening Implemented (this pass)

**`pga-features.ts`** — PGA goose feature module (structural parity with NBA/NHL/MLB):
- 10 PGA signal priors: `dg_skill_edge`, `dg_course_fit_edge`, `dg_win_prob_edge`, `sg_tg_advantage`, `form_surge`, `course_history_edge`, `value_play`, `top_finish_market`, `matchup_edge`, `odds_movement`
- `fetchPGAContextHints(playerName, pickLabel, odds, formScore, courseHistoryScore)` — reads DG cache, auto-tags signals
- `scorePGAFeaturesWithSnapshot()` — same pattern as NBA/NHL/MLB (priors + DB weight blending)
- `detectPGAMarketType()` — market-aware routing (outright/top5/top10/top20/matchup/round-score)

**`generator.ts`** changes:
- PGA weight pre-fetch (`buildPGAWeightMap`)
- PGA context pre-fetch for all PGA candidates (reads from in-process DG cache)
- PGA feature scoring block (20% PGA prior / 80% base blend)
- `pga_features: PGAFeatureSnapshot | null` added to `PickFactors`

**`/api/debug/pga/route.ts`** — end-to-end PGA pipeline health check (DG cache status → context hints → signal tagger → feature scorer → parity verification → gaps inventory)

---

## PGA Source Strategy

**Current backbone:** DataGolf (datagolf.com) — HTML scraper → Supabase (24h TTL) → /tmp → bundled snapshot.

**Fallback chain (3 tiers):**
1. Supabase `datagolf_cache` table (primary — full DG signal quality: rankings, predictions, course-fit, field)
2. `/tmp/datagolf-cache.json` (local fallback — survives Supabase outages; may be stale up to 24h)
3. `data/pga/datagolf-field.snapshot.json` (bundled last resort — book-odds-derived only; no DG skill/SG; 121 Masters 2026 players)

**PGA Tour pages policy:** Manual validation only. No automated scraping (ToS). Use only for spot-checks.

**Future prod path:** Licensed feeds (Sportradar / SportsDataIO) — planned when commercial volume justifies cost.

**Source tier visibility:** `getDGCacheSummary().sourceTier` = "supabase" | "tmp" | "bundled" | "none". Exposed in `/api/debug/pga` response.

---

## Remaining Weak Rails (priority order)

1. ~~**PGA: No bundled DG snapshot**~~ ✅ RESOLVED — bundled snapshot added (`data/pga/datagolf-field.snapshot.json`).
2. **PGA: DG scraper fragility** — HTML scraping already broke once (March 2026). DG API access (paid) would be the right long-term fix. Current bundled fallback degrades gracefully but lacks skill/SG data.
3. **NBA: ESPN ToS exposure** — commercial use requires MySportsFeeds or SportsDataIO migration.
4. **MLB: No Statcast advanced metrics** — ERA proxy is adequate but FIP/xFIP would sharpen pitcher signals.
5. **NHL: Late goalie confirmation** — goalie status often only confirmed 1–2h before puck drop; pre-game generation gap.
6. **PGA: No course weather** — wind at tournament course is meaningful (Augusta, Pebble Beach, etc.); requires adding course geocoordinates.
7. **PGA: Bundled snapshot is Masters-only** — ideally updated each week with the current tournament's odds data. Consider a script to regenerate it from the latest golf-odds-snapshot file.

---

## Next Build Order (post-fallback-hardening)

1. **PGA weather** — add course geocoordinates table + Open-Meteo call for wind/temp at course (same pattern as MLB). Medium effort, high signal value for Augusta/coastal courses.
2. **PGA live leaderboard context** — wire ESPN leaderboard position into `pga-features.ts` context hints for in-progress round picks (make/miss cut markets).
3. **PGA bundled snapshot refresh script** — `scripts/refresh-pga-snapshot.ts` that reads the latest `golf-odds-snapshots/*.json` and writes `data/pga/datagolf-field.snapshot.json`. Run before each tournament week.
4. **NBA: MySportsFeeds or SportsDataIO migration** — replace ESPN unofficial API for commercial ToS compliance.
5. **MLB: Statcast FIP/xFIP** — replace ERA proxy with FIP for sharper pitcher quality signal.

---

## Review
- 3589f31: NBA prior registry + signal tagging + generator scoring hook.
- b938ab6: fuller NBA learning system with market priors, structured snapshots, and sandbox→goose grading bridge.
- b11e3d8: sandbox auto-grade, NBA live context enricher, repo cleanup.
- de5ed58: real ESPN-derived numeric DvP/pace/L5 feature capture into goose snapshots.
- d132644: prop parser, combo fixes, admin snapshot visibility.
- 2a0b55d: NBA provenance chain, roster parser fix, debug pipeline proof.
- 1bfe9b9: NHL feature module, context scoring, debug route.
- 12588bf: MLB feature module, generator parity, debug route.
- TBD: PGA feature module, generator parity, debug route — hardening matrix complete (4/4 sports).
- TBD: PGA bundled fallback snapshot + 3-tier fallback chain + source tier visibility in debug route.
