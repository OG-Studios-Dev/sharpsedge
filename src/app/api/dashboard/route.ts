import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";
import { getDateKey } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      schedule: { games: [], date: getDateKey() },
      props: [],
      teamTrends: [],
      meta: { oddsConnected: false, gamesCount: 0, propsCount: 0, liveOnly: true },
    });
  }
}
