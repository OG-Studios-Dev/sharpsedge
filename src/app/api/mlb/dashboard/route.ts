import { NextResponse } from "next/server";
import { getMLBDashboardData } from "@/lib/mlb-live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getMLBDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      schedule: [],
      props: [],
      teamTrends: [],
      odds: [],
      meta: { league: "MLB", oddsConnected: false, gamesCount: 0, propsCount: 0, scheduleMessage: "No games scheduled" },
    });
  }
}
