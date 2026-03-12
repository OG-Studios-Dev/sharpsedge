import { NextRequest, NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks } from "@/lib/picks-engine";

export async function GET(req: NextRequest) {
  try {
    const data = await getNBADashboardData();
    const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const picks = selectNBATopPicks(data.props || [], data.teamTrends || [], date);
    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date: new Date().toISOString().slice(0, 10) });
  }
}
