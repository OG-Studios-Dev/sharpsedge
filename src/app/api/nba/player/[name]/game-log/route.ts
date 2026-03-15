import { NextRequest, NextResponse } from "next/server";
import { getNBAPlayerGameLog, getRecentNBAGames, NBA_TEAM_COLORS } from "@/lib/nba-api";

function decodePlayerName(slug: string, fallback?: string | null) {
  if (fallback) return fallback;
  return slug.replace(/-/g, " ").trim();
}

function formatMinutesPlayed(minutesPlayed: number) {
  const totalSeconds = Math.max(0, Math.round(minutesPlayed * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export async function GET(req: NextRequest, context: { params: { name: string } }) {
  try {
    const playerName = decodePlayerName(
      context.params.name,
      req.nextUrl.searchParams.get("playerName")
    );
    const team = req.nextUrl.searchParams.get("team") || "";

    if (!playerName || !team) {
      return NextResponse.json({ error: "Missing playerName or team" }, { status: 400 });
    }

    const recentGames = await getRecentNBAGames(40);
    const logs = await getNBAPlayerGameLog(playerName, team, recentGames, 20);

    return NextResponse.json({
      league: "NBA",
      playerName: logs[0]?.playerName || playerName,
      team,
      teamColor: NBA_TEAM_COLORS[team] || "#4a9eff",
      games: logs.map((log) => ({
        gameId: log.gameId,
        date: log.gameDate,
        opponent: log.opponentAbbrev,
        opponentAbbrev: log.opponentAbbrev,
        isHome: log.isHome,
        result: log.result,
        score: log.score,
        points: log.points,
        rebounds: log.rebounds,
        assists: log.assists,
        threePointersMade: log.threePointersMade,
        minutes: formatMinutesPlayed(log.minutesPlayed),
      })),
    });
  } catch {
    return NextResponse.json({
      league: "NBA",
      games: [],
    }, { status: 500 });
  }
}
