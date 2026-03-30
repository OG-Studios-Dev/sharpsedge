// ============================================================
// PGA Near-Miss Detection
// ============================================================
//
// Purpose: Detect when a PGA pick finished just outside the
// threshold — a "near miss". This is LEARNING METADATA ONLY.
//
// ⚠️  CRITICAL RULES:
//   - Near misses NEVER count as wins. Official W/L/P unchanged.
//   - Near-miss data is stored in actual_result (string) and
//     pick_snapshot.near_miss (JSON) — purely for model sharpening.
//   - Signal weights are NOT updated differently for near misses.
//
// Exact near-miss rules encoded:
//   top_5    : player finishes exactly 6th (1 outside threshold)
//   top_10   : player finishes exactly 11th (1 outside threshold)
//   top_20   : player finishes exactly 21st (1 outside threshold)
//   outright : player finishes 2nd or 3rd (within 2 of win)
//   matchup  : not tracked (binary head-to-head, no positional sense)
//   make_cut : not tracked (pass/fail, no gradient)
//
// Storage:
//   actual_result (text): e.g. "Finished 11th (near miss, Top 10 threshold)"
//   pick_snapshot.near_miss (jsonb): { is_near_miss, actual_place, threshold, margin }
//
// ============================================================

import type { PGAMarketType } from "./pga-features";

export interface PGANearMissResult {
  /** Whether this is a near miss at all */
  is_near_miss: boolean;
  /** Actual finish position (e.g. 6, 11, 21, 2, 3) */
  actual_place: number | null;
  /** The market threshold (e.g. 5 for top_5) */
  threshold: number | null;
  /** How many places outside the threshold (e.g. 1 for 6th in top_5) */
  margin: number | null;
  /** Human-readable label for logs / actual_result field */
  label: string;
}

/**
 * Returns the finish threshold for a given market type.
 * null = market type doesn't support near-miss tracking.
 */
export function pgaMarketThreshold(marketType: PGAMarketType): number | null {
  switch (marketType) {
    case "outright_winner": return 1;
    case "top_5":           return 5;
    case "top_10":          return 10;
    case "top_20":          return 20;
    default:                return null; // make_cut, matchup, round_score, unknown
  }
}

/**
 * Detect whether a PGA pick result qualifies as a near miss.
 *
 * Near-miss definition per market:
 *   - outright_winner: finished 2nd or 3rd (margin 1 or 2)
 *   - top_5:  finished exactly 6th (margin 1)
 *   - top_10: finished exactly 11th (margin 1)
 *   - top_20: finished exactly 21st (margin 1)
 *
 * @param marketType  Detected market type from pick label
 * @param actualPlace Actual finish position (1-indexed, null if unknown)
 * @returns PGANearMissResult (is_near_miss=false when not applicable)
 */
export function detectPGANearMiss(
  marketType: PGAMarketType,
  actualPlace: number | null,
): PGANearMissResult {
  const threshold = pgaMarketThreshold(marketType);

  if (threshold === null || actualPlace === null || actualPlace <= 0) {
    return { is_near_miss: false, actual_place: actualPlace, threshold, margin: null, label: formatPlaceLabel(actualPlace) };
  }

  // Must have LOST (finished outside threshold) to be a near miss
  if (actualPlace <= threshold) {
    return { is_near_miss: false, actual_place: actualPlace, threshold, margin: null, label: formatPlaceLabel(actualPlace) };
  }

  const margin = actualPlace - threshold;

  // Near-miss window per market:
  //   outright: margin ≤ 2 (2nd or 3rd place)
  //   top_5/10/20: margin === 1 (exactly 1 outside threshold)
  const nearMissWindow = threshold === 1 ? 2 : 1;
  const isNearMiss = margin <= nearMissWindow;

  const label = isNearMiss
    ? `Finished ${ordinal(actualPlace)} (near miss, ${marketTypeLabel(marketType)} threshold)`
    : formatPlaceLabel(actualPlace);

  return {
    is_near_miss: isNearMiss,
    actual_place: actualPlace,
    threshold,
    margin,
    label,
  };
}

// ── helpers ──────────────────────────────────────────────────

function formatPlaceLabel(place: number | null): string {
  if (place === null) return "Position unknown";
  return `Finished ${ordinal(place)}`;
}

function marketTypeLabel(marketType: PGAMarketType): string {
  switch (marketType) {
    case "outright_winner": return "Outright Winner";
    case "top_5":           return "Top 5";
    case "top_10":          return "Top 10";
    case "top_20":          return "Top 20";
    default:                return marketType;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
