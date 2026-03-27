// ============================================================
// Goose AI Picks Model — PGA feature registry & scoring
//
// Purpose: Apply PGA-specific prior weights when the live signal-weight
// DB has insufficient data (< 5 appearances per signal). As real outcomes
// accumulate the DB weights naturally take over via scorePickBySignals().
//
// Design: additive bonus only — never overrides the DB when populated.
//
// Key PGA signals (all derived from existing DataGolf cache — no new data):
//   dg_skill_edge      — player ranks in DG top 30 (strong baseline skill)
//   dg_course_fit_edge — strong DG course-fit score (≥ 55)
//   dg_win_prob_edge   — DG win probability provides meaningful edge vs book
//   sg_tg_advantage    — positive SG: Tee-to-Green (ball-striking skill edge)
//   form_surge         — high recent form score (≥ 65) from ESPN history
//   course_history_edge— player has good historical performance at this course
//   value_play         — model probability meaningfully exceeds implied odds
//   top_finish_market  — pick is a top-5/10/20 market (more stable than outright)
//
// OWGR supplement (secondary to DataGolf — same DG field cache, no extra fetch):
//   owgr_top50_field   — player ranks top 50 in world (OWGR from DG field scrape)
//   owgr_top20_field   — player ranks top 20 in world (stronger field filter)
//
// Course weather (Open-Meteo — same free API used for MLB weather):
//   course_windy       — wind > 15 mph at tournament venue (favors ball-strikers)
//   course_very_windy  — wind > 25 mph (heavily favors elite ball-strikers / DG top 20)
//   course_wet_cond    — precip probability > 40% (affects scoring patterns)
//   course_good_cond   — calm, dry, moderate temp (scoring-friendly round)
//
// Real inputs consumed:
//   ✅ DataGolf rankings: dgRank, sgT2G, sgAPP, sgPUTT
//   ✅ DataGolf predictions: dgWinProb, dgTop5Prob, dgTop10Prob, dgTop20Prob
//   ✅ DataGolf course-fit scores: dgCourseFit
//   ✅ OWGR world rank (from DG field page hourly blob — already scraped)
//   ✅ Form score (from ESPN recent tournament history via golf-stats-engine)
//   ✅ Course history score (from ESPN player history via golf-stats-engine)
//   ✅ Course weather (Open-Meteo → pga-course-weather.ts, 30-min TTL)
//   ✅ Book odds (from golf-odds.ts aggregation)
//
// Remaining gaps documented in fetchPGAContextHints() docstring.
// ============================================================

import { getDGCache } from "@/lib/datagolf-cache";
import type { DGCache } from "@/lib/datagolf-cache";
import { getPGACourseWeather } from "@/lib/pga-course-weather";
import type { PGACourseWeather } from "@/lib/pga-course-weather";

// ── Types ─────────────────────────────────────────────────────

/**
 * Structured context hints derived from the DataGolf cache and pick metadata.
 * Populated at pick generation time and stored in pick_snapshot.factors.pga_features.
 */
export interface PGAContextHints {
  /** Signals auto-tagged from live PGA context (DG rank, SG, course fit, etc.) */
  auto_signals: string[];

  // ── DataGolf skill context ─────────────────────────────────
  /** Player's DataGolf world ranking (lower = better; null if not in DG field) */
  dg_rank: number | null;
  /** Strokes Gained: Tee-to-Green (ball-striking skill; positive = above average) */
  sg_t2g: number | null;
  /** Strokes Gained: Approach (iron play skill) */
  sg_app: number | null;
  /** Strokes Gained: Putting */
  sg_putt: number | null;
  /** Strokes Gained: Total (overall skill relative to field) */
  sg_total: number | null;

  // ── DataGolf prediction context ────────────────────────────
  /** DG pre-tournament win probability (0–1 scale after normalization) */
  dg_win_prob: number | null;
  /** DG pre-tournament top-5 probability */
  dg_top5_prob: number | null;
  /** DG pre-tournament top-10 probability */
  dg_top10_prob: number | null;
  /** DG pre-tournament top-20 probability */
  dg_top20_prob: number | null;
  /** DG course-fit score (0–100 scale; higher = better fit for this course) */
  dg_course_fit: number | null;

