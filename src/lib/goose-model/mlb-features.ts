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
import { getMLBTeamSplitRates } from "@/lib/mlb-api";
import { computeHandednessMatchup } from "@/lib/mlb-handedness";
import type { HandednessAdvantage } from "@/lib/mlb-handedness";
import type { LineupMatchupQuality } from "@/lib/mlb-bvp";

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

  // ── Pitcher command (K/BB) context ────────────────────────
  /** K/BB ratio for team's probable starter (null if insufficient IP or missing stats) */
  team_starter_k_bb: number | null;
  /** K/BB ratio for opponent's probable starter */
  opponent_starter_k_bb: number | null;
  /** Whether team's starter has commanding K/BB (>= 3.0, with >= 5 IP) */
  team_starter_command: boolean;
  /** Whether opponent's starter has weak command (K/BB < 2.0, with >= 5 IP) */
  opponent_starter_weak_command: boolean;

  // ── FIP (Fielding Independent Pitching) context ────────────
  /**
   * FIP for team's probable starter (null if < 5 IP or missing stats).
   * FIP = ((13×HR + 3×(BB+HBP) − 2×K) / IP) + 3.10
   * Isolates pitcher skill by removing defense/luck from ERA.
   * Source pattern: jldbc/pybaseball FIP formula + zero-sum-seattle/python-mlb-statsapi
   */
  team_starter_fip: number | null;
  /** FIP for opponent's probable starter */
  opponent_starter_fip: number | null;
  /**
   * ERA minus FIP for team's starter.
   * Positive = unlucky (ERA likely to regress down, pitcher is better than they look).
   * Negative = lucky (ERA likely to regress up, pitcher is worse than they look).
   */
  team_era_fip_divergence: number | null;
  /** ERA minus FIP for opponent's starter */
  opponent_era_fip_divergence: number | null;
  /**
   * Whether opponent's starter has a "lucky ERA" (ERA − FIP < −0.75).
   * Lucky ERA means opponent ERA is inflated-good; lines likely under-value team's chance.
   */
  opponent_era_is_lucky: boolean;
  /**
   * Whether team's starter has an "unlucky ERA" (ERA − FIP > +0.75).
   * Unlucky ERA means team's starter is better than ERA shows; value pick opportunity.
   */
  team_era_is_unlucky: boolean;

  // ── Home/away split context ────────────────────────────────
  /** Whether the team for this pick is the home team */
  is_home: boolean | null;
  /** Team's home win rate (null if fewer than 3 home games played) */
  team_home_win_rate: number | null;
  /** Team's away win rate (null if fewer than 3 away games played) */
  team_away_win_rate: number | null;
  /** Opponent's home win rate */
  opponent_home_win_rate: number | null;
  /** Opponent's away win rate */
  opponent_away_win_rate: number | null;
  /** Qualitative edge label from home/away splits */
  home_away_edge_label: "strong_home_edge" | "weak_road_opponent" | "both" | "none" | "insufficient_data";

  // ── Umpire zone context ────────────────────────────────────
  /** Home plate umpire name (null if not yet assigned) */
  hp_ump_name: string | null;
  /** Umpire zone tendency tier for this game */
  ump_zone_tier: "pitcher_friendly" | "neutral" | "hitter_friendly";
  /** Whether ump is pitcher-friendly (tight zone → suppressed run environment) */
  ump_pitcher_friendly: boolean;
  /** Whether ump is hitter-friendly (loose zone → elevated run environment) */
  ump_hitter_friendly: boolean;
  /** Human-readable umpire zone note */
  ump_zone_note: string | null;

  // ── Handedness matchup context ─────────────────────────────
  /** Opponent's probable starter throwing hand (L/R/null) */
  opponent_pitcher_hand: string | null;
  /** Team's OPS vs opponent pitcher's hand this season */
  team_ops_vs_hand: number | null;
  /** Handedness advantage tier for this matchup */
  handedness_advantage_tier: HandednessAdvantage;
  /** Whether the handedness_advantage signal fires */
  handedness_advantage_fires: boolean;
  /** Human-readable handedness matchup note */
  handedness_note: string | null;

  // ── BvP (batter vs pitcher) matchup context ───────────────
  /**
   * Status of the BvP matchup computation for this pick's lineup.
   * "computed" = lineup confirmed + pitcher known + >= 3 batters with history.
   * Other values indicate why computation was skipped.
   */
  bvp_status: LineupMatchupQuality["status"] | "unavailable";
  /** PA-weighted aggregate OPS of top-5 batting-order batters vs opposing starter (career) */
  lineup_avg_ops_vs_pitcher: number | null;
  /** Number of top-order batters with usable BvP history (>= 3 career PA vs this pitcher) */
  lineup_batters_with_history: number;
  /** Matchup quality classification for lineup vs opposing starter */
  lineup_matchup_tier: LineupMatchupQuality["matchup_tier"];
  /** Whether the lineup_bvp_edge signal fires (avg OPS >= .750, >= 3 batters with history) */
  lineup_bvp_edge_fires: boolean;
  /** Human-readable BvP matchup summary note */
  bvp_note: string | null;

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
    team_starter_k_bb: null,
    opponent_starter_k_bb: null,
    team_starter_fip: null,
    opponent_starter_fip: null,
    team_era_fip_divergence: null,
    opponent_era_fip_divergence: null,
    opponent_era_is_lucky: false,
    team_era_is_unlucky: false,
    team_starter_command: false,
    opponent_starter_weak_command: false,
    is_home: null,
    team_home_win_rate: null,
    team_away_win_rate: null,
    opponent_home_win_rate: null,
    opponent_away_win_rate: null,
    home_away_edge_label: "insufficient_data",
    hp_ump_name: null,
    ump_zone_tier: "neutral",
    ump_pitcher_friendly: false,
    ump_hitter_friendly: false,
    ump_zone_note: null,
    opponent_pitcher_hand: null,
    team_ops_vs_hand: null,
    handedness_advantage_tier: "unknown",
    handedness_advantage_fires: false,
    handedness_note: null,
    bvp_status: "unavailable",
    lineup_avg_ops_vs_pitcher: null,
    lineup_batters_with_history: 0,
    lineup_matchup_tier: "insufficient_data",
    lineup_bvp_edge_fires: false,
    bvp_note: null,
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

  /** Whether pitcher command signal fired for team's starter */
  pitcher_command_active: boolean;
  /** Whether home/away split edge fired */
  home_away_edge_active: boolean;
  /** Whether opponent ERA lucky signal fired (opponent ERA better than FIP) */
  opponent_era_lucky_active: boolean;
  /** Whether team ERA unlucky signal fired (team ERA worse than FIP) */
  team_era_unlucky_active: boolean;

  // ── Numeric snapshots for new signals ─────────────────────
  /** K/BB ratio for team's starter at pick time */
  team_starter_k_bb: number | null;
  /** K/BB ratio for opponent's starter at pick time */
  opponent_starter_k_bb: number | null;
  /** FIP for team's starter at pick time */
  team_starter_fip: number | null;
  /** FIP for opponent's starter at pick time */
  opponent_starter_fip: number | null;
  /** ERA − FIP divergence for team's starter (positive = unlucky) */
  team_era_fip_divergence: number | null;
  /** ERA − FIP divergence for opponent's starter (positive = unlucky for them too) */
  opponent_era_fip_divergence: number | null;
  /** Team's home win rate at pick time */
  team_home_win_rate: number | null;
  /** Opponent's away win rate at pick time */
  opponent_away_win_rate: number | null;
  /** Whether team is the home team */
  is_home: boolean | null;
  /** Home/away edge label */
  home_away_edge_label: string;

  // ── Umpire zone snapshot ───────────────────────────────────
  /** Whether the umpire_pitcher_friendly signal fired */
  umpire_pitcher_friendly_active: boolean;
  /** Whether the umpire_hitter_friendly signal fired */
  umpire_hitter_friendly_active: boolean;
  /** Home plate umpire name at pick time */
  hp_ump_name: string | null;
  /** Umpire zone tier at pick time */
  ump_zone_tier: string;

  // ── Handedness matchup snapshot ────────────────────────────
  /** Whether the handedness_advantage signal fired */
  handedness_advantage_active: boolean;
  /** Opponent pitcher hand at pick time */
  opponent_pitcher_hand: string | null;
  /** Team OPS vs opponent pitcher hand at pick time */
  team_ops_vs_hand: number | null;
  /** Handedness advantage tier at pick time */
  handedness_advantage_tier: string;

  // ── BvP matchup snapshot ───────────────────────────────────
  /** Whether the lineup_bvp_edge signal fired */
  lineup_bvp_edge_active: boolean;
  /** BvP computation status at pick time */
  bvp_status: string;
  /** PA-weighted avg OPS for top-order batters vs opposing starter at pick time */
  lineup_avg_ops_vs_pitcher: number | null;
  /** Number of top-order batters with usable BvP history at pick time */
  lineup_batters_with_history: number;
  /** Matchup tier classification at pick time */
  lineup_matchup_tier: string;

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
  /**
   * Pitcher command edge: team's probable starter K/BB >= 3.0 with >= 5 IP.
   * Higher K/BB = fewer free baserunners, harder to manufacture runs against.
   * Prior based on MLB research showing high-K/BB starters suppress run scoring ~3-5% above baseline.
   */
  pitcher_command: 0.60,
  /**
   * Home/away split edge: team has a strong home win rate (>= .560) while playing at home,
   * or the opponent has a poor away win rate (<= .440) on the road.
   * MLB home field advantage is well-documented; strong home teams amplify it.
   */
  home_away_edge: 0.57,
  /**
   * Opponent starter has a "lucky ERA" (ERA − FIP < −0.75):
   * ERA is inflated-good because of low BABIP/HR rates not explained by true skill.
   * Opponent is WORSE than their ERA shows → edge for team ML / over bets.
   * Source pattern: jldbc/pybaseball FIP methodology applied to MLB Stats API data.
   */
  opponent_era_lucky: 0.61,
  /**
   * Team's starter has an "unlucky ERA" (ERA − FIP > +0.75):
   * ERA is inflated-bad; pitcher is better than they look.
   * Team's starter value is under-estimated by market → value edge for team ML / under bets.
   */
  team_era_unlucky: 0.60,
  /**
   * Home plate umpire is pitcher-friendly (tight zone → expanded called-strike rate).
   * Pitcher-friendly umps suppress run scoring ~3-5% below league average.
   * Good for UNDER bets, pitcher ML, and low-scoring-game picks.
   * Source: seeded UmpScorecards 2019-2024 zone_tier classification.
   */
  umpire_pitcher_friendly: 0.58,
  /**
   * Home plate umpire is hitter-friendly (loose zone → elevated walk/baserunner rate).
   * Hitter-friendly umps inflate run scoring ~3-5% above league average.
   * Good for OVER bets and team ML picks with offense edge.
   */
  umpire_hitter_friendly: 0.57,
  /**
   * Team has a batting handedness advantage vs today's probable starter's hand.
   * Team OPS >= .720 vs pitcher's hand (moderate) or >= .750 (strong).
   * Source: MLB Stats API vsLeft/vsRight team batting splits, current season.
   */
  handedness_advantage: 0.58,
  /**
   * Confirmed lineup BvP edge: top-order batters have combined OPS >= .750 career
   * vs today's opposing starter (based on official confirmed lineup + starter ID).
   * Requires >= 3 of 5 top-order batters with career PA history vs this pitcher.
   * Source: MLB Stats API vsPlayer career splits (batterId × pitcherId cross-lookup).
   *
   * Signal is more specific than handedness_advantage (individual-level history vs team-level).
   * Prior: 0.61 — reflects individual matchup specificity over team-level baseline.
   */
  lineup_bvp_edge: 0.61,
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
    const [board, splitRates] = await Promise.all([
      getCachedMLBBoard(),
      getMLBTeamSplitRates(),
    ]);
    // game-level umpire + handedness data will be pulled from the board once game is found
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

    // ── Pitcher command (K/BB) ───────────────────────────────
    const teamPitcher = isAway
      ? game.matchup.away.probablePitcher
      : game.matchup.home.probablePitcher;
    const oppPitcher = isAway
      ? game.matchup.home.probablePitcher
      : game.matchup.away.probablePitcher;

    const team_starter_k_bb = computeKBB(teamPitcher);
    const opponent_starter_k_bb = computeKBB(oppPitcher);
    const team_starter_command = team_starter_k_bb !== null && team_starter_k_bb >= 3.0;
    const opponent_starter_weak_command = opponent_starter_k_bb !== null && opponent_starter_k_bb < 2.0;

    // ── FIP divergence (ERA vs FIP luck detection) ───────────
    const team_starter_fip = isAway
      ? (game.starterQuality.away?.fip ?? null)
      : (game.starterQuality.home?.fip ?? null);
    const opponent_starter_fip = isAway
      ? (game.starterQuality.home?.fip ?? null)
      : (game.starterQuality.away?.fip ?? null);
    const team_era_fip_divergence = isAway
      ? (game.starterQuality.away?.eraFipDivergence ?? null)
      : (game.starterQuality.home?.eraFipDivergence ?? null);
    const opponent_era_fip_divergence = isAway
      ? (game.starterQuality.home?.eraFipDivergence ?? null)
      : (game.starterQuality.away?.eraFipDivergence ?? null);
    // Lucky ERA: opponent ERA - FIP < -0.75 → opponent looks better than they are
    const opponent_era_is_lucky =
      opponent_era_fip_divergence !== null && opponent_era_fip_divergence < -0.75;
    // Unlucky ERA: team ERA - FIP > +0.75 → team pitcher looks worse than they are
    const team_era_is_unlucky =
      team_era_fip_divergence !== null && team_era_fip_divergence > 0.75;

    // ── Home/away split rates from standings ─────────────────
    const is_home = !isAway;
    const teamSplits = splitRates.get(tAbbrev) ?? splitRates.get(team.toUpperCase()) ?? null;
    const oppAbbrev = (isAway ? game.matchup.home.abbreviation : game.matchup.away.abbreviation).toUpperCase();
    const oppSplits = splitRates.get(oppAbbrev) ?? null;

    const team_home_win_rate = teamSplits?.homeWinRate ?? null;
    const team_away_win_rate = teamSplits?.awayWinRate ?? null;
    const opponent_home_win_rate = oppSplits?.homeWinRate ?? null;
    const opponent_away_win_rate = oppSplits?.awayWinRate ?? null;

    // Derive home/away edge label
    // "strong_home_edge": team is at home AND team home_win_rate >= .560
    // "weak_road_opponent": team is at home AND opponent away_win_rate <= .440
    // "both": both fire
    // "none": conditions not met (or team is away)
    // "insufficient_data": not enough games to judge
    let home_away_edge_label: MLBContextHints["home_away_edge_label"] = "insufficient_data";
    if (is_home) {
      const strongHome = team_home_win_rate !== null && team_home_win_rate >= 0.560;
      const weakRoadOpp = opponent_away_win_rate !== null && opponent_away_win_rate <= 0.440;
      if (strongHome && weakRoadOpp) {
        home_away_edge_label = "both";
      } else if (strongHome) {
        home_away_edge_label = "strong_home_edge";
      } else if (weakRoadOpp) {
        home_away_edge_label = "weak_road_opponent";
      } else if (team_home_win_rate !== null || opponent_away_win_rate !== null) {
        home_away_edge_label = "none";
      }
    } else {
      // Team is away — check if team has a strong road record
      const strongAway = team_away_win_rate !== null && team_away_win_rate >= 0.560;
      const weakHomeOpp = opponent_home_win_rate !== null && opponent_home_win_rate <= 0.440;
      if (strongAway && weakHomeOpp) {
        home_away_edge_label = "both";
      } else if (strongAway) {
        home_away_edge_label = "strong_home_edge"; // reuse label for strong road team
      } else if (weakHomeOpp) {
        home_away_edge_label = "weak_road_opponent"; // reuse label for weak home opponent
      } else if (team_away_win_rate !== null || opponent_home_win_rate !== null) {
        home_away_edge_label = "none";
      }
    }

    // ── Umpire zone context ──────────────────────────────────
    const umpireCtx = (game as unknown as { umpire?: { hp_ump_name?: string | null; zone_tier?: string; is_pitcher_friendly?: boolean; is_hitter_friendly?: boolean; zone_note?: string } | null }).umpire ?? null;
    const hp_ump_name = umpireCtx?.hp_ump_name ?? null;
    const ump_zone_tier = (umpireCtx?.zone_tier ?? "neutral") as MLBContextHints["ump_zone_tier"];
    const ump_pitcher_friendly = umpireCtx?.is_pitcher_friendly ?? false;
    const ump_hitter_friendly = umpireCtx?.is_hitter_friendly ?? false;
    const ump_zone_note = umpireCtx?.zone_note ?? null;

    // ── Handedness matchup context ───────────────────────────
    const opponent_pitcher_hand = oppPitcher?.hand ?? null;
    const boardHandedness = (game as unknown as { handedness?: { away?: unknown; home?: unknown } | null }).handedness ?? null;
    const teamHandednessSplits = (isAway ? boardHandedness?.away : boardHandedness?.home) as Parameters<typeof computeHandednessMatchup>[0];
    const handednessMatchup = computeHandednessMatchup(
      teamHandednessSplits ?? null,
      opponent_pitcher_hand,
    );
    const team_ops_vs_hand = handednessMatchup.team_ops_vs_hand;
    const handedness_advantage_tier = handednessMatchup.advantage_tier;
    const handedness_advantage_fires = handednessMatchup.signal_fires;
    const handedness_note = handednessMatchup.note;

    // ── BvP matchup context ──────────────────────────────────
    // Pull the pre-computed BvP matchup from the enrichment board.
    // The board already ran computeLineupMatchupQuality() per game side.
    const boardBvp = (game as unknown as { bvp?: { away?: LineupMatchupQuality | null; home?: LineupMatchupQuality | null } | null }).bvp ?? null;
    const teamBvp = (isAway ? boardBvp?.away : boardBvp?.home) ?? null;

    const bvp_status: MLBContextHints["bvp_status"] = teamBvp?.status ?? "unavailable";
    const lineup_avg_ops_vs_pitcher = teamBvp?.avg_ops_vs_pitcher ?? null;
    const lineup_batters_with_history = teamBvp?.batters_with_history ?? 0;
    const lineup_matchup_tier = (teamBvp?.matchup_tier ?? "insufficient_data") as MLBContextHints["lineup_matchup_tier"];
    const lineup_bvp_edge_fires = teamBvp?.signal_fires ?? false;
    const bvp_note = teamBvp?.note ?? null;

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

    // Pitcher command: team K/BB >= 3.0 with sufficient IP → pitcher_command signal
    if (team_starter_command) {
      auto_signals.push("pitcher_command");
    }

    // Home/away edge: strong home team or weak road opponent → home_away_edge signal
    if (home_away_edge_label === "strong_home_edge" || home_away_edge_label === "weak_road_opponent" || home_away_edge_label === "both") {
      auto_signals.push("home_away_edge");
    }

    // FIP luck signals:
    // opponent_era_lucky: opponent's ERA looks better than FIP warrants → they're worse than they look
    if (opponent_era_is_lucky) {
      auto_signals.push("opponent_era_lucky");
    }
    // team_era_unlucky: team's starter ERA looks worse than FIP warrants → they're better than they look
    if (team_era_is_unlucky) {
      auto_signals.push("team_era_unlucky");
    }

    // Umpire zone signals
    if (ump_pitcher_friendly) {
      auto_signals.push("umpire_pitcher_friendly");
    }
    if (ump_hitter_friendly) {
      auto_signals.push("umpire_hitter_friendly");
    }

    // Handedness advantage signal
    if (handedness_advantage_fires) {
      auto_signals.push("handedness_advantage");
    }

    // BvP lineup matchup edge: official lineup, >= 3 batters with career history, avg OPS >= .750
    if (lineup_bvp_edge_fires) {
      auto_signals.push("lineup_bvp_edge");
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
      team_starter_k_bb,
      opponent_starter_k_bb,
      team_starter_command,
      opponent_starter_weak_command,
      team_starter_fip,
      opponent_starter_fip,
      team_era_fip_divergence,
      opponent_era_fip_divergence,
      opponent_era_is_lucky,
      team_era_is_unlucky,
      is_home,
      team_home_win_rate,
      team_away_win_rate,
      opponent_home_win_rate,
      opponent_away_win_rate,
      home_away_edge_label,
      hp_ump_name,
      ump_zone_tier,
      ump_pitcher_friendly,
      ump_hitter_friendly,
      ump_zone_note,
      opponent_pitcher_hand,
      team_ops_vs_hand,
      handedness_advantage_tier,
      handedness_advantage_fires,
      handedness_note,
      bvp_status,
      lineup_avg_ops_vs_pitcher,
      lineup_batters_with_history,
      lineup_matchup_tier,
      lineup_bvp_edge_fires,
      bvp_note,
      warnings,
    };
  } catch (err) {
    warnings.push(`MLB context fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ...emptyMLBContextHints(), warnings };
  }
}

// ── K/BB ratio helper ─────────────────────────────────────────

/**
 * Compute K/BB ratio for a probable starter.
 * Returns null if insufficient IP (< 5) to trust the ratio, or if baseOnBalls is 0.
 * At season start (Opening Day), this will typically return null — expected and non-fatal.
 */
function computeKBB(
  pitcher: { strikeOuts?: number | null; baseOnBalls?: number | null; inningsPitched?: number | null } | null,
): number | null {
  if (!pitcher) return null;
  const k = pitcher.strikeOuts ?? 0;
  const bb = pitcher.baseOnBalls ?? 0;
  const ip = pitcher.inningsPitched ?? 0;
  if (ip < 5 || bb === 0) return null;
  return Math.round((k / bb) * 100) / 100;
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
    pitcher_command_active: allSignals.includes("pitcher_command"),
    home_away_edge_active: allSignals.includes("home_away_edge"),
    opponent_era_lucky_active: allSignals.includes("opponent_era_lucky"),
    team_era_unlucky_active: allSignals.includes("team_era_unlucky"),
    park_runs_index: contextHints?.park_runs_index ?? null,
    wind_speed_mph: contextHints?.wind_speed_mph ?? null,
    temperature_f: contextHints?.temperature_f ?? null,
    opponent_bullpen_score: contextHints?.opponent_bullpen_score ?? null,
    team_starter_quality: contextHints?.team_starter_quality ?? null,
    opponent_starter_quality: contextHints?.opponent_starter_quality ?? null,
    team_starter_k_bb: contextHints?.team_starter_k_bb ?? null,
    opponent_starter_k_bb: contextHints?.opponent_starter_k_bb ?? null,
    team_starter_fip: contextHints?.team_starter_fip ?? null,
    opponent_starter_fip: contextHints?.opponent_starter_fip ?? null,
    team_era_fip_divergence: contextHints?.team_era_fip_divergence ?? null,
    opponent_era_fip_divergence: contextHints?.opponent_era_fip_divergence ?? null,
    team_home_win_rate: contextHints?.team_home_win_rate ?? null,
    opponent_away_win_rate: contextHints?.opponent_away_win_rate ?? null,
    is_home: contextHints?.is_home ?? null,
    home_away_edge_label: contextHints?.home_away_edge_label ?? "insufficient_data",
    umpire_pitcher_friendly_active: allSignals.includes("umpire_pitcher_friendly"),
    umpire_hitter_friendly_active: allSignals.includes("umpire_hitter_friendly"),
    hp_ump_name: contextHints?.hp_ump_name ?? null,
    ump_zone_tier: contextHints?.ump_zone_tier ?? "neutral",
    handedness_advantage_active: allSignals.includes("handedness_advantage"),
    opponent_pitcher_hand: contextHints?.opponent_pitcher_hand ?? null,
    team_ops_vs_hand: contextHints?.team_ops_vs_hand ?? null,
    handedness_advantage_tier: contextHints?.handedness_advantage_tier ?? "unknown",
    lineup_bvp_edge_active: allSignals.includes("lineup_bvp_edge"),
    bvp_status: contextHints?.bvp_status ?? "unavailable",
    lineup_avg_ops_vs_pitcher: contextHints?.lineup_avg_ops_vs_pitcher ?? null,
    lineup_batters_with_history: contextHints?.lineup_batters_with_history ?? 0,
    lineup_matchup_tier: contextHints?.lineup_matchup_tier ?? "insufficient_data",
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
