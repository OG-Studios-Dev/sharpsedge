import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";
import { getDateKey } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

const DASHBOARD_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
};

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    return NextResponse.json(data, { headers: DASHBOARD_CACHE_HEADERS });
  } catch {
    return NextResponse.json({
      schedule: { games: [], date: getDateKey() },
      props: [],
      teamTrends: [],
      meta: { oddsConnected: false, gamesCount: 0, propsCount: 0, liveOnly: true },
    }, { headers: DASHBOARD_CACHE_HEADERS });
  }
}
