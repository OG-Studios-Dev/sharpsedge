import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    return NextResponse.json({
      bestBets: data.props.slice(0, 10),
      meta: data.meta,
    });
  } catch {
    return NextResponse.json({ bestBets: [], meta: { oddsConnected: false, gamesCount: 0, propsCount: 0 } });
  }
}
