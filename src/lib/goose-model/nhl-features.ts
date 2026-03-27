// ============================================================
// Goose AI Picks Model — NHL feature registry & scoring
//
// Purpose: Apply NHL-specific prior weights when the live signal-weight
// DB has insufficient data (< 5 appearances per signal). As real outcomes
// accumulate the DB weights naturally take over via scorePickBySignals().
//
// Design: additive bonus only — never overrides the DB when populated.
//
// Key NHL signals: goalie_news (backup starting = biggest edge),
// back_to_back (compressed NHL schedule makes B2B brutal),
// travel_fatigue (cross-country/timezone hops), rest_days (well-rested
// teams outperform in regulation), home_away_split (home ice),
// three_in_four (3 games in 4 days — heavy fatigue penalty),
// goalie_quality (weak confirmed starter: savePct < 0.895 && GAA > 3.00).
// ============================================================

import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import type { NHLContextBoardGame } from "@/lib/nhl-context";
import { aggregateTeamShotProfile, aggregateTeamShotProfileWithStorage } from "@/lib/nhl-shot-events";

// ── Types ────────────────────────────────────────────────────

/**
 * Structured context hints derived from the NHL context board for a specific pick.
 * Populated at generation time and stored in pick_snapshot.factors.nhl_features.
 */
export interface NHLContextHints {
  /** Signals auto-tagged from live NHL context (goalie, rest, travel, etc.) */
  auto_signals: string[];

  /** Whether the team's goalie is a backup / unconfirmed starter */
  team_goalie_is_backup: boolean;
  /** Whether the team is playing back-to-back */
  team_is_back_to_back: boolean;
  /** Whether the team has a long-haul travel flag */
  team_has_long_haul_travel: boolean;
  /** Whether the team is playing 3 games in 4 days (heavy fatigue) */
  team_three_in_four: boolean;
  /** Rest days since last game (null if unavailable) */
  team_rest_days: number | null;
  /** Playoff urgency tier for the team */
  team_playoff_pressure: "high" | "medium" | "low" | "none";

  /** Whether the opponent's goalie is a backup / unconfirmed starter */
  opponent_goalie_is_backup: boolean;
  /** Whether the opponent is playing back-to-back */
  opponent_is_back_to_back: boolean;
  /** Playoff urgency tier for the opponent */
  opponent_playoff_pressure: "high" | "medium" | "low" | "none";
  /**
   * Opponent goalie quality tier derived from season SV% + GAA.
   * "weak" fires goalie_quality signal (SV% < 0.895 && GAA > 3.00).
   */
  opponent_goalie_quality: "elite" | "average" | "weak" | "unknown";
  /** Season SV% for the opponent's starting goalie (null if unavailable) */
  opponent_goalie_sv_pct: number | null;
  /** Season GAA for the opponent's starting goalie (null if unavailable) */
  opponent_goalie_gaa: number | null;
  /**
   * Opponent goalie PP save % (vs this team's PP unit).
   * From NHL stats REST API goalie/savesByStrength.
   * Null if goalie unconfirmed or not found in season aggregates.
   */
  opponent_goalie_pp_sv_pct: number | null;
  /**
   * Opponent goalie EV save % (5v5 baseline).
   * Null if not available.
   */
  opponent_goalie_ev_sv_pct: number | null;

  /** MoneyPuck xGoals% for the team (null if unavailable) */
  team_xgoals_pct: number | null;
  /** MoneyPuck xGoals% for the opponent (null if unavailable) */
  opponent_xgoals_pct: number | null;

  // ── PP / PK efficiency differential ─────────────────────────────────
  /**
   * Team season PP% (null if unavailable).
   * Source: NHL stats REST API team/powerplay endpoint.
   */
  team_pp_pct: number | null;
  /**
   * Opponent season PK% (null if unavailable).
   * Source: NHL stats REST API team/penaltykill endpoint.
   */
  opponent_pk_pct: number | null;
  /**
   * PP efficiency differential: team PP% minus opponent PK%.
   * Positive = team PP is stronger than opponent PK → PP edge signal.
   * Null if either PP or PK data unavailable.
   */
  pp_efficiency_differential: number | null;
  /**
   * Net special teams differential:
   * (teamPP% - oppPK%) + (teamPK% - oppPP%)
   * Positive = team has overall special teams advantage.
   * Null if any of the four values is missing.
   */
  net_special_teams_differential: number | null;
  /** PP efficiency tier from DerivedPPEfficiency */
  pp_efficiency_tier: "strong" | "moderate" | "neutral" | "adverse" | "unavailable";

