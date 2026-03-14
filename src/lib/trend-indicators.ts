import { TrendIndicator } from "@/lib/types";

/**
 * Assigns trend indicator badges based on statistical patterns.
 *
 * 🪿 Goose Lean: AI model edge > 10% (the AI sees value others don't)
 * 🔥 Hot: hit rate >= 70% with 5+ sample
 * 🤑 Money: positive edge + favorable odds (good value play)
 * 🔒 Lock: hit rate >= 85% with 5+ sample (near-certain)
 * 💨 On a Run: 3+ consecutive hits (active streak)
 */
export function assignIndicators(params: {
  hitRate: number; // 0-100
  edge?: number; // 0-100 or 0-1 (auto-detected)
  sampleSize?: number;
  consecutiveHits?: number;
  odds?: number;
  recentGames?: number[];
  line?: number;
}): TrendIndicator[] {
  const indicators: TrendIndicator[] = [];
  const hr = params.hitRate;
  const edge = normalizeEdge(params.edge);
  const sample = params.sampleSize ?? 0;
  const odds = params.odds;

  // Count consecutive hits from recentGames if provided
  let streak = params.consecutiveHits ?? 0;
  if (streak === 0 && params.recentGames && params.line !== undefined) {
    for (const val of params.recentGames) {
      if (val > params.line) streak++;
      else break;
    }
  }

  // 🔒 Lock: 85%+ hit rate with solid sample
  if (hr >= 85 && sample >= 5) {
    indicators.push({ type: "lock", active: true });
  }

  // 🔥 Hot: 70%+ hit rate with decent sample
  if (hr >= 70 && sample >= 4) {
    indicators.push({ type: "hot", active: true });
  }

  // 🪿 Goose Lean: AI edge > 10%
  if (edge > 10) {
    indicators.push({ type: "goose_lean", active: true });
  }

  // 🤑 Money: positive edge + odds in the -200 to +200 range (value play)
  if (edge > 5 && typeof odds === "number" && odds >= -200 && odds <= 200) {
    indicators.push({ type: "money", active: true });
  }

  // 💨 On a Run: 3+ consecutive hits
  if (streak >= 3) {
    indicators.push({ type: "streak", active: true });
  }

  return indicators;
}

function normalizeEdge(edge?: number): number {
  if (typeof edge !== "number" || !Number.isFinite(edge)) return 0;
  return Math.abs(edge) <= 1 ? edge * 100 : edge;
}
