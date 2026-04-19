import { NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";

export const dynamic = "force-dynamic";

const DASHBOARD_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

export async function GET() {
  try {
    return NextResponse.json(await getNBADashboardData(), { headers: DASHBOARD_CACHE_HEADERS });
  } catch {
    return NextResponse.json({
      schedule: [],
      props: [],
      teamTrends: [],
      odds: [],
      meta: { league: "NBA", oddsConnected: false, gamesCount: 0, propsCount: 0, liveOnly: true },
    }, { headers: DASHBOARD_CACHE_HEADERS });
  }
}
