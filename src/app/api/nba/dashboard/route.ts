import { NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";

export async function GET() {
  try {
    const data = await getNBADashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      schedule: [],
      props: [],
      teamTrends: [],
      odds: [],
      meta: { league: "NBA", oddsConnected: false, gamesCount: 0, propsCount: 0, liveOnly: true },
    });
  }
}
