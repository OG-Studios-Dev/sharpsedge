import { NextResponse } from "next/server";
import {
  getGameGoalies,
  getTeamStandings,
  getTeamRecentGames,
} from "@/lib/nhl-api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const id = parseInt(gameId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid gameId" }, { status: 400 });
  }

  const [goalies, standings] = await Promise.all([
    getGameGoalies(id),
    getTeamStandings(),
  ]);

  const homeAbbrev = goalies.home?.team || "";
  const awayAbbrev = goalies.away?.team || "";

  const [homeRecentGames, awayRecentGames] = await Promise.all([
    homeAbbrev ? getTeamRecentGames(homeAbbrev) : Promise.resolve([]),
    awayAbbrev ? getTeamRecentGames(awayAbbrev) : Promise.resolve([]),
  ]);

  const homeStanding = standings.find((t) => t.teamAbbrev === homeAbbrev) || null;
  const awayStanding = standings.find((t) => t.teamAbbrev === awayAbbrev) || null;

  return NextResponse.json({
    goalies,
    homeStanding,
    awayStanding,
    homeRecentGames: homeRecentGames.slice(-5),
    awayRecentGames: awayRecentGames.slice(-5),
  });
}
