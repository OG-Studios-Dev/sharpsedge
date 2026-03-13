import { NextRequest, NextResponse } from "next/server";
import { getNBAStandings, getNBASchedule, NBA_TEAM_COLORS, parseNBARecord } from "@/lib/nba-api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    const [schedule, standings] = await Promise.all([
      getNBASchedule(),
      getNBAStandings(),
    ]);

    const game = schedule.find((g) => String(g.id) === gameId);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const standingMap = new Map(standings.map((s) => [s.teamAbbrev, s]));
    const normalizeStanding = (teamAbbrev: string) => {
      const standing = standingMap.get(teamAbbrev);
      if (!standing) return null;
      const home = parseNBARecord(standing.homeRecord);
      const away = parseNBARecord(standing.roadRecord);
      return {
        ...standing,
        homeWins: home.wins,
        homeLosses: home.losses,
        awayWins: away.wins,
        awayLosses: away.losses,
      };
    };

    const homeStanding = normalizeStanding(game.homeTeam.abbreviation);
    const awayStanding = normalizeStanding(game.awayTeam.abbreviation);

    return NextResponse.json({
      game: {
        id: game.id,
        date: game.date,
        status: game.status,
        homeTeam: {
          abbreviation: game.homeTeam.abbreviation,
          fullName: game.homeTeam.fullName,
          score: game.homeScore,
          color: NBA_TEAM_COLORS[game.homeTeam.abbreviation] || "#4a9eff",
        },
        awayTeam: {
          abbreviation: game.awayTeam.abbreviation,
          fullName: game.awayTeam.fullName,
          score: game.awayScore,
          color: NBA_TEAM_COLORS[game.awayTeam.abbreviation] || "#4a9eff",
        },
      },
      homeStanding,
      awayStanding,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load matchup" }, { status: 500 });
  }
}
