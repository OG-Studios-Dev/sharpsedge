// ============================================================
// Goose AI Picks Model — MLB feature registry & scoring
//
// Purpose: Apply MLB-specific prior weights when the live signal-weight
// DB has insufficient data (< 5 appearances per signal). As real outcomes
// accumulate the DB weights naturally take over via scorePickBySignals().
//
// Design: additive bonus only — never overrides the DB when populated.
//
// Key MLB signals:
//   park_factor           — hitter's park inflates run/HR totals; pitcher's park suppresses
//   weather_wind          — wind blowing out at outdoor parks boosts scoring
//   bullpen_fatigue       — opponent bullpen overworked in last 3 days → more runs
//   probable_pitcher_weak — weak/replacement starter for opponent (strongest edge)
//   probable_pitcher_ace  — elite starter on your side (strong suppression edge)
//   home_field            — home field advantage in MLB (~54% for team MLs)
//   rest_days             — off day advantage vs travel/B2B fatigue
//   streak_form           — hot/cold team momentum
//   matchup_edge          — confirmed favorable H2H or style matchup
//
// Real inputs used (all available via existing rails):
//   - Park factors: mlb-park-factors.ts (seeded Statcast data)
//   - Weather: mlb-weather.ts (Open-Meteo live forecast)
//   - Bullpen fatigue: mlb-bullpen.ts (MLB Stats API boxscores, L3 games)
//   - Probable pitchers: MLB Stats API schedule hydrate via mlb-enrichment.ts
//   - Lineups: mlb-lineups.ts (MLB live feed)
//
// Remaining gaps documented in fetchMLBContextHints() docstring.
// ============================================================

import { getMLBEnrichmentBoard } from "@/lib/mlb-enrichment";

// ── Types ─────────────────────────────────────────────────────

/**
 * Structured context hints derived from the MLB enrichment board for a specific pick.
 * Populated at generation time and stored in pick_snapshot.factors.mlb_features.
 */
export interface MLBContextHints {
  /** Signals auto-tagged from live MLB context (park, weather, bullpen, pitcher, etc.) */
  auto_signals: string[];

  // ── Park factor context ────────────────────────────────────
  /** Park factor environment classification for today's venue */
  park_environment: "hitter" | "pitcher" | "neutral" | "unknown";
  /** Park factor runs index (100 = neutral; >105 = hitter; <95 = pitcher) */
  park_runs_index: number | null;
  /** Venue name for the game */
  venue_name: string | null;

  // ── Weather context ────────────────────────────────────────
  /** Whether the game has meaningful weather context (outdoor, not dome) */
  weather_eligible: boolean;
  /** Wind speed at first pitch (mph) */
  wind_speed_mph: number | null;
  /** Whether wind is blowing out (direction 45–135 degrees out to CF = boosts HR) */
  wind_blowing_out: boolean;
  /** Temperature at first pitch (°F) */
  temperature_f: number | null;
  /** Precipitation probability % */
  precip_probability: number | null;

  // ── Bullpen fatigue context ────────────────────────────────
  /** Fatigue level of the team's own bullpen (useful for under bets, closer props) */
  team_bullpen_level: "low" | "moderate" | "high" | "unknown";
  /** Fatigue level of the opponent's bullpen (useful for team ML, over bets) */
  opponent_bullpen_level: "low" | "moderate" | "high" | "unknown";
  /** Score for opponent bullpen fatigue (higher = more fatigued) */
  opponent_bullpen_score: number | null;

  // ── Probable pitcher context ───────────────────────────────
  /** ERA of the team's probable starter (null if unknown) */
  team_starter_era: number | null;
  /** Quality score for team's starter (30–80 scale, higher = better) */
  team_starter_quality: number | null;
  /** ERA of the opponent's probable starter */
  opponent_starter_era: number | null;
  /** Quality score for opponent's starter */
  opponent_starter_quality: number | null;