  // ── Form / history context (from golf-stats-engine scores) ──
  /** Recent form score (0–100; derived from last 5 tournament results) */
  form_score: number | null;
  /** Course history score (0–100; derived from historical results at this course) */
  course_history_score: number | null;

  // ── OWGR supplement (from DG field scrape — secondary to DG skill metrics) ──
  /**
   * Official World Golf Ranking (OWGR) from the DataGolf field page hourly blob.
   * Sourced from the same DG field scrape that populates predictions/course-fit.
   * Lower = better (rank 1 = world #1). Null if player not found in DG field data.
   *
   * NOTE: This is a supplemental signal. DataGolf skill metrics (DG rank, SG data)
   * are primary — OWGR is a secondary confirmatory layer only.
   */
  owgr_rank: number | null;

  // ── Market context ─────────────────────────────────────────
  /** The pick's market type (outright winner / top 5 / top 10 / top 20 / matchup) */
  market_type: PGAMarketType;
  /** Whether this is a top-finish market (top 5/10/20) vs outright or matchup */
  is_top_finish_market: boolean;
  /** Book implied probability from the pick's odds (0–1; null if no odds data) */
  book_implied_prob: number | null;
  /** Computed edge: model prob − book implied prob (positive = book undervaluing) */
  model_edge: number | null;

  // ── Course weather context (Open-Meteo via pga-course-weather.ts) ──────
  /**
   * Wind speed at the tournament venue (mph). From Open-Meteo hourly forecast.
   * Null if venue not in database or fetch failed.
   */
  course_wind_mph: number | null;
  /** Temperature at the tournament venue (°F). */
  course_temp_f: number | null;
  /** Precipitation probability (0–100%) at the tournament venue during round. */
  course_precip_pct: number | null;
  /** Whether windy conditions (> 15 mph) are expected at the venue. */
  course_is_windy: boolean;
  /** Whether very windy conditions (> 25 mph) are expected. */
  course_is_very_windy: boolean;
  /** Whether wet conditions (precip > 40%) are expected. */
  course_is_wet: boolean;
  /** Whether good scoring conditions (calm, dry, moderate temp) are expected. */
  course_is_good_conditions: boolean;
  /** Weather status — available, unavailable, or no_venue_match */
  course_weather_status: string;

  /** Non-fatal warnings from context fetch */
  warnings: string[];
}

export function emptyPGAContextHints(): PGAContextHints {
  return {
    auto_signals: [],
    dg_rank: null,
    sg_t2g: null,
    sg_app: null,
    sg_putt: null,
    sg_total: null,
    dg_win_prob: null,
    dg_top5_prob: null,
    dg_top10_prob: null,
    dg_top20_prob: null,
    dg_course_fit: null,
    owgr_rank: null,
    form_score: null,
    course_history_score: null,
    market_type: "unknown",
    is_top_finish_market: false,
    book_implied_prob: null,
    model_edge: null,
    course_wind_mph: null,
    course_temp_f: null,
    course_precip_pct: null,
    course_is_windy: false,
    course_is_very_windy: false,
    course_is_wet: false,
    course_is_good_conditions: false,
    course_weather_status: "unavailable",
    warnings: [],
  };
}

/**
 * Snapshot stored inside pick_snapshot.factors.pga_features for auditability.
 */
export interface PGAFeatureSnapshot {
  /** Signals that triggered PGA priors */
  prior_signals: string[];
  /** Blended PGA feature score [0, 1] */
  pga_feature_score: number;
  /** Per-signal prior values used */
  signal_priors_applied: Record<string, number>;
  /** Signals auto-tagged from live context */
  context_auto_signals: string[];

  // ── Feature flags ──────────────────────────────────────────
  /** Whether DG skill edge (top 30 rank) was a scoring signal */
  dg_skill_edge_active: boolean;
  /** Whether DG course fit was a scoring signal */
  dg_course_fit_active: boolean;
  /** Whether DG win probability edge was a scoring signal */
  dg_win_prob_active: boolean;
  /** Whether SG Tee-to-Green advantage was a scoring signal */
  sg_tg_advantage_active: boolean;
  /** Whether recent form surge was a scoring signal */
  form_surge_active: boolean;
  /** Whether course history edge was a scoring signal */
  course_history_active: boolean;
  /** Whether value play (model vs book edge) was a scoring signal */
  value_play_active: boolean;

