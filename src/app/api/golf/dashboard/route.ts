import { NextResponse } from "next/server";
import { getGolfDashboardData } from "@/lib/golf-live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getGolfDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      leaderboard: null,
      schedule: [],
      playerInsights: [],
      odds: null,
      meta: {
        league: "PGA",
        oddsConnected: false,
        scheduleCount: 0,
        playersCount: 0,
        tournamentStatus: "none",
      },
    });
  }
}
