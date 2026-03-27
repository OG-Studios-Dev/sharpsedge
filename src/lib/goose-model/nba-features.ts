// ============================================================
// Goose AI Picks Model — NBA feature registry & scoring
//
// Purpose: Apply NBA-specific prior weights when the live signal-weight
// DB has insufficient data (< 5 appearances per signal). As real outcomes
// accumulate the DB weights naturally take over via scorePickBySignals().
//
// Design: additive bonus only — never overrides the DB when populated.
//
// Market-type awareness: different priors apply depending on whether
// the pick is a player prop (pts/reb/ast/3pt), team ML, spread, or total.
// This reflects the reality that dvp_advantage matters far more for a
// player points prop than it does for a team ML bet.
// ============================================================

/**
 * NBA market types — used to select the right prior for each signal.
 */
export type NBAMarketType =
  | "player_pts"
  | "player_reb"
  | "player_ast"
  | "player_3pt"
  | "player_combo"   // pts+reb+ast, blk, stl, pra, etc.
  | "team_ml"
  | "team_spread"
  | "total"
  | "unknown";

/**
 * Detect NBA market type from pick_label and propType strings.
 * Returns "unknown" when no match is found.
 */
export function detectNBAMarketType(
  pickLabel: string | null | undefined,
  propType?: string | null,
): NBAMarketType {
  const label = (pickLabel ?? "").toLowerCase();
  const prop = (propType ?? "").toLowerCase();

  const combined = `${label} ${prop}`.trim();

  // Player 3-pointers (check before generic shot/pts patterns)
  if (/\b3[- ]?(?:pm|pt|pointer)s?\b/i.test(combined) || /three[- ]pointer/i.test(combined) || /\b3pm\b/i.test(combined)) {
    return "player_3pt";
  }
  // Combo props (pts+reb+ast, pra, dd, td, blk+stl — check BEFORE individual stats)
  if (
    /\bpts\+(?:reb|ast)\b/.test(combined) ||
    /\breb\+ast\b/.test(combined) ||
    /\bblk\+stl\b/.test(combined) ||
    /\bblocks?\s*\+\s*steals?\b/i.test(combined) ||
    /\bpra\b/.test(combined) ||
    /double[- ]double/i.test(combined) ||
    /triple[- ]double/i.test(combined)
  ) {
    return "player_combo";
  }
  // Player rebounds
  if (/\brebound[s]?\b/.test(combined) || /\breb\b/.test(combined)) {
    return "player_reb";
  }
  // Player assists
  if (/\bassist[s]?\b/.test(combined) || /\bast\b/.test(combined)) {
    return "player_ast";
  }
  // Player points
  if (/\bpoints?\b/.test(combined) || /\bpts\b/.test(combined)) {
    return "player_pts";
  }
  // Team spread
  if (/spread|[+-]\d+(?:\.\d)?\s*(?:pts)?/.test(combined) || /\bspread\b/.test(combined)) {
    return "team_spread";
  }
  // Total (game over/under)
  if (/\b(?:game\s+)?total\b/.test(combined) || /\bo\/u\b/.test(combined) || /over.*under/.test(combined)) {
    return "total";
  }
  // Team ML
  if (/\bml\b/.test(combined) || /\bmoneyline\b/.test(combined) || /\bwin\b/.test(combined)) {
    return "team_ml";
  }

  return "unknown";
}

/**
 * NBA signal priors: empirical win-rate estimates for each NBA-specific
 * signal based on historical prop-betting performance and public research.
 *
 * Scale: 0.0–1.0 (fraction of picks expected to win when signal is present).
 * Source: Marco's NBA modeling priorities + public DFS/betting research.
 *
 * These are conservative — they only fire when the DB has < MIN_APPEARANCES
 * for the signal, so regressions happen naturally as real data accrues.
 */
