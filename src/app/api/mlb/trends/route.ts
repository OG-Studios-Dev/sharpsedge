import { NextResponse } from "next/server";
import { TeamTrend } from "@/lib/types";
import { getMLBTrendData } from "@/lib/mlb-live-data";
import { qualifiesAsTrend } from "@/lib/trend-filter";

export const dynamic = "force-dynamic";

const TEAM_THRESHOLD = 50;

function teamQualifies(trend: TeamTrend) {
  return typeof trend.hitRate === "number" && trend.hitRate >= TEAM_THRESHOLD;
}

export async function GET() {
  try {
    const data = await getMLBTrendData();
    const trendingProps = (data.props || []).filter(qualifiesAsTrend);
    const trendingTeams = (data.teamTrends || []).filter(teamQualifies);

    return NextResponse.json({
      props: trendingProps,
      teamTrends: trendingTeams,
      meta: {
        ...data.meta,
        criteria: "50%+ L10 OR 3/5 L5 OR 2-game streak",
        propsCount: trendingProps.length,
        teamTrendsCount: trendingTeams.length,
      },
    });
  } catch {
    return NextResponse.json({ props: [], teamTrends: [], meta: {} });
  }
}
