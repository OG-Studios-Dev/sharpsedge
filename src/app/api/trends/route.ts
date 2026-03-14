import { NextResponse } from "next/server";
import { getLiveTrendData } from "@/lib/live-data";
import { TeamTrend } from "@/lib/types";
import { qualifiesAsTrend } from "@/lib/trend-filter";

const TEAM_THRESHOLD = 50; // Show any team trend above coin flip

function teamQualifies(t: TeamTrend): boolean {
  return typeof t.hitRate === "number" && t.hitRate >= TEAM_THRESHOLD;
}

export async function GET() {
  try {
    const data = await getLiveTrendData();

    const trendingProps = (data.props || []).filter(qualifiesAsTrend);
    const trendingTeams = (data.teamTrends || []).filter(teamQualifies);

    return NextResponse.json({
      props: trendingProps,
      teamTrends: trendingTeams,
      meta: {
        ...data.meta,
        criteria: "60%+ L10 OR 3/5 L5 OR 3-game streak",
        propsCount: trendingProps.length,
        teamTrendsCount: trendingTeams.length,
      },
    });
  } catch {
    return NextResponse.json({ props: [], teamTrends: [], meta: {} });
  }
}
