import { NextResponse } from "next/server";
import { getTeamStandings, getTeamRecentGames, getTeamRoster } from "@/lib/nhl-api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ abbrev: string }> }
) {
  const { abbrev } = await params;
  const upper = abbrev.toUpperCase();

  const [standings, recentGames, roster] = await Promise.all([
    getTeamStandings(),
    getTeamRecentGames(upper),
    getTeamRoster(upper),
  ]);

  const standing = standings.find((t) => t.teamAbbrev === upper) || null;

  return NextResponse.json({ standing, recentGames, roster });
}