  // ── Lineup context ─────────────────────────────────────────
  /** Lineup confirmation status for the team */
  team_lineup_status: "official" | "partial" | "unconfirmed" | "unknown";
  /** Lineup confirmation status for the opponent */
  opponent_lineup_status: "official" | "partial" | "unconfirmed" | "unknown";

  // ── Non-fatal warnings ─────────────────────────────────────
  warnings: string[];
}

export function emptyMLBContextHints(): MLBContextHints {
  return {
    auto_signals: [],
    park_environment: "unknown",
    park_runs_index: null,
    venue_name: null,
    weather_eligible: false,
    wind_speed_mph: null,
    wind_blowing_out: false,
    temperature_f: null,
    precip_probability: null,
    team_bullpen_level: "unknown",
    opponent_bullpen_level: "unknown",
    opponent_bullpen_score: null,
    team_starter_era: null,
    team_starter_quality: null,
    opponent_starter_era: null,
    opponent_starter_quality: null,
    team_lineup_status: "unknown",
    opponent_lineup_status: "unknown",
    warnings: [],
  };
}

/**
 * Snapshot stored inside pick_snapshot.factors.mlb_features for auditability.
 */
export interface MLBFeatureSnapshot {
  /** Signals that triggered MLB priors */
  prior_signals: string[];
  /** Blended MLB feature score [0, 1] */
  mlb_feature_score: number;
  /** Per-signal prior values used */
  signal_priors_applied: Record<string, number>;
  /** Signals auto-tagged from live context */
  context_auto_signals: string[];

  // ── Feature flags ──────────────────────────────────────────
  /** Whether park factor was a scoring signal */
  park_factor_active: boolean;
  /** Whether weather/wind was a scoring signal */
  weather_wind_active: boolean;
  /** Whether opponent bullpen fatigue was a signal */
  bullpen_fatigue_active: boolean;
  /** Whether weak probable starter was flagged for opponent */
  weak_starter_active: boolean;
  /** Whether ace probable starter was flagged for team */
  ace_starter_active: boolean;

  // ── Numeric snapshots ──────────────────────────────────────
  /** Park runs index at pick time */
  park_runs_index: number | null;
  /** Wind speed mph at pick time */
  wind_speed_mph: number | null;
  /** Temperature at first pitch */
  temperature_f: number | null;
  /** Opponent bullpen fatigue score */
  opponent_bullpen_score: number | null;
  /** Team starter quality score */
  team_starter_quality: number | null;
  /** Opponent starter quality score */
  opponent_starter_quality: number | null;

  /** Warnings from context fetch */
  context_warnings: string[];
}

// ── MLB Signal Priors ─────────────────────────────────────────

/**
 * MLB signal priors: empirical win-rate estimates for each MLB signal.
 * Scale: 0.0–1.0 (fraction of picks expected to win when signal is present).
 *
 * Sources / rationale:
 *   - probable_pitcher_weak: weakest ML signal in MLB — opponent runs weak/replacement
 *     starter. Research shows ~62–65% win rate for the team with the stronger arm.
 *   - probable_pitcher_ace: ace starting for your pick's team → strong suppression
 *     edge for under bets and team ML.
 *   - park_factor: hitter's park boosts total/HR prop bets; pitcher's park suppresses.
 *     ~3-5% edge based on park run index.
 *   - weather_wind: wind blowing out at Wrigley, Coors, etc. notably boosts over bets.
 *   - bullpen_fatigue: high opponent bullpen fatigue increases late-inning run scoring,
 *     good for team ML and over bets.
 *   - home_field: MLB home-field advantage is ~54% over a 162-game season.
 *   - rest_days: off-day advantage in MLB is mild but real.
 *   - streak_form: hot/cold streaks carry moderate predictive value.
 *   - matchup_edge: confirmed favorable H2H or style matchup.
 *   - odds_movement: sharp line movement confirming pick direction.
 */
