import { NextResponse } from "next/server";
import { playerProps } from "@/data/seed";
import { impliedProbability, calculateEdge, calculateScore, deriveIndicators, categorizeSplits } from "@/lib/edge-engine";

export async function GET() {
  try {
    const enriched = playerProps.map((prop) => {
      const splits = categorizeSplits(prop.splits);
      const implied = impliedProbability(prop.odds);
      const avgHitRate = splits.length > 0
        ? splits.reduce((sum, s) => sum + s.hitRate, 0) / splits.length / 100
        : 0;
      const edge = avgHitRate - implied;
      const score = calculateScore(splits);
      const indicators = deriveIndicators(splits);

      return {
        ...prop,
        splits,
        impliedProb: Math.round(implied * 100),
        hitRate: Math.round(avgHitRate * 100),
        edge: Math.round(edge * 100),
        score: Math.round(score * 100),
        indicators,
      };
    });

    enriched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json(playerProps);
  }
}
