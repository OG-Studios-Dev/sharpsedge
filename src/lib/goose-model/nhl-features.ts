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
// teams outperform in regulation), home_away_split (home ice).
// ============================================================

import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import type { NHLContextBoardGame } from "@/lib/nhl-context";

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

  /** MoneyPuck xGoals% for the team (null if unavailable) */
  team_xgoals_pct: number | null;
  /** MoneyPuck xGoals% for the opponent (null if unavailable) */
  opponent_xgoals_pct: number | null;

  /** Non-fatal warnings from context fetch */
  warnings: string[];
}

export function emptyNHLContextHints(): NHLContextHints {
  return {
    auto_signals: [],
    team_goalie_is_backup: false,
    team_is_back_to_back: false,
    team_has_long_haul_travel: false,
    team_rest_days: null,
    team_playoff_pressure: "none",
    opponent_goalie_is_backup: false,
    opponent_is_back_to_back: false,
    opponent_playoff_pressure: "none",
    team_xgoals_pct: null,
    opponent_xgoals_pct: null,
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
  /** Whether back-to-back penalty was active */
  back_to_back_active: boolean;
  /** Whether travel fatigue was active */
  travel_fatigue_active: boolean;
  /** Team rest days at pick time */
  team_rest_days: number | null;
  /** Team playoff pressure */
  team_playoff_pressure: "high" | "medium" | "low" | "none";
  /** MoneyPuck xGoals% differential (team - opponent) */
  xgoals_pct_differential: number | null;
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
 *   - travel_fatigue: long-haul travel (>2 timezone shifts) adds ~5% edge to home.
 *   - rest_days: 2+ days rest → mild advantage over opponent on 1 rest day.
 *   - home_away_split: NHL home ice worth ~3-4% over an 82-game season.
 *   - streak_form: hot/cold streaks in NHL have moderate predictive value.
 *   - matchup_edge: confirmed favorable H2H or style matchup.
 *   - lineup_change: meaningful for player props (PP time, line promotions).
 *   - odds_movement: sharp line movement is a useful confirming signal.
 */
export const NHL_SIGNAL_PRIORS: Record<string, number> = {
  /** Backup goalie starting for opponent — biggest edge in NHL props/ML */
  goalie_news: 0.65,
  /** Team on back-to-back — real fatigue penalty, especially second-night road */
  back_to_back: 0.42,
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
 *   - Back-to-back / travel fatigue for team
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
    const teamRestDays = rest.restDays;
    const teamPressure = pressure.urgencyTier;
    const teamXGoalsPct = mp?.xGoalsPercentage ?? null;

    // ── Extract opponent context ──────────────────────────────
    const oppGoalie = oppEntry.derived.goalie;
    const oppRest = oppEntry.derived.rest;
    const oppPressure = oppEntry.derived.playoffPressure;
    const oppMp = oppEntry.sourced.moneyPuck;

    const oppIsBackup = oppGoalie.isBackup || oppGoalie.starterStatus === "unavailable";
    const oppIsB2B = oppRest.isBackToBack;
    const oppPressureTier = oppPressure.urgencyTier;
    const oppXGoalsPct = oppMp?.xGoalsPercentage ?? null;

    // ── Auto-signal tagging ───────────────────────────────────
    const auto_signals: string[] = [];

    // Goalie news: opponent runs backup → goalie_news signal (strong edge for team ML/goals over)
    if (oppIsBackup) {
      auto_signals.push("goalie_news");
    }

    // Back-to-back penalty for this team
    if (teamIsB2B) {
      auto_signals.push("back_to_back");
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

    const xDiff =
      typeof teamXGoalsPct === "number" && typeof oppXGoalsPct === "number"
        ? teamXGoalsPct - oppXGoalsPct
        : null;

    return {
      auto_signals,
      team_goalie_is_backup: teamIsBackup,
      team_is_back_to_back: teamIsB2B,
      team_has_long_haul_travel: teamHasLongHaul,
      team_rest_days: teamRestDays,
      team_playoff_pressure: teamPressure,
      opponent_goalie_is_backup: oppIsBackup,
      opponent_is_back_to_back: oppIsB2B,
      opponent_playoff_pressure: oppPressureTier,
      team_xgoals_pct: teamXGoalsPct,
      opponent_xgoals_pct: oppXGoalsPct,
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
    back_to_back_active: allSignals.includes("back_to_back"),
    travel_fatigue_active: allSignals.includes("travel_fatigue"),
    team_rest_days: contextHints?.team_rest_days ?? null,
    team_playoff_pressure: contextHints?.team_playoff_pressure ?? "none",
    xgoals_pct_differential: xgDiff,
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
