import { NextRequest, NextResponse } from "next/server";
import { BDL_TEAM_IDS, getNBAStandings, getNBATeamRoster, getRecentNBAGames, NBA_TEAM_COLORS, parseNBARecord } from "@/lib/nba-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ abbrev: string }> }
) {
  const { abbrev } = await params;
  const teamAbbrev = abbrev.toUpperCase();

  try {
    const [standings, recentGamesFeed] = await Promise.all([
      getNBAStandings(),
      getRecentNBAGames(10),
    ]);

    const rawStanding = standings.find((s) => s.teamAbbrev === teamAbbrev) || null;
    const standing = rawStanding
      ? {
          ...rawStanding,
          homeWins: parseNBARecord(rawStanding.homeRecord).wins,
          homeLosses: parseNBARecord(rawStanding.homeRecord).losses,
          awayWins: parseNBARecord(rawStanding.roadRecord).wins,
          awayLosses: parseNBARecord(rawStanding.roadRecord).losses,
        }
      : null;

    const teamId = BDL_TEAM_IDS[teamAbbrev] || 0;
    const teamRoster = teamId ? await getNBATeamRoster(teamId) : [];

    const recentGames = recentGamesFeed
      .filter((g) =>
        g.status === "Final" &&
        (g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev)
      )
      .slice(0, 10)
      .map((g) => {
        const isHome = g.homeTeam.abbreviation === teamAbbrev;
        const teamScore = isHome ? g.homeScore : g.awayScore;
        const oppScore = isHome ? g.awayScore : g.homeScore;
        const opponent = isHome ? g.awayTeam.abbreviation : g.homeTeam.abbreviation;
        return {
          date: g.date,
          opponent,
          isHome,
          teamScore: teamScore ?? 0,
          oppScore: oppScore ?? 0,
          win: (teamScore ?? 0) > (oppScore ?? 0),
        };
      });

    return NextResponse.json({
      teamAbbrev,
      teamName: standing?.teamName || teamAbbrev,
      teamColor: NBA_TEAM_COLORS[teamAbbrev] || "#4a9eff",
      standing,
      roster: teamRoster,
      recentGames,
    });
  } catch {
    return NextResponse.json({
      teamAbbrev,
      teamName: teamAbbrev,
      teamColor: NBA_TEAM_COLORS[teamAbbrev] || "#4a9eff",
      standing: null,
      roster: [],
      recentGames: [],
    });
  }
}