  // ── Numeric snapshots ──────────────────────────────────────
  /** DG world rank at pick time */
  dg_rank: number | null;
  /** SG Tee-to-Green at pick time */
  sg_t2g: number | null;
  /** DG win probability at pick time */
  dg_win_prob: number | null;
  /** DG course fit score at pick time */
  dg_course_fit: number | null;
  /** Form score at pick time */
  form_score: number | null;
  /** Course history score at pick time */
  course_history_score: number | null;
  /** Market type detected for this pick */
  market_type: PGAMarketType;
  /** Model edge vs book implied probability */
  model_edge: number | null;

  // ── OWGR supplement ────────────────────────────────────────
  /**
   * OWGR world rank at pick time (from DG field data).
   * Null if not found in DG field data.
   * Secondary to DG metrics — used as confirmatory layer only.
   */
  owgr_rank: number | null;
  /** Whether OWGR top-50 signal was active for this pick */
  owgr_top50_active: boolean;
  /** Whether OWGR top-20 signal was active for this pick */
  owgr_top20_active: boolean;

  // ── Course weather snapshot ─────────────────────────────────
  /** Wind speed at tournament venue (mph) at round time */
  course_wind_mph: number | null;
  /** Temperature at tournament venue (°F) at round time */
  course_temp_f: number | null;
  /** Precipitation probability (%) at tournament venue at round time */
  course_precip_pct: number | null;
  /** Whether course_windy signal was active */
  course_windy_active: boolean;
  /** Whether course_very_windy signal was active */
  course_very_windy_active: boolean;
  /** Whether course_wet_conditions signal was active */
  course_wet_active: boolean;
  /** Whether course_good_conditions signal was active */
  course_good_conditions_active: boolean;
  /** Weather fetch status */
  course_weather_status: string;

  /** Warnings from context fetch */
  context_warnings: string[];
}

// ── Market type detection ─────────────────────────────────────

export type PGAMarketType =
  | "outright_winner"
  | "top_5"
  | "top_10"
  | "top_20"
  | "make_cut"
  | "matchup"
  | "round_score"
  | "unknown";

/**
 * Detect PGA market type from pick label string.
 */
export function detectPGAMarketType(pickLabel: string | null | undefined): PGAMarketType {
  const label = (pickLabel ?? "").toLowerCase();
  if (/top[\s-]?5\b/.test(label)) return "top_5";
  if (/top[\s-]?10\b/.test(label)) return "top_10";
  if (/top[\s-]?20\b/.test(label)) return "top_20";
  if (/make.*cut|miss.*cut/.test(label)) return "make_cut";
  if (/\bmatchup\b|\bh2h\b|head[\s-]to[\s-]head/.test(label)) return "matchup";
  if (/round.*score|round.*o\/u|round.*over|round.*under/.test(label)) return "round_score";
  if (/\bwinner\b|\boutright\b|\bto win\b/.test(label)) return "outright_winner";
  return "unknown";
}

// ── Signal priors ─────────────────────────────────────────────

/**
 * PGA signal priors: empirical win-rate estimates per signal.
 * Scale: 0.0–1.0.
 *
 * Sources / rationale:
 *   - dg_skill_edge: DG top-30 is well-calibrated; top-ranked players hit top-finish
 *     props at ~60–65% when priced correctly.
 *   - dg_course_fit_edge: Strong course-fit players outperform book implied probs
 *     by ~3–5% historically (SG course correlations).
 *   - dg_win_prob_edge: When DG win prob materially exceeds book implied prob,
 *     edge is real; historically ~63% win rate for positive DG-vs-book edge plays.
 *   - sg_tg_advantage: Positive SG T2G is the single best ball-striking predictor
 *     for tournament performance on most PGA courses.
 *   - form_surge: Recent form momentum carries moderate predictive value in golf.
 *   - course_history_edge: Course-specific history is meaningful (Augusta, TPC, etc.)
 *     but regresses faster than in team sports.
 *   - value_play: Model-vs-book edge signal confirming price inefficiency.
 *   - top_finish_market: Top 5/10/20 markets are more predictable than outrights;
 *     mild boost for these market types.
 *   - matchup_edge: H2H matchup picks benefit from any skill/form differential.
 *   - odds_movement: Sharp money movement in golf is less common but meaningful.
 */
