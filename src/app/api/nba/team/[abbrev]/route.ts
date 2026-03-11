import { NextRequest, NextResponse } from "next/server";
import { getNBAStandings, getNBASchedule, getNBATeamRoster, NBA_TEAM_COLORS } from "@/lib/nba-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ abbrev: string }> }
) {
  const { abbrev } = await params;
  const teamAbbrev = abbrev.toUpperCase();

  try {
    const [standings, schedule, roster] = await Promise.all([
      getNBAStandings(),
      getNBASchedule(),
      // We need to find the team ID — derive from schedule or roster search
      Promise.resolve([]),
    ]);

    const standing = standings.find((s) => s.teamAbbrev === teamAbbrev) || null;

    // Find team ID from today's schedule
    let teamId = "";
    for (const game of schedule) {
      if (game.homeTeam.abbreviation === teamAbbrev) { teamId = game.homeTeam.id; break; }
      if (game.awayTeam.abbreviation === teamAbbrev) { teamId = game.awayTeam.id; break; }
    }

    // Fetch roster if we found a team ID
    const teamRoster = teamId ? await getNBATeamRoster(parseInt(teamId) || 0) : [];

    // Recent games from schedule (completed games only)
    const recentGames = schedule
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