export const MLB_SIGNAL_PRIORS: Record<string, number> = {
  /** Opponent starts a weak / replacement pitcher — biggest edge in MLB ML */
  probable_pitcher_weak: 0.63,
  /** Team's own pitcher is an elite ace — strong suppression for under/team ML */
  probable_pitcher_ace: 0.62,
  /** Playing at a confirmed hitter's park (runs index ≥ 105) */
  park_factor: 0.61,
  /** Wind blowing out at an outdoor park — boosts over/HR props */
  weather_wind: 0.61,
  /** Opponent bullpen has high fatigue from last 3 games — more runs expected */
  bullpen_fatigue: 0.60,
  /** MLB home-field advantage — meaningful for team ML; mild for player props */
  home_field: 0.54,
  /** Well-rested team vs opponent on short schedule/travel */
  rest_days: 0.58,
  /** Hot/cold team streak momentum — moderate in MLB */
  streak_form: 0.60,
  /** Confirmed favorable H2H or style matchup */
  matchup_edge: 0.62,
  /** Sharp line movement confirming pick direction */
  odds_movement: 0.59,
  /** Lineup confirmed and strong (all starters in card) */
  lineup_change: 0.57,
};

/**
 * Minimum appearances before we trust live DB weight over prior.
 * Matches the threshold in store.scorePickBySignals().
 */
const MIN_APPEARANCES = 5;

// ── Cache ─────────────────────────────────────────────────────

type EnrichmentBoard = Awaited<ReturnType<typeof getMLBEnrichmentBoard>>;
let _boardCache: { value: EnrichmentBoard; expiresAt: number } | null = null;
const BOARD_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

async function getCachedMLBBoard(): Promise<EnrichmentBoard> {
  if (_boardCache && _boardCache.expiresAt > Date.now()) {
    return _boardCache.value;
  }
  const board = await getMLBEnrichmentBoard();
  _boardCache = { value: board, expiresAt: Date.now() + BOARD_CACHE_TTL_MS };
  return board;
}

/**
 * Find an enriched game entry for a team/opponent pair.
 * Matches by team abbreviation (case-insensitive).
 */
function findMLBGame(
  board: EnrichmentBoard,
  teamAbbrev: string | null | undefined,
  opponentAbbrev: string | null | undefined,
) {
  if (!teamAbbrev) return null;
  const tAbbrev = teamAbbrev.toUpperCase();
  const oAbbrev = (opponentAbbrev ?? "").toUpperCase();

  return (
    board.games.find((g) => {
      const away = g.matchup.away.abbreviation.toUpperCase();
      const home = g.matchup.home.abbreviation.toUpperCase();
      if (tAbbrev === away || tAbbrev === home) {
        if (!oAbbrev) return true;
        return oAbbrev === away || oAbbrev === home;
      }
      return false;
    }) ?? null
  );
}

/**
 * Heuristic: does the wind appear to be blowing out toward CF?
 * MLB fields face roughly east (home plate facing 180° = south), so wind
 * from ~45–135° (NE to SE) blows toward the outfield for most orientations.
 * This is a coarse approximation — actual orientation varies by stadium.
 * Treated as a soft signal, not a hard claim.
 */
function isWindBlowingOut(directionDeg: number | null, speedMph: number | null): boolean {
  if (directionDeg == null || speedMph == null) return false;
  if (speedMph < 8) return false; // sub-8mph wind is negligible
  // Wind FROM 45–135 or 225–315 degrees (north of home → outfield or south of home → infield)
  // Using a liberal band: from 30–150 degrees (blowing generally outward from home plate)
  return (directionDeg >= 30 && directionDeg <= 150);
}

// ── Context hint fetcher ──────────────────────────────────────

/**
 * Fetch MLB context hints for a specific pick (team + opponent).
 * Uses the cached enrichment board — safe to call for every pick in a run.
 *
 * Real inputs consumed:
 *   ✅ Park factors (seeded Statcast data via mlb-park-factors.ts)
 *   ✅ Weather (Open-Meteo live forecast via mlb-weather.ts)
 *   ✅ Bullpen fatigue (MLB Stats API L3 boxscores via mlb-bullpen.ts)
 *   ✅ Probable pitcher ERA + quality score (MLB Stats API via mlb-enrichment.ts)
 *   ✅ Lineup confirmation status (MLB live feed via mlb-lineups.ts)
 *
 * Remaining gaps (documented, not faked):
 *   ❌ Statcast pitcher FIP/xFIP/K% (not yet in free tier without scraping)
 *   ❌ Batter vs pitcher historical splits (no free live API source available)
 *   ❌ Umpire tendencies (no automated source in current rails)
 *   ❌ Live injury report (MLB doesn't publish a structured IL/DL diff feed)
 *
 * @returns MLBContextHints for the pick, or emptyMLBContextHints() on any failure.
 */