  // ── Shot danger zone / xG (from NHL PBP aggregate) ────────────────
  /**
   * Team HDCF% (high-danger chances for %) over last N games.
   * Source: nhl-pbp-aggregate (api-web.nhle.com play-by-play).
   * Null if profile unavailable.
   */
  team_hdcf_pct: number | null;
  /**
   * Opponent HDCF% over last N games.
   * Null if profile unavailable.
   */
  opponent_hdcf_pct: number | null;
  /**
   * HD edge = team HDCF% - opponent HDCF%.
   * Positive = team has more high-danger shot share.
   * Null if either profile unavailable.
   */
  hd_edge: number | null;
  /**
   * Team xGF% (expected goals for %) over last N games.
   * Source: nhl-pbp-aggregate xG model (distance + angle + shot type).
   * Null if profile unavailable.
   */
  team_xgf_pct: number | null;
  /**
   * Opponent xGF% over last N games.
   * Null if profile unavailable.
   */
  opponent_xgf_pct: number | null;
  /**
   * Team HDSV% (high-danger save %) allowed by team's goalie.
   * Derived from PBP: HD shots on goal against / saves.
   * Null if insufficient sample.
   */
  team_hd_save_pct: number | null;
  /**
   * Opponent HDSV% (goalie's HD save %).
   * Null if insufficient sample.
   */
  opponent_hd_save_pct: number | null;
  /**
   * Shot quality tier from matchup comparison.
   */
  shot_quality_tier: "strong_away" | "edge_away" | "neutral" | "edge_home" | "strong_home" | "unavailable";

  // ── Injury context (from NHL roster API) ──────────────────────────
  /**
   * Number of confirmed-out (IR/IR-NR/LTIR) players for this team.
   * Source: NHL roster API injuryStatus field.
   * NOTE: Does NOT include healthy scratches. DTD not counted here.
   */
  team_confirmed_out_count: number;
  /**
   * Number of day-to-day (DTD) players for this team.
   * UNCERTAINTY: DTD does NOT mean player will miss the game.
   * Monitor lineup announcements for day-of-game confirmation.
   */
  team_day_to_day_count: number;
  /** True if team has any confirmed-out (IR+) players */
  team_has_confirmed_injuries: boolean;
  /** Confirmed-out player names (for audit/display) */
  team_confirmed_out_players: string[];
  /**
   * Number of confirmed-out players for the opponent.
   * Same uncertainty caveat applies.
   */
  opponent_confirmed_out_count: number;
  /** Number of day-to-day players for opponent */
  opponent_day_to_day_count: number;
  /** True if opponent has confirmed-out players */
  opponent_has_confirmed_injuries: boolean;
  /** Confirmed-out opponent player names */
  opponent_confirmed_out_players: string[];
  /**
   * Explicit rail limitation note from injury source.
   * ALWAYS surface this — do not suppress uncertainty.
   * e.g. "Healthy scratches NOT included. DTD is uncertain."
   */
  injury_rail_note: string;

  /** Non-fatal warnings from context fetch */
  warnings: string[];
}

export function emptyNHLContextHints(): NHLContextHints {
  return {
    auto_signals: [],
    team_goalie_is_backup: false,
    team_is_back_to_back: false,
    team_three_in_four: false,
    team_has_long_haul_travel: false,
    team_rest_days: null,
    team_playoff_pressure: "none",
    opponent_goalie_is_backup: false,
    opponent_is_back_to_back: false,
    opponent_playoff_pressure: "none",
    opponent_goalie_quality: "unknown",
    opponent_goalie_sv_pct: null,
    opponent_goalie_gaa: null,
    opponent_goalie_pp_sv_pct: null,
    opponent_goalie_ev_sv_pct: null,
    team_xgoals_pct: null,
    opponent_xgoals_pct: null,
    team_pp_pct: null,
    opponent_pk_pct: null,
    pp_efficiency_differential: null,
    net_special_teams_differential: null,
    pp_efficiency_tier: "unavailable",
    team_hdcf_pct: null,
    opponent_hdcf_pct: null,
    hd_edge: null,
    team_xgf_pct: null,
    opponent_xgf_pct: null,
    team_hd_save_pct: null,
    opponent_hd_save_pct: null,
    shot_quality_tier: "unavailable",
    team_confirmed_out_count: 0,
    team_day_to_day_count: 0,
    team_has_confirmed_injuries: false,
    team_confirmed_out_players: [],
    opponent_confirmed_out_count: 0,
    opponent_day_to_day_count: 0,
    opponent_has_confirmed_injuries: false,
    opponent_confirmed_out_players: [],
    injury_rail_note: "NHL roster API injury data not loaded.",
    warnings: [],
  };
}