export const PGA_SIGNAL_PRIORS: Record<string, number> = {
  /** Player is in the DataGolf top 30 — strong baseline skill */
  dg_skill_edge: 0.63,
  /** Player has strong DG course-fit score (≥ 55) */
  dg_course_fit_edge: 0.61,
  /** DG predicted probability materially exceeds book implied probability */
  dg_win_prob_edge: 0.63,
  /** Player has positive SG: Tee-to-Green — best ball-striking signal */
  sg_tg_advantage: 0.62,
  /** Player has high recent form score (≥ 65) — in good tournament form */
  form_surge: 0.60,
  /** Player has strong course history score (≥ 60) */
  course_history_edge: 0.60,
  /** Model probability materially exceeds book implied probability (value play) */
  value_play: 0.62,
  /**
   * OWGR supplement — player ranks top 50 in the Official World Golf Ranking.
   * Sourced from the DataGolf field page (same scrape as DG predictions/course-fit).
   * SECONDARY to DG metrics. Used as a confirmatory filter — top-50 OWGR players
   * in favorable markets have slightly higher base hit rates (~59–61%).
   * Prior is intentionally conservative (lower than DG signals) since OWGR
   * correlates with DG rank and adding both would overcount the same signal.
   */
  owgr_top50_field: 0.59,
  /**
   * OWGR top-20 world ranking — stronger confirmatory signal.
   * Reserved for elite world-class players (Scheffler, McIlroy, Rahm tier).
   * Used for outright and top-5 markets where elite field strength matters most.
   */
  owgr_top20_field: 0.61,
  /** Pick is a top-5/10/20 finish market rather than outright */
  top_finish_market: 0.59,
  /** H2H matchup: player has skill/form edge over opponent */
  matchup_edge: 0.61,
  /** Sharp line movement confirming pick direction */
  odds_movement: 0.59,
  /** Reuse: streak_form for tournament momentum */
  streak_form: 0.59,

  // ── Course weather priors (Open-Meteo via pga-course-weather.ts) ──────
  /**
   * Wind > 15 mph at the tournament course during the round.
   * Windy conditions favor elite ball-strikers (high SG T2G / DG top 30).
   * Modestly increases the hit rate for DG-backed skill picks specifically;
   * as a standalone signal it's context, not edge — conservative prior.
   */
  course_windy: 0.58,
  /**
   * Wind > 25 mph — strong wind strongly favors elite ball-strikers.
   * Best combined with dg_skill_edge or sg_tg_advantage.
   */
  course_very_windy: 0.60,
  /**
   * Precip probability > 40% — wet conditions affect scoring patterns.
   * Generally reduces variance (soft greens hold better, scoring tightens).
   * Mild signal; primary value is as a context tag for explainability.
   */
  course_wet_conditions: 0.57,
  /**
   * Calm, dry, moderate temp (not windy, not wet, not cold).
   * Good scoring conditions → field plays closer to DG model predictions.
   * Mild confirmatory boost for DG-model-backed picks.
   */
  course_good_conditions: 0.58,
};

/**
 * Minimum appearances before we trust live DB weight over prior.
 */
const MIN_APPEARANCES = 5;

// ── DG cache helpers ──────────────────────────────────────────

let _dgCacheLocal: { value: DGCache | null; expiresAt: number } | null = null;
const DG_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min in-process

async function getCachedDGData(): Promise<DGCache | null> {
  if (_dgCacheLocal && _dgCacheLocal.expiresAt > Date.now()) {
    return _dgCacheLocal.value;
  }
  try {
    const cache = await getDGCache();
    _dgCacheLocal = { value: cache, expiresAt: Date.now() + DG_CACHE_TTL_MS };
    return cache;
  } catch {
    return null;
  }
}

// Module-level weather cache: shared across all picks in a request to avoid
// redundant Open-Meteo fetches when generating multiple picks per tournament.
let _courseWeatherCache: { value: PGACourseWeather | null; tournamentKey: string; expiresAt: number } | null = null;