export const NBA_SIGNAL_PRIORS: Record<string, number> = {
  // ── NBA-specific ─────────────────────────────────────────
  /** Opposing team ranks poorly at defending this stat category. Strong edge. */
  dvp_advantage: 0.67,
  /** High-pace game = more possessions = more scoring/stat volume. */
  pace_matchup: 0.63,
  /** Teammate out → direct usage/minutes bump for the targeted player. */
  usage_surge: 0.70,
  /** Opponent allows high 3PA rate → shooter sees inflated attempts. */
  opponent_3pt_rate: 0.61,
  /** Player confirmed starter with 30+ minutes expected — prop floor raised. */
  minutes_floor: 0.63,
  /** Playing at home in NBA — meaningful for both player props and team MLs. */
  home_court_edge: 0.61,
  /** Player has been going over the line in 3+ consecutive recent games. */
  recent_trend_over: 0.64,
  /** Player has been going under the line in 3+ consecutive recent games. */
  recent_trend_under: 0.62,

  // ── General signals with NBA-tuned priors ────────────────
  /** Back-to-back is a meaningful penalty in NBA — fatigue is real. */
  back_to_back: 0.43,   // negative signal: lower expected win rate
  /** Rest advantage matters more in NBA than NHL/MLB. */
  rest_days: 0.63,
  /** Form streaks in NBA carry moderate predictive value for props. */
  streak_form: 0.62,
  /** Home/away split in NBA: meaningful for team props, less for player. */
  home_away_split: 0.60,
  /** Favorable matchup context — confirmed market edge. */
  matchup_edge: 0.65,
};

/**
 * Market-type-aware priors.
 *
 * Override the base prior for a (signal, market) combination when we
 * have specific knowledge that the signal's impact differs by market type.
 *
 * Only entries that meaningfully differ from NBA_SIGNAL_PRIORS are listed.
 * Falls back to NBA_SIGNAL_PRIORS[signal] when no market-specific entry exists.
 */
export const NBA_MARKET_PRIORS: Partial<Record<NBAMarketType, Record<string, number>>> = {
  player_pts: {
    dvp_advantage: 0.69,    // strongest signal for pts props — opponent's pts allowed/game is well-researched
    usage_surge: 0.72,       // usage spike directly inflates points
    pace_matchup: 0.65,      // high pace = more shot attempts
    minutes_floor: 0.65,     // starters get more shot attempts
    recent_trend_over: 0.65,
  },
  player_reb: {
    dvp_advantage: 0.63,    // rebounding matchups are less reliable than scoring matchups
    pace_matchup: 0.62,      // pace helps volume rebounds
    usage_surge: 0.65,       // usage surge often includes rebounding load
    minutes_floor: 0.64,
    recent_trend_over: 0.63,
  },
  player_ast: {
    dvp_advantage: 0.62,    // assists DVP less reliable than scoring DVP
    usage_surge: 0.68,       // usage surge usually means more playmaking too
    pace_matchup: 0.62,
    minutes_floor: 0.62,
    recent_trend_over: 0.63,
  },
  player_3pt: {
    opponent_3pt_rate: 0.66, // strongest signal for 3pt props
    dvp_advantage: 0.64,
    pace_matchup: 0.61,
    recent_trend_over: 0.65,
  },
  player_combo: {
    dvp_advantage: 0.65,
    usage_surge: 0.69,
    pace_matchup: 0.63,
    minutes_floor: 0.65,
    recent_trend_over: 0.64,
  },
  team_ml: {
    home_court_edge: 0.63,   // more meaningful for team outcomes
    back_to_back: 0.40,      // even more penalizing for team MLs
    rest_days: 0.64,
    dvp_advantage: 0.58,     // less direct signal for team ML
    usage_surge: 0.55,       // individual usage surge less relevant for team ML
  },
  team_spread: {
    home_court_edge: 0.62,
    back_to_back: 0.41,
    rest_days: 0.63,
    dvp_advantage: 0.60,
  },
  total: {
    pace_matchup: 0.66,      // most directly relevant for totals
    back_to_back: 0.45,      // totals less affected by fatigue than MLs
    dvp_advantage: 0.60,
  },
};

/**
 * Structured NBA feature snapshot captured at pick time.
 * Stored in pick_snapshot.factors.nba_features for future analytics.
 */