export async function fetchMLBContextHints(
  team: string | null | undefined,
  opponent: string | null | undefined,
): Promise<MLBContextHints> {
  const warnings: string[] = [];

  if (!team) {
    return {
      ...emptyMLBContextHints(),
      warnings: ["No team provided for MLB context lookup"],
    };
  }

  try {
    const board = await getCachedMLBBoard();
    const game = findMLBGame(board, team, opponent);

    if (!game) {
      return {
        ...emptyMLBContextHints(),
        warnings: [`No game found today for team=${team} opp=${opponent ?? "?"}`],
      };
    }

    const tAbbrev = team.toUpperCase();
    const isAway = game.matchup.away.abbreviation.toUpperCase() === tAbbrev;
    const teamSide = isAway ? game.matchup.away : game.matchup.home;
    const oppSide = isAway ? game.matchup.home : game.matchup.away;

    // ── Park factor ──────────────────────────────────────────
    const pf = game.parkFactor;
    const park_environment = pf.status === "available" ? (pf.environment ?? "neutral") : "unknown";
    const park_runs_index = pf.metrics?.runs ?? null;
    const venue_name = pf.venueName ?? game.venue?.scheduleVenue ?? null;

    // ── Weather ──────────────────────────────────────────────
    const wx = game.weather;
    const weather_eligible = wx.status === "available";
    const wind_speed_mph = wx.forecast?.windSpeedMph ?? null;
    const wind_dir = wx.forecast?.windDirectionDeg ?? null;
    const temperature_f = wx.forecast?.temperatureF ?? null;
    const precip_probability = wx.forecast?.precipitationProbability ?? null;
    const wind_blowing_out = isWindBlowingOut(wind_dir, wind_speed_mph);

    // ── Bullpen ──────────────────────────────────────────────
    const teamBullpen = teamSide.bullpen;
    const oppBullpen = oppSide.bullpen;
    const team_bullpen_level = (teamBullpen?.level ?? "unknown") as MLBContextHints["team_bullpen_level"];
    const opponent_bullpen_level = (oppBullpen?.level ?? "unknown") as MLBContextHints["opponent_bullpen_level"];
    const opponent_bullpen_score = oppBullpen?.score ?? null;

    // ── Probable starters ────────────────────────────────────
    const sq = game.starterQuality;
    const teamQuality = isAway ? sq.away : sq.home;
    const oppQuality = isAway ? sq.home : sq.away;
    const team_starter_era = teamQuality?.era ?? null;
    const team_starter_quality = teamQuality?.qualityScore ?? null;
    const opponent_starter_era = oppQuality?.era ?? null;
    const opponent_starter_quality = oppQuality?.qualityScore ?? null;

    // ── Lineups ──────────────────────────────────────────────
    const lineups = game.lineups;
    const team_lineup_status = (isAway ? lineups.away?.status : lineups.home?.status) ?? "unknown";
    const opponent_lineup_status = (isAway ? lineups.home?.status : lineups.away?.status) ?? "unknown";

    // ── Auto-signal tagging ──────────────────────────────────
    const auto_signals: string[] = [];

    // Park factor: hitter's park → park_factor signal
    if (park_environment === "hitter") {
      auto_signals.push("park_factor");
    }

    // Weather wind: outdoor + blowing out + 8+ mph → weather_wind signal
    if (weather_eligible && wind_blowing_out) {
      auto_signals.push("weather_wind");
    }

    // Opponent bullpen fatigue: "high" level → bullpen_fatigue signal
    if (opponent_bullpen_level === "high") {
      auto_signals.push("bullpen_fatigue");
    }

    // Weak opponent starter: quality score ≤ 45 (ERA ≥ 5.0) → probable_pitcher_weak
    if (typeof opponent_starter_quality === "number" && opponent_starter_quality <= 45) {
      auto_signals.push("probable_pitcher_weak");
    }

    // Ace on team side: quality score ≥ 65 (ERA ≤ 3.0) → probable_pitcher_ace
    if (typeof team_starter_quality === "number" && team_starter_quality >= 65) {
      auto_signals.push("probable_pitcher_ace");
    }

    return {
      auto_signals,
      park_environment,
      park_runs_index,
      venue_name: typeof venue_name === "string" ? venue_name : null,
      weather_eligible,
      wind_speed_mph,
      wind_blowing_out,
      temperature_f,
      precip_probability,
      team_bullpen_level,
      opponent_bullpen_level,
      opponent_bullpen_score,
      team_starter_era,
      team_starter_quality,
      opponent_starter_era,
      opponent_starter_quality,
      team_lineup_status: team_lineup_status as MLBContextHints["team_lineup_status"],
      opponent_lineup_status: opponent_lineup_status as MLBContextHints["opponent_lineup_status"],
      warnings,
    };
  } catch (err) {
    warnings.push(`MLB context fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ...emptyMLBContextHints(), warnings };
  }
}

// ── Feature scoring ───────────────────────────────────────────

/**
 * Score MLB features and return a full MLBFeatureSnapshot.
 * Uses priors ONLY for signals not yet DB-backed (< MIN_APPEARANCES).
 *
 * @param signals         Reasoning-tagged signals for this pick
 * @param liveWeightMap   Live DB signal weights
 * @param contextHints    Optional context hints from fetchMLBContextHints
 */
export function scoreMLBFeaturesWithSnapshot(
  signals: string[],
  liveWeightMap: Map<string, { win_rate: number; appearances: number }>,
  contextHints?: MLBContextHints | null,
): { score: number; snapshot: MLBFeatureSnapshot } {
  const priorsApplied: Record<string, number> = {};
  const priorSignals: string[] = [];

  // Merge reasoning signals with context auto-signals (deduplicated)
  const contextAutoSignals = contextHints?.auto_signals ?? [];
  const allSignals = Array.from(new Set([...signals, ...contextAutoSignals]));

  let total = 0;
  let count = 0;

  for (const sig of allSignals) {
    const prior = MLB_SIGNAL_PRIORS[sig];
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

  const snapshot: MLBFeatureSnapshot = {
    prior_signals: priorSignals,
    mlb_feature_score: score,
    signal_priors_applied: priorsApplied,
    context_auto_signals: contextAutoSignals,
    park_factor_active: allSignals.includes("park_factor"),
    weather_wind_active: allSignals.includes("weather_wind"),
    bullpen_fatigue_active: allSignals.includes("bullpen_fatigue"),
    weak_starter_active: allSignals.includes("probable_pitcher_weak"),
    ace_starter_active: allSignals.includes("probable_pitcher_ace"),
    park_runs_index: contextHints?.park_runs_index ?? null,
    wind_speed_mph: contextHints?.wind_speed_mph ?? null,
    temperature_f: contextHints?.temperature_f ?? null,
    opponent_bullpen_score: contextHints?.opponent_bullpen_score ?? null,
    team_starter_quality: contextHints?.team_starter_quality ?? null,
    opponent_starter_quality: contextHints?.opponent_starter_quality ?? null,
    context_warnings: contextHints?.warnings ?? [],
  };

  return { score, snapshot };
}

/**
 * Build a signal → live-weight map for MLB from GooseSignalWeight rows.
 */
export function buildMLBWeightMap(
  weights: Array<{ signal: string; win_rate: number; appearances: number }>,
): Map<string, { win_rate: number; appearances: number }> {
  return new Map(weights.map((w) => [w.signal, { win_rate: w.win_rate, appearances: w.appearances }]));
}