/**
 * Snapshot stored inside pick_snapshot.factors.nhl_features for auditability.
 */
export interface NHLFeatureSnapshot {
  /** Signals that triggered NHL priors */
  prior_signals: string[];
  /** Blended NHL feature score [0, 1] */
  nhl_feature_score: number;
  /** Per-signal prior values used */
  signal_priors_applied: Record<string, number>;
  /** Signals auto-tagged from live context */
  context_auto_signals: string[];
  /** Whether goalie news was a factor */
  goalie_signal_active: boolean;
  /** Whether opponent's goalie quality (weak starter) signal was active */
  goalie_quality_signal_active: boolean;
  /** Whether back-to-back penalty was active */
  back_to_back_active: boolean;
  /** Whether travel fatigue was active */
  travel_fatigue_active: boolean;
  /** Whether 3-in-4-days heavy fatigue was active */
  three_in_four_active: boolean;
  /** Team rest days at pick time */
  team_rest_days: number | null;
  /** Team playoff pressure */
  team_playoff_pressure: "high" | "medium" | "low" | "none";
  /** Opponent goalie quality tier at pick time */
  opponent_goalie_quality: "elite" | "average" | "weak" | "unknown";
  /** MoneyPuck xGoals% differential (team - opponent) */
  xgoals_pct_differential: number | null;
  /**
   * PP efficiency differential at pick time (team PP% - opponent PK%).
   * Null if PP/PK data unavailable.
   */
  pp_efficiency_differential: number | null;
  /** Whether the pp_efficiency_edge signal was active */
  pp_efficiency_edge_active: boolean;
  /** Whether the goalie_pp_weakness signal was active */
  goalie_pp_weakness_active: boolean;
  /** Net special teams differential (team PP+PK vs opponent PP+PK) */
  net_special_teams_differential: number | null;
  /**
   * Team HDCF% (high-danger chances for %) from PBP aggregate.
   * Source: nhl-pbp-aggregate — last 10 games.
   */
  team_hdcf_pct: number | null;
  /** Opponent HDCF% from PBP aggregate */
  opponent_hdcf_pct: number | null;
  /** HD edge = team HDCF% - opponent HDCF% */
  hd_edge: number | null;
  /** Team xGF% from PBP xG model */
  team_xgf_pct: number | null;
  /** Team HDSV% (goalie's high-danger save %) from PBP */
  team_hd_save_pct: number | null;
  /** Opponent HDSV% from PBP */
  opponent_hd_save_pct: number | null;
  /** Whether the shot_danger_edge signal was active */
  shot_danger_edge_active: boolean;
  /** Warnings from context fetch */
  context_warnings: string[];
}

// ── NHL Signal Priors ─────────────────────────────────────────

/**
 * NHL signal priors: empirical win-rate estimates for each NHL signal.
 * Scale: 0.0–1.0 (fraction of picks expected to win when signal is present).
 *
 * Sources:
 *   - goalie_news: backup starting is the single strongest market-inefficiency
 *     signal in NHL betting; research shows ~65% win rate when opponent runs backup.
 *   - back_to_back: NHL compressed schedule makes B2B a real edge (-penalty) —
 *     teams on B2B have historically won at ~42% vs rest teams.
 *   - three_in_four: 3 games in 4 days is a heavy fatigue load in the NHL;
 *     teams in this window win at ~40% vs fresh opponents. Inspired by the
 *     HockeyShotMap / NHL-Analytics fatigue research — fatigueFlags already
 *     computed in buildFatigue(), now wired into the signal pipeline.
 *   - travel_fatigue: long-haul travel (>2 timezone shifts) adds ~5% edge to home.
 *   - rest_days: 2+ days rest → mild advantage over opponent on 1 rest day.
 *   - home_away_split: NHL home ice worth ~3-4% over an 82-game season.
 *   - streak_form: hot/cold streaks in NHL have moderate predictive value.
 *   - matchup_edge: confirmed favorable H2H or style matchup.
 *   - lineup_change: meaningful for player props (PP time, line promotions).
 *   - odds_movement: sharp line movement is a useful confirming signal.
 *   - goalie_quality: opponent's confirmed starter is "weak" (SV% < 0.895 && GAA > 3.00).
 *     Inspired by TradeTracker's goalie stat context — the GoalieStarter type already
 *     carries savePct/gaa but this edge was never surfaced as a pick signal.
 *     Win-rate ~0.58: less strong than a true backup but still a real market inefficiency.
 */
