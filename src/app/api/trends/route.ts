import { NextResponse } from "next/server";
import { teamTrends, parlays, sgps } from "@/data/seed";
import { impliedProbability, deriveIndicators, categorizeSplits } from "@/lib/edge-engine";

export async function GET() {
  try {
    const enrichedTeams = teamTrends.map((trend) => {
      const splits = categorizeSplits(trend.splits);
      const implied = impliedProbability(trend.odds);
      const avgHitRate = splits.length > 0
        ? splits.reduce((sum, s) => sum + s.hitRate, 0) / splits.length / 100
        : 0;
      const edge = avgHitRate - implied;
      const indicators = deriveIndicators(splits);

      return {
        ...trend,
        splits,
        impliedProb: Math.round(implied * 100),
        hitRate: Math.round(avgHitRate * 100),
        edge: Math.round(edge * 100),
        indicators,
      };
    });

    const enrichedSGPs = sgps.map((sgp) => {
      const splits = categorizeSplits(sgp.splits);
      const indicators = deriveIndicators(splits);
      return { ...sgp, splits, indicators };
    });

    return NextResponse.json({
      teamTrends: enrichedTeams,
      parlays,
      sgps: enrichedSGPs,
    });
  } catch {
    return NextResponse.json({ teamTrends, parlays, sgps });
  }
}
