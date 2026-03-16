import { NextResponse } from "next/server";
import { getNFLDashboardData } from "@/lib/nfl-live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getNFLDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      schedule: [],
      standings: [],
      meta: {
        league: "NFL",
        inOffseason: true,
        seasonStartsLabel: "September",
        seasonStartDate: new Date().toISOString(),
        countdownDays: 0,
        upcomingEvents: [],
      },
    });
  }
}
