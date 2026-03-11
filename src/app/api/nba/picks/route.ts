import { NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks } from "@/lib/picks-engine";

export async function GET() {
  try {
    const data = await getNBADashboardData();
    const date = new Date().toISOString().slice(0, 10);
    const picks = selectNBATopPicks(data.props || [], data.teamTrends || [], date);
    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date: new Date().toISOString().slice(0, 10) });
  }
}
