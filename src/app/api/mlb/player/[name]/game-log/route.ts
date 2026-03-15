import { NextRequest, NextResponse } from "next/server";
import {
  MLB_TEAM_COLORS,
  MLB_TEAM_IDS,
  getCurrentMLBSeason,
  getMLBPlayerGameLog,
  getMLBTeamRoster,
} from "@/lib/mlb-api";
import { getAllPlayerPropOdds } from "@/lib/odds-api";
import { findMLBOddsForGame, getMLBEventOdds, getMLBOdds } from "@/lib/mlb-odds";
import { resolvePlayerPropMarket } from "@/lib/player-prop-odds";
import { BookOdds } from "@/lib/types";

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

function shortLabel(propType: string) {
  return propType.replace(/[^A-Za-z0-9+]/g, "").toUpperCase().slice(0, 6) || "STAT";
}

export async function GET(req: NextRequest, context: { params: { name: string } }) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const playerName = decodePlayerName(
      context.params.name,
      searchParams.get("playerName"),
    );
    const team = (searchParams.get("team") || "").toUpperCase();
    const opponent = (searchParams.get("opponent") || "").toUpperCase();
    const propType = searchParams.get("propType") || "Hits";
    const overUnder = searchParams.get("overUnder") === "Under" ? "Under" : "Over";
    const playerIdParam = searchParams.get("playerId");
    const season = Number(searchParams.get("season")) || getCurrentMLBSeason();
    const market = resolvePlayerPropMarket("MLB", propType);

    if (!playerName || !team) {
      return NextResponse.json({ error: "Missing playerName or team" }, { status: 400 });
    }

    let oddsComparison: BookOdds[] = [];
    if (market) {
      let oddsEventId = searchParams.get("oddsEventId") || "";

      if (!oddsEventId && opponent) {
        const featuredOdds = await getMLBOdds();
        const event = findMLBOddsForGame(featuredOdds, team, opponent);
        oddsEventId = event?.id || "";
      }

      if (oddsEventId) {
        const eventOdds = await getMLBEventOdds(oddsEventId);
        oddsComparison = getAllPlayerPropOdds(eventOdds, market, playerName, overUnder);
      }
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
    let logs = await getMLBPlayerGameLog(playerId, season, group);
    if (logs.length === 0 && season > 2000) {
      logs = await getMLBPlayerGameLog(playerId, season - 1, group);
    }

    return NextResponse.json({
      league: "MLB",
      playerId,
      playerName: logs[0]?.playerName || playerName,
      team,
      teamColor: MLB_TEAM_COLORS[team] || "#4a9eff",
      headshot: resolveHeadshot(playerId),
      oddsComparison,
      availableStats: [{ key: propType, label: propType, shortLabel: shortLabel(propType) }],
      nextGame: null,
      defenseGrid: null,
      player: {
        position: group === "pitching" ? "P" : "BAT",
        positionLabel: group === "pitching" ? "Pitcher" : "Batter",
        jerseyNumber: null,
        injuryStatus: null,
      },
      games: logs.map((log) => ({
        gameId: log.gameId,
        date: log.gameDate,
        teamAbbrev: team,
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
      previousSeasonGames: [],
    });
  } catch {
    return NextResponse.json({
      league: "MLB",
      availableStats: [],
      player: {
        position: "",
        positionLabel: "Player",
        jerseyNumber: null,
        injuryStatus: null,
      },
      games: [],
      previousSeasonGames: [],
    }, { status: 500 });
  }
}
