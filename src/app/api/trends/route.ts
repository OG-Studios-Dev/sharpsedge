import { NextResponse } from "next/server";
import { getLiveTrendData } from "@/lib/live-data";

const HIT_RATE_THRESHOLD = 70; // 70% in last 10 games

export async function GET() {
  try {
    const data = await getLiveTrendData();

    // Player props: only show 70%+ hit rate in last 10 games
    const trendingProps = (data.props || []).filter(
      (p) => typeof p.hitRate === "number" && p.hitRate >= HIT_RATE_THRESHOLD
    );

    // Team trends: only show 70%+ hit rate
    const trendingTeams = (data.teamTrends || []).filter(
      (t) => typeof t.hitRate === "number" && t.hitRate >= HIT_RATE_THRESHOLD
    );

    return NextResponse.json({
      props: trendingProps,
      teamTrends: trendingTeams,
      meta: {
        ...data.meta,
        threshold: HIT_RATE_THRESHOLD,
        propsCount: trendingProps.length,
        teamTrendsCount: trendingTeams.length,
      },
    });
  } catch {
    return NextResponse.json({ props: [], teamTrends: [], meta: { threshold: 70 } });
  }
}
