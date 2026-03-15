import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";

export const dynamic = "force-dynamic";

function readBuiltFallback() {
  try {
    const fallbackPath = path.join(process.cwd(), ".next", "server", "app", "api", "nba", "dashboard.body");
    if (!fs.existsSync(fallbackPath)) return null;
    return JSON.parse(fs.readFileSync(fallbackPath, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const data = await getNBADashboardData();
    if ((data.props?.length ?? 0) === 0 || (data.teamTrends?.length ?? 0) === 0) {
      const fallback = readBuiltFallback();
      if (fallback) return NextResponse.json(fallback);
    }
    return NextResponse.json(data);
  } catch {
    const fallback = readBuiltFallback();
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json({
      schedule: [],
      props: [],
      teamTrends: [],
      odds: [],
      meta: { league: "NBA", oddsConnected: false, gamesCount: 0, propsCount: 0, liveOnly: true },
    });
  }
}
