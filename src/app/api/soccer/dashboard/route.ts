import { NextRequest, NextResponse } from "next/server";
import { getSoccerDashboardData, type SoccerDashboardData } from "@/lib/soccer-live-data";
import type { SoccerLeague } from "@/lib/soccer-api";

export const dynamic = "force-dynamic";

function parseLeague(value: string | null): SoccerLeague {
  return value === "SERIE_A" ? "SERIE_A" : "EPL";
}

export async function GET(request: NextRequest) {
  const league = parseLeague(request.nextUrl.searchParams.get("league"));

  try {
    const data = await getSoccerDashboardData(league);
    return NextResponse.json(data);
  } catch {
    const fallback: SoccerDashboardData = {
      league,
      schedule: [],
      standings: [],
      teamTrends: [],
      odds: [],
      matchInsights: [],
      meta: {
        oddsConnected: false,
        scheduleCount: 0,
        standingsCount: 0,
        trendCount: 0,
      },
    };

    return NextResponse.json(fallback);
  }
}
