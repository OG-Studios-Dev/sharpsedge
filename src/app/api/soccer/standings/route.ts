import { NextRequest, NextResponse } from "next/server";
import { getSoccerStandings, type SoccerLeague } from "@/lib/soccer-api";

export const dynamic = "force-dynamic";

function parseLeague(value: string | null): SoccerLeague {
  return value === "SERIE_A" ? "SERIE_A" : "EPL";
}

export async function GET(request: NextRequest) {
  const league = parseLeague(request.nextUrl.searchParams.get("league"));

  try {
    const standings = await getSoccerStandings(league);
    return NextResponse.json(standings);
  } catch {
    return NextResponse.json([]);
  }
}
