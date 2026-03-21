import { NextResponse } from "next/server";
import { getTeamStandings, getTeamRecentGames, getTeamRoster } from "@/lib/nhl-api";
import { getMLBStandings, getMLBTeamRoster, MLB_TEAM_IDS, MLB_TEAM_COLORS } from "@/lib/mlb-api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ abbrev: string }> }
) {
  const { abbrev } = await params;
  const upper = abbrev.toUpperCase();

  // Try NHL first
  const [nhlStandings, recentGames, roster] = await Promise.all([
    getTeamStandings(),
    getTeamRecentGames(upper),
    getTeamRoster(upper),
  ]);

  const standing = nhlStandings.find((t) => t.teamAbbrev === upper) || null;

  if (standing) {
    return NextResponse.json({ league: "NHL", standing, recentGames, roster });
  }

  // Try MLB
  const mlbTeamId = MLB_TEAM_IDS[upper];
  if (mlbTeamId) {
    try {
      const [mlbStandings, mlbRoster] = await Promise.all([
        getMLBStandings(),
        getMLBTeamRoster(mlbTeamId),
      ]);
      const mlbStanding = mlbStandings.find((t) => t.teamAbbrev === upper) || null;
      return NextResponse.json({
        league: "MLB",
        standing: mlbStanding
          ? {
              teamAbbrev: upper,
              teamName: mlbStanding.teamName,
              gamesPlayed: mlbStanding.wins + mlbStanding.losses,
              wins: mlbStanding.wins,
              losses: mlbStanding.losses,
              points: mlbStanding.wins,
              conferenceName: mlbStanding.league,
              divisionName: mlbStanding.division,
              logo: `https://www.mlbstatic.com/team-logos/${mlbTeamId}.svg`,
              goalsFor: mlbStanding.runsScored ?? 0,
              goalsAgainst: mlbStanding.runsAllowed ?? 0,
              streakCode: mlbStanding.streak || "",
            }
          : null,
        recentGames: [],
        roster: mlbRoster.map((p) => ({
          id: p.id,
          firstName: { default: (p.name || "").split(" ")[0] },
          lastName: { default: (p.name || "").split(" ").slice(1).join(" ") },
          positionCode: p.position || "?",
          sweaterNumber: p.jerseyNumber ? parseInt(String(p.jerseyNumber)) : undefined,
        })),
      });
    } catch {
      // MLB API failed, return empty
    }
  }

  // Nothing found
  return NextResponse.json({ league: null, standing: null, recentGames: [], roster: [] });
}
