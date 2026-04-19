import { NextResponse } from "next/server";
import { getMLBDashboardData } from "@/lib/mlb-live-data";

export const dynamic = "force-dynamic";

const DASHBOARD_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

export async function GET() {
  try {
    const data = await getMLBDashboardData();
    return NextResponse.json(data, { headers: DASHBOARD_CACHE_HEADERS });
  } catch {
    return NextResponse.json({
      schedule: [],
      props: [],
      teamTrends: [],
      odds: [],
      meta: { league: "MLB", oddsConnected: false, gamesCount: 0, propsCount: 0, scheduleMessage: "No games scheduled" },
    }, { headers: DASHBOARD_CACHE_HEADERS });
  }
}
