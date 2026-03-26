// ============================================================
// Goose AI Picks Model — NBA feature registry & scoring
//
// Purpose: Apply NBA-specific prior weights when the live signal-weight
// DB has insufficient data (< 5 appearances per signal). As real outcomes
// accumulate the DB weights naturally take over via scorePickBySignals().
//
// Design: additive bonus only — never overrides the DB when populated.
// ============================================================

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
 * Minimum number of DB appearances before we trust the live weight
 * over the prior. Matches the threshold in store.scorePickBySignals().
 */
const MIN_APPEARANCES = 5;

/**
 * Compute an NBA-specific prior score for a candidate pick.
 *
 * Returns a value in [0, 1] representing the expected win rate given
 * the signals present, using priors ONLY for signals not yet well-established
 * in the live weight DB.
 *
 * @param signals       Signals tagged on this pick
 * @param liveWeightMap Map of signal → live DB win_rate (undefined if < MIN_APPEARANCES)
 * @returns Blended NBA prior score, or 0 if no NBA priors apply
 */
export function scoreNBAFeatures(
  signals: string[],
  liveWeightMap: Map<string, { win_rate: number; appearances: number }>,
): number {
  if (!signals.length) return 0;

  let total = 0;
  let count = 0;

  for (const sig of signals) {
    const prior = NBA_SIGNAL_PRIORS[sig];
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
 * Build a signal → live-weight map for NBA from an array of GooseSignalWeight rows.
 * Used to pass into scoreNBAFeatures().
 */
export function buildNBAWeightMap(
  weights: Array<{ signal: string; win_rate: number; appearances: number }>,
): Map<string, { win_rate: number; appearances: number }> {
  return new Map(weights.map((w) => [w.signal, { win_rate: w.win_rate, appearances: w.appearances }]));
}
