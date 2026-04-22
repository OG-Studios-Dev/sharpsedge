import { NextRequest, NextResponse } from "next/server";
import {
  MLB_TEAM_COLORS,
  MLB_TEAM_IDS,
  getCurrentMLBSeason,
  getMLBPlayerGameLog,
  getMLBSchedule,
  getMLBTeamRoster,
} from "@/lib/mlb-api";
import { getAllPlayerPropOdds } from "@/lib/odds-api";
import { findMLBOddsForGame, getMLBEventOdds, getMLBOdds } from "@/lib/mlb-odds";
import { getDefenseGridForPlayer } from "@/lib/player-defense";
import { resolvePlayerPropMarket } from "@/lib/player-prop-odds";
import { formatNextGameDisplay, type PlayerResearchStatOption } from "@/lib/player-research";
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

const MLB_BATTER_STATS: PlayerResearchStatOption[] = [
  { key: "Hits", label: "Hits", shortLabel: "H" },
  { key: "Total Bases", label: "Total Bases", shortLabel: "TB" },
  { key: "Home Runs", label: "Home Runs", shortLabel: "HR" },
  { key: "RBIs", label: "RBIs", shortLabel: "RBI" },
  { key: "Runs", label: "Runs", shortLabel: "R" },
  { key: "Stolen Bases", label: "Stolen Bases", shortLabel: "SB" },
];

const MLB_PITCHER_STATS: PlayerResearchStatOption[] = [
  { key: "Strikeouts", label: "Strikeouts", shortLabel: "K" },
  { key: "Earned Runs", label: "Earned Runs", shortLabel: "ER" },
  { key: "Innings Pitched", label: "Innings Pitched", shortLabel: "IP" },
  { key: "Hits Allowed", label: "Hits Allowed", shortLabel: "HA" },
  { key: "Walks Allowed", label: "Walks Allowed", shortLabel: "BB" },
  { key: "Pitch Count", label: "Pitch Count", shortLabel: "PIT" },
];

function getUpcomingMLBGame(team: string, games: Awaited<ReturnType<typeof getMLBSchedule>>) {
  return games.find((game) => {
    const isTeamGame = game.homeTeam.abbreviation === team || game.awayTeam.abbreviation === team;
    return isTeamGame && game.status !== "Final";
  });
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

    const roster = await getMLBTeamRoster(MLB_TEAM_IDS[team]);
    const normalizedTarget = normalizeName(playerName);
    const rosterEntry = roster.find((player) => player.id === playerId)
      || roster.find((player) => normalizeName(player.name) === normalizedTarget)
      || roster.find((player) => normalizeName(player.name).includes(normalizedTarget))
      || roster.find((player) => normalizedTarget.includes(normalizeName(player.name)));

    const group = isPitcherProp(propType) ? "pitching" : "hitting";
    let logs = await getMLBPlayerGameLog(playerId, season, group);
    if (logs.length === 0 && season > 2000) {
      logs = await getMLBPlayerGameLog(playerId, season - 1, group);
    }

    const upcomingGames = await getMLBSchedule(5);
    const nextGame = getUpcomingMLBGame(team, upcomingGames);
    const nextGameInfo = nextGame
      ? {
          gameId: nextGame.id,
          opponent: nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.abbreviation : nextGame.homeTeam.abbreviation,
          team,
          isAway: nextGame.awayTeam.abbreviation === team,
          startTimeUTC: nextGame.startTimeUTC || undefined,
          status: nextGame.status,
          statusDetail: nextGame.statusDetail,
          opponentFullName: nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.fullName : nextGame.homeTeam.fullName,
          teamRecord: nextGame.homeTeam.abbreviation === team ? nextGame.homeTeam.record : nextGame.awayTeam.record,
          opponentRecord: nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.record : nextGame.homeTeam.record,
          display: formatNextGameDisplay(
            team,
            nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.abbreviation : nextGame.homeTeam.abbreviation,
            nextGame.awayTeam.abbreviation === team,
            nextGame.startTimeUTC,
          ),
        }
      : null;
    const defenseGrid = group === "pitching" ? null : await getDefenseGridForPlayer("MLB", (opponent || nextGameInfo?.opponent || "").toUpperCase(), rosterEntry?.position || "");

    return NextResponse.json({
      league: "MLB",
      playerId,
      playerName: logs[0]?.playerName || playerName,
      team,
      teamColor: MLB_TEAM_COLORS[team] || "#4a9eff",
      headshot: resolveHeadshot(playerId),
      oddsComparison,
      availableStats: group === "pitching" ? MLB_PITCHER_STATS : MLB_BATTER_STATS,
      nextGame: nextGameInfo,
      defenseGrid,
      player: {
        playerId,
        position: rosterEntry?.position || (group === "pitching" ? "P" : "BAT"),
        positionLabel: group === "pitching" ? "Pitcher" : (rosterEntry?.position || "Batter"),
        jerseyNumber: rosterEntry?.jerseyNumber || null,
        injuryStatus: rosterEntry?.status || null,
        bats: rosterEntry?.bats || null,
        throws: rosterEntry?.throws || null,
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
        atBats: log.atBats,
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
        walksAllowed: log.walksAllowed,
        pitchesThrown: log.pitchesThrown,
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
