import { NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";

export async function GET() {
  try {
    const key = process.env.BALLDONTLIE_API_KEY;
    if (!key) {
      console.warn("BALLDONTLIE_API_KEY not set — NBA data will be empty");
    }
    const data = await getNBADashboardData();
    return NextResponse.json({ ...data, apiKeyMissing: !key });
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