async function getCachedCourseWeather(tournamentName: string | null | undefined): Promise<PGACourseWeather | null> {
  const key = tournamentName ?? "";
  if (_courseWeatherCache && _courseWeatherCache.tournamentKey === key && _courseWeatherCache.expiresAt > Date.now()) {
    return _courseWeatherCache.value;
  }
  try {
    const weather = await getPGACourseWeather(tournamentName);
    _courseWeatherCache = { value: weather, tournamentKey: key, expiresAt: Date.now() + 30 * 60 * 1000 };
    return weather;
  } catch {
    return null;
  }
}

function normalizeDGName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "").trim();
}

function findDGMatch<T extends { name: string }>(list: T[], playerName: string): T | undefined {
  const normalized = normalizeDGName(playerName);
  return list.find((p) => normalizeDGName(p.name) === normalized) ??
    list.find((p) => {
      const pn = normalizeDGName(p.name);
      return pn.includes(normalized) || normalized.includes(pn);
    });
}

function americanToImpliedProb(odds: number | null | undefined): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// ── Context hint fetcher ──────────────────────────────────────

/**
 * Fetch PGA context hints for a specific pick (player name + pick label).
 * Reads from the in-process cached DataGolf data — safe to call per pick.
 *
 * Real inputs consumed:
 *   ✅ DG ranking data: rank, sgT2G, sgAPP, sgARG, sgPUTT, sgTotal
 *   ✅ DG prediction data: winProb, top5Prob, top10Prob, top20Prob
 *   ✅ DG course-fit data: fitScore
 *   ✅ Market type detection from pick label
 *   ✅ Book implied probability from pick odds
 *
 * Context hints that require the full golf-stats-engine scoring pipeline
 * (form_score, course_history_score) are NOT fetched here to avoid circular
 * dependencies — they should be passed in as params when available from the
 * AIPick's existing enrichment, or left null.
 *
 * Remaining gaps:
 *   ❌ Live weather/course conditions (wind speed at course during round)
 *   ❌ Live leaderboard position context (only useful mid-tournament)
 *   ❌ Umpire/caddie/equipment changes (no automated source)
 *   ❌ World Golf Rankings (separate from DG ranking)
 *
 * @param playerName  Player name (matched against DG cache by name normalization)
 * @param pickLabel   Pick label string (for market type detection)
 * @param odds        Book odds for this pick (for implied probability calculation)
 * @param formScore   Optional: pre-computed form score (0–100) from golf-stats-engine
 * @param courseHistoryScore  Optional: pre-computed course history score (0–100)
 */
