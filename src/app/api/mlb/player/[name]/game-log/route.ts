import { NextRequest, NextResponse } from "next/server";
import {
  MLB_TEAM_COLORS,
  MLB_TEAM_IDS,
  getCurrentMLBSeason,
  getMLBPlayerGameLog,
  getMLBTeamRoster,
} from "@/lib/mlb-api";

function decodePlayerName(slug: string, fallback?: string | null) {
  if (fallback) return fallback;
  return slug.replace(/-/g, " ").trim();
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function isPitcherProp(propType: string) {
  const prop = propType.toLowerCase();
  return prop.includes("strikeout")
    || prop.includes("earned")
    || prop.includes("innings")
    || prop.includes("allowed")
    || prop === "k";
}

function resolveHeadshot(playerId: number) {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;
}

export async function GET(req: NextRequest, context: { params: { name: string } }) {
  try {
    const playerName = decodePlayerName(
      context.params.name,
      req.nextUrl.searchParams.get("playerName"),
    );
    const team = req.nextUrl.searchParams.get("team") || "";
    const propType = req.nextUrl.searchParams.get("propType") || "Hits";
    const playerIdParam = req.nextUrl.searchParams.get("playerId");
    const season = Number(req.nextUrl.searchParams.get("season")) || getCurrentMLBSeason();

    if (!playerName || !team) {
      return NextResponse.json({ error: "Missing playerName or team" }, { status: 400 });
    }

    let playerId = Number(playerIdParam) || 0;
    if (!playerId) {
      const teamId = MLB_TEAM_IDS[team];
      if (!teamId) {
        return NextResponse.json({ error: "Unknown team" }, { status: 400 });
      }

      const roster = await getMLBTeamRoster(teamId);
      const normalizedTarget = normalizeName(playerName);
      const match = roster.find((player) => normalizeName(player.name) === normalizedTarget)
        || roster.find((player) => normalizeName(player.name).includes(normalizedTarget))
        || roster.find((player) => normalizedTarget.includes(normalizeName(player.name)));

      if (!match) {
        return NextResponse.json({ error: "Player not found on active roster" }, { status: 404 });
      }

      playerId = match.id;
    }

    const group = isPitcherProp(propType) ? "pitching" : "hitting";
    const logs = await getMLBPlayerGameLog(playerId, season, group);

    return NextResponse.json({
      league: "MLB",
      playerId,
      playerName: logs[0]?.playerName || playerName,
      team,
      teamColor: MLB_TEAM_COLORS[team] || "#4a9eff",
      headshot: resolveHeadshot(playerId),
      games: logs.map((log) => ({
        gameId: log.gameId,
        date: log.gameDate,
        opponent: log.opponentAbbrev,
        opponentAbbrev: log.opponentAbbrev,
        isHome: log.isHome,
        result: log.result,
        score: log.score,
        hits: log.hits,
        totalBases: log.totalBases,
        homeRuns: log.homeRuns,
        rbis: log.rbis,
        runs: log.runs,
        stolenBases: log.stolenBases,
        strikeOuts: log.strikeOuts,
        inningsPitched: log.inningsPitched,
        earnedRuns: log.earnedRuns,
        hitsAllowed: log.hitsAllowed,
      })),
    });
  } catch {
    return NextResponse.json({ league: "MLB", games: [] }, { status: 500 });
  }
}
