import { TrendSplit, TrendIndicator } from "./types";

export function impliedProbability(odds: number): number {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
  return 100 / (odds + 100);
}

export function calculateEdge(hitRate: number, odds: number): number {
  const implied = impliedProbability(odds);
  return hitRate - implied;
}

export function calculateScore(splits: TrendSplit[]): number {
  const lastN = splits.find((s) => s.type === "last_n");
  const vsOpp = splits.find((s) => s.type === "vs_opponent");
  const homeAway = splits.find((s) => s.type === "home_away");

  const lastNRate = lastN ? lastN.hitRate / 100 : 0;
  const vsOppRate = vsOpp ? vsOpp.hitRate / 100 : 0;
  const homeAwayRate = homeAway ? homeAway.hitRate / 100 : 0;

  return lastNRate * 0.4 + vsOppRate * 0.3 + homeAwayRate * 0.3;
}

export function deriveIndicators(splits: TrendSplit[]): TrendIndicator[] {
  const indicators: TrendIndicator[] = [];

  const lastN = splits.find((s) => s.type === "last_n");
  indicators.push({ type: "hot", active: !!lastN && lastN.hitRate >= 75 });

  const vsOpp = splits.find((s) => s.type === "vs_opponent");
  indicators.push({ type: "vs_opponent", active: !!vsOpp && vsOpp.hitRate >= 70 });

  const homeAway = splits.find((s) => s.type === "home_away");
  indicators.push({ type: "home_away", active: !!homeAway && homeAway.hitRate >= 70 });

  const without = splits.find((s) => s.type === "without_player");
  indicators.push({ type: "without_player", active: !!without && without.hitRate >= 70 });

  return indicators;
}

export function categorizeSplits(splits: TrendSplit[]): TrendSplit[] {
  return splits.map((split) => {
    if (split.type) return split;
    const label = split.label.toLowerCase();
    let type: TrendSplit["type"] = "last_n";
    if (label.includes(" vs ") || label.includes(" against ")) {
      type = "vs_opponent";
    } else if (label.includes("home") || label.includes("away")) {
      type = "home_away";
    } else if (label.includes("without")) {
      type = "without_player";
    }
    return { ...split, type };
  });
}

export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function getHitRateColor(rate: number): string {
  if (rate >= 90) return "text-emerald-400";
  if (rate >= 80) return "text-emerald-400";
  if (rate >= 70) return "text-yellow-400";
  return "text-red-400";
}

export function getEdgeLabel(edge: number): { label: string; color: string } {
  if (edge >= 0.15) return { label: "Strong Edge", color: "text-emerald-400" };
  if (edge >= 0.05) return { label: "Positive Edge", color: "text-accent-green" };
  if (edge >= 0) return { label: "Slight Edge", color: "text-yellow-400" };
  return { label: "Negative Edge", color: "text-red-400" };
}