export const NHL_SIGNAL_PRIORS: Record<string, number> = {
  /** Backup goalie starting for opponent — biggest edge in NHL props/ML */
  goalie_news: 0.65,
  /**
   * Opponent's confirmed starter is a weak goalie (SV% < 0.895 && GAA > 3.00).
   * Weaker than a backup signal but still exploitable — starters below league-average
   * quality (~0.905 SV%) represent a consistent market edge on goals-over and ML bets.
   */
  goalie_quality: 0.58,
  /** Team on back-to-back — real fatigue penalty, especially second-night road */
  back_to_back: 0.42,
  /**
   * 3 games in 4 days — heavy fatigue load in the NHL compressed schedule.
   * Data computed in buildFatigue() (fatigueFlags: "three_in_four") but was
   * previously not wired into the auto-signal pipeline. Now surfaced as a signal.
   */
  three_in_four: 0.40,
  /** Long-haul travel (cross-country / major timezone shift) */
  travel_fatigue: 0.44,
  /** Team is well-rested (2+ days off) vs opponent with less rest */
  rest_days: 0.61,
  /** Home ice advantage in NHL — meaningful for ML and goals props */
  home_away_split: 0.60,
  /** Win/loss streak momentum — moderate predictive value in NHL */
  streak_form: 0.62,
  /** Favorable matchup context — H2H history, style advantage, etc. */
  matchup_edge: 0.63,
  /** Line change / role change for player props (PP time, line promotion) */
  lineup_change: 0.59,
  /** Sharp money line movement — confirming signal for ML picks */
  odds_movement: 0.60,
  /**
   * PP efficiency edge: team PP% substantially outperforms opponent PK%.
   * Fires when ppEfficiencyDifferential >= 0.04 (4pp% edge).
   * Applies most to: goals-over props, team ML, puck-line.
   * Empirical basis: teams with strong PP vs weak PK units score at ~60% of their
   * power-play opportunities, while league average PP → PK cancel out at ~20% / 80%.
   * A 4pp% gap translates to ~0.15 extra goals per game when penalties are drawn.
   * Win-rate estimate ~0.57 (moderate edge — requires penalty volume to matter).
   */
  pp_efficiency_edge: 0.57,
  /**
   * Opponent goalie weak on PP (pp_sv_pct < 0.85 with >= 10 PP shots faced).
   * Specifically exploitable for PP-unit player props (goals, shots, points for
   * PP specialists like first-line wingers and power-play QB defensemen).
   * Weaker signal than overall goalie_quality because it's situational.
   */
  goalie_pp_weakness: 0.55,
  /**
   * Shot danger edge: team's HDCF% >= 3.0 percentage points above opponent's.
   * High-danger chance dominance is a strong predictor of sustained offensive pressure
   * and goal-scoring in the NHL. HDCF% > 52% teams win at ~60% over a season.
   * Source: nhl-pbp-aggregate (play-by-play x/y coordinates, last 10 games, NST convention).
   * Signal fires at ≥3.0 pp difference to avoid noise.
   */
  shot_danger_edge: 0.58,
  /**
   * Opponent goalie high-danger weakness: opponent HDSV% < 0.80 (poor in HD zone).
   * League average HDSV% is approximately 0.82–0.84.
   * Fires when the opponent's goalie has allowed above-average HD conversion
   * in their last 10 games. Compound effect with shot_danger_edge.
   * Source: nhl-pbp-aggregate (derived from PBP shot coordinates).
   */
  opponent_goalie_hd_weakness: 0.56,
};

/**
 * Minimum appearances before we trust live DB weight over prior.
 * Matches the threshold in store.scorePickBySignals().
 */
const MIN_APPEARANCES = 5;

// ── Cache ─────────────────────────────────────────────────────

