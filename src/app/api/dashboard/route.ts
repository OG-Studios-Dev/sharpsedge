import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      schedule: { games: [], date: new Date().toISOString().slice(0, 10) },
      props: [],
      meta: { oddsConnected: false, gamesCount: 0, propsCount: 0 },
    });
  }
}