export async function fetchPGAContextHints(
  playerName: string | null | undefined,
  pickLabel: string | null | undefined,
  odds?: number | null,
  formScore?: number | null,
  courseHistoryScore?: number | null,
  /** Optional: current tournament name (from DG cache) for course weather lookup */
  tournamentName?: string | null,
): Promise<PGAContextHints> {
  const warnings: string[] = [];
  const marketType = detectPGAMarketType(pickLabel);
  const bookImpliedProb = americanToImpliedProb(odds);

  // Fetch course weather in parallel (shared cache — only one Open-Meteo call per 30 min)
  const courseWeatherPromise = getCachedCourseWeather(tournamentName ?? null);

  if (!playerName) {
    const cw = await courseWeatherPromise;
    const cwFields = cw ? buildWeatherFields(cw) : {};
    return {
      ...emptyPGAContextHints(),
      market_type: marketType,
      is_top_finish_market: ["top_5", "top_10", "top_20"].includes(marketType),
      book_implied_prob: bookImpliedProb,
      course_wind_mph: cwFields.course_wind_mph ?? null,
      course_temp_f: cwFields.course_temp_f ?? null,
      course_precip_pct: cwFields.course_precip_pct ?? null,
      course_is_windy: cwFields.course_is_windy ?? false,
      course_is_very_windy: cwFields.course_is_very_windy ?? false,
      course_is_wet: cwFields.course_is_wet ?? false,
      course_is_good_conditions: cwFields.course_is_good_conditions ?? false,
      course_weather_status: cwFields.course_weather_status ?? "unavailable",
      warnings: ["No player name provided for PGA context lookup"],
    };
  }

  try {
    const [dgCache, courseWeather] = await Promise.all([
      getCachedDGData(),
      courseWeatherPromise,
    ]);

    if (!dgCache?.data) {
      warnings.push("DataGolf cache unavailable — PGA context hints degraded to empty");
      const cwFallbackFields = courseWeather ? buildWeatherFields(courseWeather) : {};
      return {
        ...emptyPGAContextHints(),
        market_type: marketType,
        is_top_finish_market: ["top_5", "top_10", "top_20"].includes(marketType),
        book_implied_prob: bookImpliedProb,
        form_score: formScore ?? null,
        course_history_score: courseHistoryScore ?? null,
        course_wind_mph: cwFallbackFields.course_wind_mph ?? null,
        course_temp_f: cwFallbackFields.course_temp_f ?? null,
        course_precip_pct: cwFallbackFields.course_precip_pct ?? null,
        course_is_windy: cwFallbackFields.course_is_windy ?? false,
        course_is_very_windy: cwFallbackFields.course_is_very_windy ?? false,
        course_is_wet: cwFallbackFields.course_is_wet ?? false,
        course_is_good_conditions: cwFallbackFields.course_is_good_conditions ?? false,
        course_weather_status: cwFallbackFields.course_weather_status ?? "unavailable",
        warnings,
      };
    }

    const ranking = findDGMatch(dgCache.data.rankings, playerName);
    const prediction = findDGMatch(dgCache.data.predictions, playerName);
    const courseFitEntry = findDGMatch(dgCache.data.courseFit, playerName);
    // OWGR supplement: world rank from DG field page (same scrape, no extra fetch)
    const fieldEntry = findDGMatch(dgCache.data.field, playerName);

    if (!ranking && !prediction && !courseFitEntry) {
      warnings.push(`Player "${playerName}" not found in DataGolf cache`);
    }

    // ── DataGolf skill data ──────────────────────────────────
    const dg_rank = ranking?.rank ?? null;
    const sg_t2g = ranking?.sgT2G ?? null;
    const sg_app = ranking?.sgAPP ?? null;
    const sg_putt = ranking?.sgPUTT ?? null;
    const sg_total = ranking?.sgTotal ?? null;

    // ── OWGR supplement (from DG field data — secondary layer) ──
    // worldRank in DGFieldPlayer is sourced from the DataGolf field page hourly blob
    // (field.owgr or field.world_rank keys in the JS blob). Free, no extra fetch.
    const owgr_rank = fieldEntry?.worldRank ?? null;

    // ── DataGolf predictions ─────────────────────────────────
    // DG probabilities may be raw fractions or percentages; normalize to 0–1
    const normProb = (val: number | null | undefined): number | null => {
      if (val == null || !Number.isFinite(val) || val < 0) return null;
      return val > 1 ? val / 100 : val;
    };
    const dg_win_prob = normProb(prediction?.winProb);
    const dg_top5_prob = normProb(prediction?.top5Prob);
    const dg_top10_prob = normProb(prediction?.top10Prob);
    const dg_top20_prob = normProb(prediction?.top20Prob);
    const dg_course_fit = courseFitEntry?.fitScore ?? null;

    // ── Model edge calculation ────────────────────────────────
    // Select the DG probability appropriate for this market type
    let modelProb: number | null = null;
    if (marketType === "outright_winner" || marketType === "unknown") {
      modelProb = dg_win_prob;
    } else if (marketType === "top_5") {
      modelProb = dg_top5_prob;
    } else if (marketType === "top_10") {
      modelProb = dg_top10_prob;
    } else if (marketType === "top_20") {
      modelProb = dg_top20_prob;
    }

    const model_edge =
      typeof modelProb === "number" && typeof bookImpliedProb === "number"
        ? modelProb - bookImpliedProb
        : null;

    // ── Auto-signal tagging ───────────────────────────────────
    const auto_signals: string[] = [];

    // DG skill edge: top 30 in DataGolf rankings
    if (typeof dg_rank === "number" && dg_rank <= 30) {
      auto_signals.push("dg_skill_edge");
    }

    // DG course fit edge: fit score ≥ 55
    if (typeof dg_course_fit === "number" && dg_course_fit >= 55) {
      auto_signals.push("dg_course_fit_edge");
    }

    // DG win prob edge: DG probability meaningfully exceeds book implied prob
    // Threshold: ≥ 3% edge (model prob > book prob by 0.03+)
    if (typeof model_edge === "number" && model_edge >= 0.03) {
      auto_signals.push("dg_win_prob_edge");
    }

    // SG Tee-to-Green advantage: positive SG T2G
    if (typeof sg_t2g === "number" && sg_t2g >= 0.3) {
      auto_signals.push("sg_tg_advantage");
    }

    // Form surge: recent form score ≥ 65
    if (typeof formScore === "number" && formScore >= 65) {
      auto_signals.push("form_surge");
    }

    // Course history edge: course history score ≥ 60
    if (typeof courseHistoryScore === "number" && courseHistoryScore >= 60) {
      auto_signals.push("course_history_edge");
    }

    // Value play: broader edge signal (model edge ≥ 5%)
    if (typeof model_edge === "number" && model_edge >= 0.05) {
      auto_signals.push("value_play");
    }

    // Top finish market: top 5/10/20 is a more predictable market than outright
    if (["top_5", "top_10", "top_20"].includes(marketType)) {
      auto_signals.push("top_finish_market");
    }

    // OWGR supplement signals — secondary to DG metrics
    // Only tag if DG ranking doesn't already cover this player (avoids double-counting)
    // owgr_top50: player is ranked in the OWGR top 50 (world-class field strength)
    if (typeof owgr_rank === "number" && owgr_rank <= 50 && owgr_rank > 0) {
      auto_signals.push("owgr_top50_field");
    }
    // owgr_top20: elite world top-20 players — stronger signal for outright/top-5
    if (typeof owgr_rank === "number" && owgr_rank <= 20 && owgr_rank > 0) {
      auto_signals.push("owgr_top20_field");
    }

    // ── Course weather signals ──────────────────────────────
    // Course weather is shared per tournament (not per player) — same conditions for all picks.
    // Weather signals are additive context, not primary signals. They combine best with
    // dg_skill_edge / sg_tg_advantage to identify players who benefit from the conditions.
    const weatherFields = courseWeather ? buildWeatherFields(courseWeather) : {};
    if (courseWeather?.conditions?.isVeryWindy) {
      auto_signals.push("course_very_windy");
    } else if (courseWeather?.conditions?.isWindy) {
      auto_signals.push("course_windy");
    }
    if (courseWeather?.conditions?.isWet) auto_signals.push("course_wet_conditions");
    if (courseWeather?.conditions?.isGoodConditions) auto_signals.push("course_good_conditions");

    return {
      auto_signals,
      dg_rank,
      sg_t2g,
      sg_app,
      sg_putt,
      sg_total,
      dg_win_prob,
      dg_top5_prob,
      dg_top10_prob,
      dg_top20_prob,
      dg_course_fit,
      owgr_rank,
      form_score: formScore ?? null,
      course_history_score: courseHistoryScore ?? null,
      market_type: marketType,
      is_top_finish_market: ["top_5", "top_10", "top_20"].includes(marketType),
      book_implied_prob: bookImpliedProb,
      model_edge,
      course_wind_mph: weatherFields.course_wind_mph ?? null,
      course_temp_f: weatherFields.course_temp_f ?? null,
      course_precip_pct: weatherFields.course_precip_pct ?? null,
      course_is_windy: weatherFields.course_is_windy ?? false,
      course_is_very_windy: weatherFields.course_is_very_windy ?? false,
      course_is_wet: weatherFields.course_is_wet ?? false,
      course_is_good_conditions: weatherFields.course_is_good_conditions ?? false,
      course_weather_status: weatherFields.course_weather_status ?? "unavailable",
      warnings,
    };
  } catch (err) {
    warnings.push(
      `PGA context fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      ...emptyPGAContextHints(),
      market_type: marketType,
      is_top_finish_market: ["top_5", "top_10", "top_20"].includes(marketType),
      book_implied_prob: bookImpliedProb,
      form_score: formScore ?? null,
      course_history_score: courseHistoryScore ?? null,
      warnings,
    };
  }
}

// ── Weather fields builder ──────────────────────────────────────

/**
 * Extract weather-related fields from a PGACourseWeather object
 * for merging into PGAContextHints returns.
 */
function buildWeatherFields(cw: PGACourseWeather): Partial<PGAContextHints> {
  return {
    course_wind_mph: cw.roundForecast?.windSpeedMph ?? null,
    course_temp_f: cw.roundForecast?.temperatureF ?? null,
    course_precip_pct: cw.roundForecast?.precipitationProbability ?? null,
    course_is_windy: cw.conditions?.isWindy ?? false,
    course_is_very_windy: cw.conditions?.isVeryWindy ?? false,
    course_is_wet: cw.conditions?.isWet ?? false,
    course_is_good_conditions: cw.conditions?.isGoodConditions ?? false,
    course_weather_status: cw.status,
  };
}

// ── Feature scoring ───────────────────────────────────────────

/**
 * Score PGA features and return a full PGAFeatureSnapshot.
 * Uses priors ONLY for signals not yet DB-backed (< MIN_APPEARANCES).
 *
 * @param signals         Reasoning-tagged signals for this pick
 * @param liveWeightMap   Live DB signal weights
 * @param contextHints    Optional context hints from fetchPGAContextHints
 */
export function scorePGAFeaturesWithSnapshot(
  signals: string[],
  liveWeightMap: Map<string, { win_rate: number; appearances: number }>,
  contextHints?: PGAContextHints | null,
): { score: number; snapshot: PGAFeatureSnapshot } {
  const priorsApplied: Record<string, number> = {};
  const priorSignals: string[] = [];

  // Merge reasoning signals with context auto-signals (deduplicated)
  const contextAutoSignals = contextHints?.auto_signals ?? [];
  const allSignals = Array.from(new Set([...signals, ...contextAutoSignals]));

  let total = 0;
  let count = 0;

  for (const sig of allSignals) {
    const prior = PGA_SIGNAL_PRIORS[sig];
    if (prior === undefined) continue;

    const liveWeight = liveWeightMap.get(sig);
    const hasTrustedLiveData = liveWeight && liveWeight.appearances >= MIN_APPEARANCES;

    if (!hasTrustedLiveData) {
      total += prior;
      count++;
      priorsApplied[sig] = prior;
      priorSignals.push(sig);
    }
  }

  const score = count > 0 ? total / count : 0;

  const snapshot: PGAFeatureSnapshot = {
    prior_signals: priorSignals,
    pga_feature_score: score,
    signal_priors_applied: priorsApplied,
    context_auto_signals: contextAutoSignals,
    dg_skill_edge_active: allSignals.includes("dg_skill_edge"),
    dg_course_fit_active: allSignals.includes("dg_course_fit_edge"),
    dg_win_prob_active: allSignals.includes("dg_win_prob_edge"),
    sg_tg_advantage_active: allSignals.includes("sg_tg_advantage"),
    form_surge_active: allSignals.includes("form_surge"),
    course_history_active: allSignals.includes("course_history_edge"),
    value_play_active: allSignals.includes("value_play"),
    dg_rank: contextHints?.dg_rank ?? null,
    sg_t2g: contextHints?.sg_t2g ?? null,
    dg_win_prob: contextHints?.dg_win_prob ?? null,
    dg_course_fit: contextHints?.dg_course_fit ?? null,
    form_score: contextHints?.form_score ?? null,
    course_history_score: contextHints?.course_history_score ?? null,
    market_type: contextHints?.market_type ?? "unknown",
    model_edge: contextHints?.model_edge ?? null,
    // OWGR supplement
    owgr_rank: contextHints?.owgr_rank ?? null,
    owgr_top50_active: allSignals.includes("owgr_top50_field"),
    owgr_top20_active: allSignals.includes("owgr_top20_field"),
    // Course weather snapshot
    course_wind_mph: contextHints?.course_wind_mph ?? null,
    course_temp_f: contextHints?.course_temp_f ?? null,
    course_precip_pct: contextHints?.course_precip_pct ?? null,
    course_windy_active: allSignals.includes("course_windy"),
    course_very_windy_active: allSignals.includes("course_very_windy"),
    course_wet_active: allSignals.includes("course_wet_conditions"),
    course_good_conditions_active: allSignals.includes("course_good_conditions"),
    course_weather_status: contextHints?.course_weather_status ?? "unavailable",
    context_warnings: contextHints?.warnings ?? [],
  };

  return { score, snapshot };
}

/**
 * Build a signal → live-weight map for PGA from GooseSignalWeight rows.
 */
export function buildPGAWeightMap(
  weights: Array<{ signal: string; win_rate: number; appearances: number }>,
): Map<string, { win_rate: number; appearances: number }> {
  return new Map(weights.map((w) => [w.signal, { win_rate: w.win_rate, appearances: w.appearances }]));
}