/** Simple in-process TTL cache for the NHL context board — avoids N board fetches per generation run */
let _boardCache: { value: Awaited<ReturnType<typeof getTodayNHLContextBoard>>; expiresAt: number } | null = null;
const BOARD_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

async function getCachedBoard() {
  if (_boardCache && _boardCache.expiresAt > Date.now()) {
    return _boardCache.value;
  }
  const board = await getTodayNHLContextBoard();
  _boardCache = { value: board, expiresAt: Date.now() + BOARD_CACHE_TTL_MS };
  return board;
}

/** Find the game entry where this team is playing today */
function findGameForTeam(
  games: NHLContextBoardGame[],
  teamAbbrev: string | null | undefined,
  opponentAbbrev: string | null | undefined,
): NHLContextBoardGame | null {
  if (!teamAbbrev) return null;
  const tAbbrev = teamAbbrev.toUpperCase();
  const oAbbrev = (opponentAbbrev ?? "").toUpperCase();

  return (
    games.find((g) => {
      const away = g.teams.away.teamAbbrev.toUpperCase();
      const home = g.teams.home.teamAbbrev.toUpperCase();
      // Match by team, optionally validate opponent
      if (tAbbrev === away || tAbbrev === home) {
        if (!oAbbrev) return true;
        return oAbbrev === away || oAbbrev === home;
      }
      return false;
    }) ?? null
  );
}

// ── Context hint fetcher ──────────────────────────────────────

/**
 * Fetch NHL context hints for a specific pick (team + opponent).
 * Uses the cached context board — safe to call for every pick in a generation run.
 *
 * Extracts:
 *   - Goalie backup signal for team + opponent
 *   - Goalie quality tier (weak confirmed starter) for opponent
 *   - Back-to-back / travel fatigue / three-in-four for team
 *   - Rest days for team
 *   - Playoff pressure for team
 *   - MoneyPuck xGoals% for both teams
 *
 * Returns emptyNHLContextHints() on any failure.
 */
