import { NextRequest, NextResponse } from "next/server";
import { getNBAPlayerGameLog, getRecentNBAGames, NBA_TEAM_COLORS } from "@/lib/nba-api";
import { getAllPlayerPropOdds } from "@/lib/odds-api";
import { findNBAOddsForGame, getNBAEventOdds, getNBAOdds } from "@/lib/nba-odds";
import { resolvePlayerPropMarket } from "@/lib/player-prop-odds";
import { BookOdds } from "@/lib/types";

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
    const searchParams = req.nextUrl.searchParams;
    const playerName = decodePlayerName(
      context.params.name,
      searchParams.get("playerName")
    );
    const team = searchParams.get("team") || "";
    const opponent = searchParams.get("opponent") || "";
    const propType = searchParams.get("propType") || "Points";
    const overUnder = searchParams.get("overUnder") === "Under" ? "Under" : "Over";
    const market = resolvePlayerPropMarket("NBA", propType);

    if (!playerName || !team) {
      return NextResponse.json({ error: "Missing playerName or team" }, { status: 400 });
    }

    let oddsComparison: BookOdds[] = [];
    if (market) {
      let oddsEventId = searchParams.get("oddsEventId") || "";

      if (!oddsEventId && opponent) {
        const featuredOdds = await getNBAOdds();
        const event = findNBAOddsForGame(featuredOdds, team, opponent);
        oddsEventId = event?.id || "";
      }

      if (oddsEventId) {
        const eventOdds = await getNBAEventOdds(oddsEventId);
        oddsComparison = getAllPlayerPropOdds(eventOdds, market, playerName, overUnder);
      }
    }

    const recentGames = await getRecentNBAGames(40);
    const logs = await getNBAPlayerGameLog(playerName, team, recentGames, 20);

    return NextResponse.json({
      league: "NBA",
      playerName: logs[0]?.playerName || playerName,
      team,
      teamColor: NBA_TEAM_COLORS[team] || "#4a9eff",
      oddsComparison,
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