export interface NBAFeatureSnapshot {
  /** Detected market type for this pick */
  market_type: NBAMarketType;
  /** Whether market-type-aware priors were used (vs base priors) */
  market_aware_priors: boolean;
  /** Which signals had NBA priors applied (not yet DB-backed) */
  prior_signals: string[];
  /** The blended NBA feature score [0,1] returned by the scorer */
  nba_feature_score: number;
  /** Per-signal prior values used (for auditability) */
  signal_priors_applied: Record<string, number>;
  /** Whether back-to-back penalty was active */
  back_to_back_penalty: boolean;
  /** Whether a usage surge signal boosted this pick */
  usage_surge_active: boolean;
  /** Whether DVP advantage was present */
  dvp_advantage_present: boolean;
  /** Whether recent trend (over or under) was present */
  recent_trend_active: boolean;

  // ── Live context enrichment (populated when context fetch is run) ──────────
  /** Whether the target player was confirmed active per ESPN roster */
  player_confirmed_active: boolean | null;
  /** Whether a key teammate is out (could inflate usage/minutes for target) */
  key_teammate_out: boolean;
  /** Names of key teammates confirmed out or doubtful */
  key_teammates_out: string[];
  /** Whether any key opponent player is out (relevant for team picks) */
  opponent_key_out: boolean;
  /** Estimated minutes tier: "starter" | "rotation" | "bench" | "unknown" */
  estimated_minutes_tier: string;
  /** Signals that were auto-tagged from live context (not from reasoning text) */
  context_auto_signals: string[];
  /** Warnings from the live context fetch (non-fatal) */
  context_warnings: string[];

  // ── Real numeric features (populated from ESPN boxscore data) ─────────────
  /**
   * Opponent's DvP rank for this pick's position group + stat key.
   * 1 = best defense (hard to beat), 30 = worst defense (favorable).
   * null = data not available.
   */
  opponent_dvp_rank: number | null;
  /**
   * Avg stat allowed per game to this position group by the opponent.
   * e.g. for a PG points prop: avg pts allowed to guards per game.
   */
  opponent_dvp_avg_allowed: number | null;
  /**
   * Pace proxy rank for the player's team (by scoring avg).
   * 1 = highest-scoring team (best pace for prop volume).
   */
  team_pace_rank: number | null;
  /**
   * Pace proxy rank for the opponent team.
   * Both teams in top 10 → high-pace game → more total possessions.
   */
  opponent_pace_rank: number | null;
  /**
   * Whether this game is expected to be high-pace (both teams rank top 10 by scoring avg).
   * Computed from real ESPN boxscore data, not reasoning text.
   */
  high_pace_game: boolean;
  /**
   * Player's average minutes over last 5 qualifying games (≥15 min).
   * Null if not enough data available.
   */
  player_avg_minutes_l5: number | null;
  /**
   * Player's rolling average for the pick's primary stat over last 5 games.
   * e.g. for a points prop: avg points in L5 games.
   * Null if not enough data available.
   */
  player_avg_stat_l5: number | null;
  /**
   * Numeric hit rate for the player over the pick line in last 5 games (0–1).
   * More granular than the rounded hit_rate_at_time field on the pick.
   */
  player_l5_hit_rate: number | null;

  // ── Degraded-state indicators ──────────────────────────────────────────────
  /**
   * Whether the context enricher ran in degraded mode (ESPN failed, fallback used).
   * When true, injury-dependent signals (usage_surge, minutes_floor, injury_news)
   * may be unreliable or missing. Reviewers should treat those signals with lower confidence.
   */
  context_source_degraded: boolean;
  /**
   * The fallback source used when ESPN failed.
   * "bdl" = BallDontLie (basic roster, no injury status).
   * "none" = no roster data.
   * null = ESPN succeeded.
   */
  context_fallback_source: "bdl" | "none" | null;

  // ── Data provenance / source chain ────────────────────────────────────────
  /**
   * Structured record of data sources used to populate this snapshot.
   * Each entry describes one data fetch: the source system, what was
   * fetched, cache status, and timestamp. Stored alongside the snapshot
   * so every pick can be traced back to its data origin.
   *
   * Example entry:
   *   { source: "espn_roster", team: "LAL", cached: true, fetched_at: "..." }
   */
  data_source_chain: DataSourceEntry[];
}

/**
 * A single entry in the data source provenance chain.
 * Captures what was fetched, from where, and whether it was a cache hit.
 */