export async function fetchNHLContextHints(
  team: string | null | undefined,
  opponent: string | null | undefined,
): Promise<NHLContextHints> {
  const warnings: string[] = [];

  if (!team) {
    return { ...emptyNHLContextHints(), warnings: ["No team provided for NHL context lookup"] };
  }

  try {
    const board = await getCachedBoard();
    const game = findGameForTeam(board.games, team, opponent);

    if (!game) {
      return {
        ...emptyNHLContextHints(),
        warnings: [`No game found today for team=${team} opp=${opponent ?? "?"}`],
      };
    }

    const tAbbrev = team.toUpperCase();
    const teamEntry =
      game.teams.away.teamAbbrev.toUpperCase() === tAbbrev ? game.teams.away : game.teams.home;
    const oppEntry =
      game.teams.away.teamAbbrev.toUpperCase() === tAbbrev ? game.teams.home : game.teams.away;

    // ── Extract team context ──────────────────────────────────
    const rest = teamEntry.derived.rest;
    const travel = teamEntry.derived.travel;
    const goalie = teamEntry.derived.goalie;
    const pressure = teamEntry.derived.playoffPressure;
    const mp = teamEntry.sourced.moneyPuck;

    const teamIsBackup = goalie.isBackup || goalie.starterStatus === "unavailable";
    const teamIsB2B = rest.isBackToBack;
    const teamHasLongHaul = travel.longHaul;
    const teamThreeInFour = teamEntry.derived.fatigueFlags.includes("three_in_four");
    const teamRestDays = rest.restDays;
    const teamPressure = pressure.urgencyTier;
    const teamXGoalsPct = mp?.xGoalsPercentage ?? null;

    // ── Extract opponent context ──────────────────────────────
    const oppGoalie = oppEntry.derived.goalie;
    const oppRest = oppEntry.derived.rest;
    const oppPressure = oppEntry.derived.playoffPressure;
    const oppMp = oppEntry.sourced.moneyPuck;
    const oppGoalieSourced = oppEntry.sourced.goalie.starter;

    const oppIsBackup = oppGoalie.isBackup || oppGoalie.starterStatus === "unavailable";
    const oppIsB2B = oppRest.isBackToBack;
    const oppPressureTier = oppPressure.urgencyTier;
    const oppXGoalsPct = oppMp?.xGoalsPercentage ?? null;

    // Goalie quality tier for opponent's confirmed starter.
    // League-average SV% is ~0.905. A confirmed starter at < 0.895 + GAA > 3.00
    // is "weak" — a real market edge even though they're not technically a backup.
    // Thresholds derived from TradeTracker goalie-stat context + season average data.
    const oppSvPct = oppGoalieSourced?.savePct ?? null;
    const oppGaa = oppGoalieSourced?.gaa ?? null;
    let oppGoalieQuality: NHLContextHints["opponent_goalie_quality"] = "unknown";
    if (oppSvPct !== null && oppGaa !== null) {
      if (oppSvPct >= 0.915) {
        oppGoalieQuality = "elite";
      } else if (oppSvPct >= 0.895) {
        oppGoalieQuality = "average";
      } else {
        oppGoalieQuality = "weak";
      }
    }

    // Goalie strength splits (EV/PP/SH) from NHL stats REST API
    const oppGoalieStrength = oppEntry.sourced.goalie.strengthSplits ?? null;
    const oppGoaliePpSvPct = (oppGoalieStrength && oppGoalieStrength.ppShotsAgainst >= 5)
      ? oppGoalieStrength.ppSavePct
      : null;
    const oppGoalieEvSvPct = (oppGoalieStrength && oppGoalieStrength.evShotsAgainst >= 10)
      ? oppGoalieStrength.evSavePct
      : null;

    // ── PP / PK efficiency differential ──────────────────────
    const ppEfficiency = teamEntry.derived.ppEfficiency;
    const teamPPPct = ppEfficiency.teamPPPct;
    const oppPKPct = ppEfficiency.opponentPKPct;
    const ppDiff = ppEfficiency.ppEfficiencyDifferential;
    const netSTDiff = ppEfficiency.netSpecialTeamsDifferential;
    const ppTier = ppEfficiency.tier;

    // ── Shot danger zone profiles (nhl-pbp-aggregate) ────────
    // Fetch profiles for both teams in parallel — cached per team for 60 min.
    // Falls back gracefully to null fields if fetch fails.
    // Use storage-backed aggregation (L1 memory → L2 Supabase → L3 fresh PBP)
    const [teamShotProfile, oppShotProfile] = await Promise.all([
      aggregateTeamShotProfileWithStorage(tAbbrev, 10, "rolling").catch(() => null),
      aggregateTeamShotProfileWithStorage(oppEntry.teamAbbrev.toUpperCase(), 10, "rolling").catch(() => null),
    ]);

    const teamHdcfPct = teamShotProfile?.hdcfPct ?? null;
    const oppHdcfPct = oppShotProfile?.hdcfPct ?? null;
    const hdEdge = teamHdcfPct !== null && oppHdcfPct !== null
      ? Math.round((teamHdcfPct - oppHdcfPct) * 10) / 10
      : null;
    const teamXgfPct = teamShotProfile?.xgForPct ?? null;
    const oppXgfPct = oppShotProfile?.xgForPct ?? null;
    const teamHdSavePct = teamShotProfile?.hdSavePct ?? null;
    const oppHdSavePct = oppShotProfile?.hdSavePct ?? null;

    // ── Auto-signal tagging ───────────────────────────────────
    const auto_signals: string[] = [];

    // Goalie news: opponent runs backup → goalie_news signal (strong edge for team ML/goals over)
    if (oppIsBackup) {
      auto_signals.push("goalie_news");
    }

    // Goalie quality: opponent's confirmed starter is weak (below-average SV% + high GAA)
    // Only fires when starter is confirmed (not a backup) to avoid double-counting goalie_news.
    if (!oppIsBackup && oppGoalieQuality === "weak") {
      auto_signals.push("goalie_quality");
    }

    // Back-to-back penalty for this team
    if (teamIsB2B) {
      auto_signals.push("back_to_back");
    }

    // Three-in-four: heavy fatigue load (3 games in 4 days).
    // fatigueFlags is already computed in buildFatigue() — this wires it into the signal pipeline.
    if (teamThreeInFour) {
      auto_signals.push("three_in_four");
    }

    // Travel fatigue for this team
    if (teamHasLongHaul) {
      auto_signals.push("travel_fatigue");
    }

    // Rest advantage: team has more rest than opponent
    const teamRestGt2 = typeof teamRestDays === "number" && teamRestDays >= 2;
    const oppRestLt2 = oppIsB2B || (typeof oppRest.restDays === "number" && oppRest.restDays <= 1);
    if (teamRestGt2 && oppRestLt2) {
      auto_signals.push("rest_days");
    }

    // Matchup edge: significant xGoals differential (team materially outperforms opponent)
    if (typeof teamXGoalsPct === "number" && typeof oppXGoalsPct === "number") {
      const differential = teamXGoalsPct - oppXGoalsPct;
      if (differential >= 3.0) {
        auto_signals.push("matchup_edge");
      }
    }

    // PP efficiency edge: team PP% meaningfully outperforms opponent PK%.
    // Fires at "strong" tier (>=0.04 differential) — targets ML and goals-over picks.
    // Source: NHL stats REST API season aggregates.
    if (ppTier === "strong" || ppTier === "moderate") {
      auto_signals.push("pp_efficiency_edge");
    }

    // Opponent goalie weak on PP (ppSavePct < 0.85 with >= 10 PP shots faced).
    // Most relevant for PP specialist player props (first-line wingers, PP QB defensemen).
    if (oppGoaliePpSvPct !== null && oppGoaliePpSvPct < 0.85 && !oppIsBackup) {
      auto_signals.push("goalie_pp_weakness");
    }

    // Shot danger edge: team's HDCF% >= 3.0 pp above opponent's.
    // Source: nhl-pbp-aggregate (play-by-play shot x/y coordinates).
    if (hdEdge !== null && hdEdge >= 3.0) {
      auto_signals.push("shot_danger_edge");
    }

    // Opponent goalie HD weakness: opponent's HDSV% < 0.80 (poor HD zone performance).
    // League average HDSV% is ~0.82–0.84; < 0.80 is exploitable.
    if (oppHdSavePct !== null && oppHdSavePct < 0.80 && !oppIsBackup) {
      auto_signals.push("opponent_goalie_hd_weakness");
    }

    const xDiff =
      typeof teamXGoalsPct === "number" && typeof oppXGoalsPct === "number"
        ? teamXGoalsPct - oppXGoalsPct
        : null;

    return {
      auto_signals,
      team_goalie_is_backup: teamIsBackup,
      team_is_back_to_back: teamIsB2B,
      team_has_long_haul_travel: teamHasLongHaul,
      team_three_in_four: teamThreeInFour,
      team_rest_days: teamRestDays,
      team_playoff_pressure: teamPressure,
      opponent_goalie_is_backup: oppIsBackup,
      opponent_is_back_to_back: oppIsB2B,
      opponent_playoff_pressure: oppPressureTier,
      opponent_goalie_quality: oppGoalieQuality,
      opponent_goalie_sv_pct: oppSvPct,
      opponent_goalie_gaa: oppGaa,
      opponent_goalie_pp_sv_pct: oppGoaliePpSvPct,
      opponent_goalie_ev_sv_pct: oppGoalieEvSvPct,
      team_xgoals_pct: teamXGoalsPct,
      opponent_xgoals_pct: oppXGoalsPct,
      team_pp_pct: teamPPPct,
      opponent_pk_pct: oppPKPct,
      pp_efficiency_differential: ppDiff,
      net_special_teams_differential: netSTDiff,
      pp_efficiency_tier: ppTier,
      team_hdcf_pct: teamHdcfPct,
      opponent_hdcf_pct: oppHdcfPct,
      hd_edge: hdEdge,
      team_xgf_pct: teamXgfPct,
      opponent_xgf_pct: oppXgfPct,
      team_hd_save_pct: teamHdSavePct,
      opponent_hd_save_pct: oppHdSavePct,
      // shot_quality_tier: from TEAM's perspective (positive hdEdge = team advantage)
      shot_quality_tier:
        hdEdge !== null
          ? (hdEdge > 3.0 ? "strong_away" : hdEdge > 1.5 ? "edge_away" : hdEdge < -3.0 ? "strong_home" : hdEdge < -1.5 ? "edge_home" : "neutral")
          : "unavailable",
      // ── Injury context ──────────────────────────────────────
      team_confirmed_out_count: (teamEntry.sourced.injuries?.confirmedOutCount ?? 0),
      team_day_to_day_count: (teamEntry.sourced.injuries?.dayToDayCount ?? 0),
      team_has_confirmed_injuries: (teamEntry.sourced.injuries?.hasConfirmedInjuries ?? false),
      team_confirmed_out_players: (teamEntry.sourced.injuries?.players ?? [])
        .filter(p => p.certainty === "confirmed_out")
        .map(p => p.playerName),
      opponent_confirmed_out_count: (oppEntry.sourced.injuries?.confirmedOutCount ?? 0),
      opponent_day_to_day_count: (oppEntry.sourced.injuries?.dayToDayCount ?? 0),
      opponent_has_confirmed_injuries: (oppEntry.sourced.injuries?.hasConfirmedInjuries ?? false),
      opponent_confirmed_out_players: (oppEntry.sourced.injuries?.players ?? [])
        .filter(p => p.certainty === "confirmed_out")
        .map(p => p.playerName),
      injury_rail_note: teamEntry.sourced.injuries?.railNote ??
        "NHL roster API injury data not loaded.",
      warnings,
    };
  } catch (err) {
    warnings.push(`NHL context fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ...emptyNHLContextHints(), warnings };
  }
}

// ── Feature scoring ───────────────────────────────────────────

/**
 * Score NHL features and return a full NHLFeatureSnapshot.
 * Uses priors ONLY for signals not yet DB-backed (< MIN_APPEARANCES).
 *
 * @param signals         Reasoning-tagged signals for this pick
 * @param liveWeightMap   Live DB signal weights
 * @param contextHints    Optional context hints from fetchNHLContextHints
 */
export function scoreNHLFeaturesWithSnapshot(
  signals: string[],
  liveWeightMap: Map<string, { win_rate: number; appearances: number }>,
  contextHints?: NHLContextHints | null,
): { score: number; snapshot: NHLFeatureSnapshot } {
  const priorsApplied: Record<string, number> = {};
  const priorSignals: string[] = [];

  // Merge reasoning signals with context auto-signals (deduplicated)
  const contextAutoSignals = contextHints?.auto_signals ?? [];
  const allSignals = Array.from(new Set([...signals, ...contextAutoSignals]));

  let total = 0;
  let count = 0;

  for (const sig of allSignals) {
    const prior = NHL_SIGNAL_PRIORS[sig];
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

  const teamXG = contextHints?.team_xgoals_pct ?? null;
  const oppXG = contextHints?.opponent_xgoals_pct ?? null;
  const xgDiff = typeof teamXG === "number" && typeof oppXG === "number" ? teamXG - oppXG : null;

  const snapshot: NHLFeatureSnapshot = {
    prior_signals: priorSignals,
    nhl_feature_score: score,
    signal_priors_applied: priorsApplied,
    context_auto_signals: contextAutoSignals,
    goalie_signal_active: allSignals.includes("goalie_news"),
    goalie_quality_signal_active: allSignals.includes("goalie_quality"),
    back_to_back_active: allSignals.includes("back_to_back"),
    travel_fatigue_active: allSignals.includes("travel_fatigue"),
    three_in_four_active: allSignals.includes("three_in_four"),
    team_rest_days: contextHints?.team_rest_days ?? null,
    team_playoff_pressure: contextHints?.team_playoff_pressure ?? "none",
    opponent_goalie_quality: contextHints?.opponent_goalie_quality ?? "unknown",
    xgoals_pct_differential: xgDiff,
    pp_efficiency_differential: contextHints?.pp_efficiency_differential ?? null,
    pp_efficiency_edge_active: allSignals.includes("pp_efficiency_edge"),
    goalie_pp_weakness_active: allSignals.includes("goalie_pp_weakness"),
    net_special_teams_differential: contextHints?.net_special_teams_differential ?? null,
    team_hdcf_pct: contextHints?.team_hdcf_pct ?? null,
    opponent_hdcf_pct: contextHints?.opponent_hdcf_pct ?? null,
    hd_edge: contextHints?.hd_edge ?? null,
    team_xgf_pct: contextHints?.team_xgf_pct ?? null,
    team_hd_save_pct: contextHints?.team_hd_save_pct ?? null,
    opponent_hd_save_pct: contextHints?.opponent_hd_save_pct ?? null,
    shot_danger_edge_active: allSignals.includes("shot_danger_edge"),
    context_warnings: contextHints?.warnings ?? [],
  };

  return { score, snapshot };
}

/**
 * Build a signal → live-weight map for NHL from GooseSignalWeight rows.
 */
export function buildNHLWeightMap(
  weights: Array<{ signal: string; win_rate: number; appearances: number }>,
): Map<string, { win_rate: number; appearances: number }> {
  return new Map(weights.map((w) => [w.signal, { win_rate: w.win_rate, appearances: w.appearances }]));
}
