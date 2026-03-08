import { playerProps } from "@/data/seed";
import { categorizeSplits, impliedProbability, calculateScore, deriveIndicators } from "@/lib/edge-engine";
import { PlayerProp } from "@/lib/types";

function averageHitRate(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildPropsPayload(): PlayerProp[] {
  const enriched = playerProps.map((prop) => {
    const splits = categorizeSplits(prop.splits);
    const implied = impliedProbability(prop.odds);
    const splitRates = splits.map((s) => s.hitRate / 100);
    const avgHitRate = averageHitRate(splitRates);
    const edge = avgHitRate - implied;
    const score = calculateScore(splits);
    const indicators = deriveIndicators(splits);
    const recentGames = splits
      .filter((s) => s.type === "last_n")
      .flatMap((s) => Array.from({ length: s.total }, (_, i) => (i < s.hits ? prop.line + 1 : Math.max(prop.line - 1, 0))));
    const homeAway = splits.find((s) => s.type === "home_away");
    const vsOpponent = splits.find((s) => s.type === "vs_opponent");
    const lastN = splits.find((s) => s.type === "last_n");

    return {
      ...prop,
      matchup: `${prop.team} ${prop.isAway ? '@' : 'vs'} ${prop.opponent}`,
      splits,
      impliedProb: Math.round(implied * 100),
      hitRate: Math.round(avgHitRate * 100),
      edge: Math.round(edge * 100),
      score: Math.round(score * 100),
      indicators,
      recommendation: `${prop.overUnder} ${prop.line} ${prop.propType}`,
      direction: prop.overUnder,
      confidence: Math.round(score * 100),
      confidenceBreakdown: {
        recentForm: lastN?.hitRate ?? 0,
        matchup: vsOpponent?.hitRate ?? 0,
        situational: homeAway?.hitRate ?? 0,
      },
      rollingAverages: {
        last5: recentGames.length ? Number((recentGames.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(recentGames.length, 5)).toFixed(1)) : null,
        last10: recentGames.length ? Number((recentGames.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(recentGames.length, 10)).toFixed(1)) : null,
      },
      isBackToBack: false,
      recentGames: recentGames.slice(0, 10),
      reasoning: splits.slice(0, 2).map((s) => s.label).join(". "),
      summary: `${prop.playerName} has a ${Math.round(avgHitRate * 100)}% trend hit rate across the strongest supporting splits.`,
      saved: false,
    } satisfies PlayerProp;
  });

  enriched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return enriched;
}