export interface DataSourceEntry {
  /** Human-readable source name: "espn_scoreboard" | "espn_roster" | "espn_boxscore" | etc. */
  source: string;
  /** Context: team, player, game id, endpoint suffix — helps with debugging */
  context: string;
  /** Whether this fetch was served from the in-process cache */
  cached: boolean;
  /** ISO timestamp of when this fetch occurred */
  fetched_at: string;
  /** Optional: the ESPN/API URL that was called (for audit trails) */
  url?: string;
}

/**
 * Minimum number of DB appearances before we trust the live weight
 * over the prior. Matches the threshold in store.scorePickBySignals().
 */
const MIN_APPEARANCES = 5;

/**
 * Look up the effective prior for a signal given a market type.
 * Returns market-specific prior when available, falls back to base prior.
 */
function effectivePrior(signal: string, marketType: NBAMarketType): number | undefined {
  const marketOverrides = NBA_MARKET_PRIORS[marketType];
  if (marketOverrides && signal in marketOverrides) {
    return marketOverrides[signal];
  }
  return NBA_SIGNAL_PRIORS[signal];
}

/**
 * Compute an NBA-specific prior score for a candidate pick.
 *
 * Returns a value in [0, 1] representing the expected win rate given
 * the signals present, using priors ONLY for signals not yet well-established
 * in the live weight DB.
 *
 * @param signals        Signals tagged on this pick
 * @param liveWeightMap  Map of signal → live DB win_rate (undefined if < MIN_APPEARANCES)
 * @param marketType     Market type for market-aware prior selection (default: "unknown")
 * @returns Blended NBA prior score, or 0 if no NBA priors apply
 */
export function scoreNBAFeatures(
  signals: string[],
  liveWeightMap: Map<string, { win_rate: number; appearances: number }>,
  marketType: NBAMarketType = "unknown",
): number {
  if (!signals.length) return 0;

  let total = 0;
  let count = 0;

  for (const sig of signals) {
    const prior = effectivePrior(sig, marketType);
    if (prior === undefined) continue; // no NBA prior for this signal

    const liveWeight = liveWeightMap.get(sig);
    const hasTrustedLiveData = liveWeight && liveWeight.appearances >= MIN_APPEARANCES;

    // Only use prior when live data is insufficient
    if (!hasTrustedLiveData) {
      total += prior;
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Optional live context hints from nba-context.ts.
 * Passed into scoreNBAFeaturesWithSnapshot when available.
 * Matches the shape of NBAContextHints (the "warnings" field maps to context_warnings).
 */
export interface NBAContextHintsInput {
  auto_signals: string[];
  player_confirmed_active: boolean | null;
  key_teammate_out: boolean;
  key_teammates_out: string[];
  opponent_key_out: boolean;
  estimated_minutes_tier: string;
  /** Alias for NBAContextHints.warnings — non-fatal context fetch issues */
  warnings: string[];
  /** Whether context fetch was degraded (ESPN failed, fallback used) */
  source_degraded?: boolean;
  /** Fallback source when degraded */
  fallback_source?: "bdl" | "none" | null;
  // ── Real numeric features ─────────────────────────────────────────────────
  /** Opponent DvP rank for this position group + stat (1=best D, 30=worst D) */
  opponent_dvp_rank?: number | null;
  /** Avg stat allowed per game by opponent to this position group */
  opponent_dvp_avg_allowed?: number | null;
  /** Player team's pace rank (1=highest scoring = fastest pace) */
  team_pace_rank?: number | null;
  /** Opponent team's pace rank */
  opponent_pace_rank?: number | null;
  /** Whether both teams are in top 10 scoring (high-pace game) */
  high_pace_game?: boolean;
  /** Player avg minutes L5 qualifying games */
  player_avg_minutes_l5?: number | null;
  /** Player rolling avg for this stat type over L5 games */
  player_avg_stat_l5?: number | null;
  /** Player L5 hit rate over the pick line (0–1) */
  player_l5_hit_rate?: number | null;
  /** Data source provenance chain from nba-context enricher */
  data_source_chain?: DataSourceEntry[];
}

/**
 * Score NBA features and return a full NBAFeatureSnapshot for auditability.
 *
 * @param signals        Signals tagged on this pick (from reasoning text)
 * @param liveWeightMap  Live DB weight map
 * @param pickLabel      Pick label string (for market type detection)
 * @param propType       PropType string (for market type detection)
 * @param contextHints   Optional live context hints from nba-context enricher
 * @returns { score, snapshot }
 */
export function scoreNBAFeaturesWithSnapshot(
  signals: string[],
  liveWeightMap: Map<string, { win_rate: number; appearances: number }>,
  pickLabel?: string | null,
  propType?: string | null,
  contextHints?: NBAContextHintsInput | null,
): { score: number; snapshot: NBAFeatureSnapshot } {
  const marketType = detectNBAMarketType(pickLabel, propType);
  const priorsApplied: Record<string, number> = {};
  const priorSignals: string[] = [];

  // Merge reasoning-text signals with live-context auto-signals (deduplicated)
  const contextAutoSignals = contextHints?.auto_signals ?? [];
  const allSignals = Array.from(new Set([...signals, ...contextAutoSignals]));

  let total = 0;
  let count = 0;

  for (const sig of allSignals) {
    const prior = effectivePrior(sig, marketType);
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
  const usingMarketAware =
    marketType !== "unknown" && (NBA_MARKET_PRIORS[marketType] !== undefined);

  const snapshot: NBAFeatureSnapshot = {
    market_type: marketType,
    market_aware_priors: usingMarketAware,
    prior_signals: priorSignals,
    nba_feature_score: score,
    signal_priors_applied: priorsApplied,
    back_to_back_penalty: allSignals.includes("back_to_back"),
    usage_surge_active: allSignals.includes("usage_surge"),
    dvp_advantage_present: allSignals.includes("dvp_advantage"),
    recent_trend_active:
      allSignals.includes("recent_trend_over") || allSignals.includes("recent_trend_under"),
    // Live context fields
    player_confirmed_active: contextHints?.player_confirmed_active ?? null,
    key_teammate_out: contextHints?.key_teammate_out ?? false,
    key_teammates_out: contextHints?.key_teammates_out ?? [],
    opponent_key_out: contextHints?.opponent_key_out ?? false,
    estimated_minutes_tier: contextHints?.estimated_minutes_tier ?? "unknown",
    context_auto_signals: contextAutoSignals,
    context_warnings: contextHints?.warnings ?? [],
    // Real numeric features (from ESPN boxscore data via nba-context.ts)
    opponent_dvp_rank: contextHints?.opponent_dvp_rank ?? null,
    opponent_dvp_avg_allowed: contextHints?.opponent_dvp_avg_allowed ?? null,
    team_pace_rank: contextHints?.team_pace_rank ?? null,
    opponent_pace_rank: contextHints?.opponent_pace_rank ?? null,
    high_pace_game: contextHints?.high_pace_game ?? false,
    player_avg_minutes_l5: contextHints?.player_avg_minutes_l5 ?? null,
    player_avg_stat_l5: contextHints?.player_avg_stat_l5 ?? null,
    player_l5_hit_rate: contextHints?.player_l5_hit_rate ?? null,
    // Data provenance: pull from context hints if present, otherwise minimal entry
    data_source_chain: contextHints?.data_source_chain ?? [
      {
        source: "goose_feature_scorer",
        context: `market_type=${marketType}`,
        cached: false,
        fetched_at: new Date().toISOString(),
      },
    ],
    // Degraded-state indicators from context enricher
    context_source_degraded: contextHints?.source_degraded ?? false,
    context_fallback_source: contextHints?.fallback_source ?? null,
  };

  return { score, snapshot };
}

/**
 * Build a signal → live-weight map for NBA from an array of GooseSignalWeight rows.
 * Used to pass into scoreNBAFeatures() and scoreNBAFeaturesWithSnapshot().
 */
export function buildNBAWeightMap(
  weights: Array<{ signal: string; win_rate: number; appearances: number }>,
): Map<string, { win_rate: number; appearances: number }> {
  return new Map(weights.map((w) => [w.signal, { win_rate: w.win_rate, appearances: w.appearances }]));
}
