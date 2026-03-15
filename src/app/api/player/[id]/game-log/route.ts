import { NextResponse } from "next/server";
import { NHL_TEAM_COLORS, getTeamRoster } from "@/lib/nhl-api";
import { getAllPlayerPropOdds, getNHLEventOdds, getNHLOdds, findOddsForGame } from "@/lib/odds-api";
import { getDefenseGridForPlayer } from "@/lib/player-defense";
import { formatNextGameDisplay, getPlayerResearchStats, parseClockMinutes } from "@/lib/player-research";
import { getGameLog } from "@/lib/nhl-stats-engine";
import { PlayerTrendGame } from "@/lib/player-trend";
import { resolvePlayerPropMarket } from "@/lib/player-prop-odds";
import { BookOdds } from "@/lib/types";

const NHL_BASE = "https://api-web.nhle.com/v1";
const SEASON = "20252026";
const PREVIOUS_SEASON = "20242025";

const POSITION_LABELS: Record<string, string> = {
  C: "Center",
  LW: "Left Wing",
  RW: "Right Wing",
  L: "Left Wing",
  R: "Right Wing",
  D: "Defenseman",
  G: "Goalie",
};

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 900 } });
  if (!response.ok) {
    throw new Error(`NHL API ${response.status}: ${url}`);
  }
  return response.json();
}

async function getPlayerLanding(playerId: string) {
  return fetchJSON<any>(`${NHL_BASE}/player/${playerId}/landing`);
}

async function getClubSchedule(teamAbbrev: string) {
  return fetchJSON<any>(`${NHL_BASE}/club-schedule-season/${teamAbbrev}/${SEASON}`);
}

async function getPlayerSeasonLog(playerId: string, season: string) {
  const data = await fetchJSON<any>(`${NHL_BASE}/player/${playerId}/game-log/${season}/2`);
  return Array.isArray(data?.gameLog) ? data.gameLog : [];
}

async function getGamecenterLanding(gameId: string) {
  return fetchJSON<any>(`${NHL_BASE}/gamecenter/${gameId}/landing`);
}

type ScheduleLookup = Map<string, any>;

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function resolvePlayerIdFromTeam(team: string, playerName: string) {
  const roster = await getTeamRoster(team);
  const target = normalizeName(playerName);
  const match = roster.find((player: any) => {
    const fullName = normalizeName(`${player.firstName?.default || ""} ${player.lastName?.default || ""}`.trim());
    return fullName === target;
  });
  return match?.id ? Number(match.id) : null;
}

function getPlayerName(landing: any) {
  return `${landing?.firstName?.default || ""} ${landing?.lastName?.default || ""}`.trim() || "Player";
}

function getTeamAbbrev(landing: any) {
  return landing?.teamAbbrev?.default || landing?.teamAbbrev || landing?.currentTeamAbbrev?.default || landing?.currentTeamAbbrev || "";
}

function getPositionCode(landing: any) {
  return landing?.position || landing?.positionCode || "";
}

function getInjuryStatus(landing: any) {
  return landing?.injuryStatus?.description
    || landing?.injuryStatus
    || landing?.rosterStatus
    || landing?.currentRosterStatus
    || null;
}

function buildScore(teamScore?: number, opponentScore?: number) {
  if (typeof teamScore !== "number" || typeof opponentScore !== "number") return "Final";
  return `${teamScore}-${opponentScore}`;
}

function buildResult(teamScore?: number, opponentScore?: number): "W" | "L" | null {
  if (typeof teamScore !== "number" || typeof opponentScore !== "number") return null;
  return teamScore > opponentScore ? "W" : "L";
}

function mapScheduleGame(rawGame: any, fallbackOpponent: string, isHome: boolean): PlayerTrendGame {
  const teamScore = isHome ? rawGame?.homeTeam?.score : rawGame?.awayTeam?.score;
  const opponentScore = isHome ? rawGame?.awayTeam?.score : rawGame?.homeTeam?.score;
  const opponentAbbrev = isHome ? rawGame?.awayTeam?.abbrev : rawGame?.homeTeam?.abbrev;

  return {
    gameId: String(rawGame?.id || rawGame?.gameId || ""),
    date: rawGame?.gameDate || rawGame?.startTimeUTC?.slice(0, 10) || "",
    opponent: opponentAbbrev || fallbackOpponent,
    opponentAbbrev: opponentAbbrev || fallbackOpponent,
    isHome,
    result: buildResult(teamScore, opponentScore),
    score: buildScore(teamScore, opponentScore),
  };
}

async function buildScheduleLookup(teamAbbrevs: string[]): Promise<ScheduleLookup> {
  const lookup: ScheduleLookup = new Map();
  const uniqueTeams = Array.from(new Set(teamAbbrevs.filter(Boolean)));
  const schedules = await Promise.all(uniqueTeams.map(async (team) => {
    try {
      const data = await getClubSchedule(team);
      return Array.isArray(data?.games) ? data.games : [];
    } catch {
      return [];
    }
  }));

  for (const games of schedules) {
    for (const game of games) {
      const key = String(game?.id || "");
      if (!key || lookup.has(key)) continue;
      lookup.set(key, game);
    }
  }

  return lookup;
}

export async function GET(req: Request, context: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const fallbackName = searchParams.get("playerName") || context.params.id.replace(/-/g, " ");
    const fallbackTeam = searchParams.get("team") || "";
    const opponent = searchParams.get("opponent") || "";
    const propType = searchParams.get("propType") || "Points";
    const overUnder = searchParams.get("overUnder") === "Under" ? "Under" : "Over";
    const market = resolvePlayerPropMarket("NHL", propType);
    const numericId = Number(context.params.id);
    const playerId = Number.isFinite(numericId)
      ? numericId
      : fallbackTeam
        ? await resolvePlayerIdFromTeam(fallbackTeam, fallbackName)
        : null;

    if (!playerId) {
      return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
    }

    let oddsComparison: BookOdds[] = [];
    if (market) {
      let oddsEventId = searchParams.get("oddsEventId") || "";

      if (!oddsEventId && fallbackTeam && opponent) {
        const featuredOdds = await getNHLOdds();
        const event = findOddsForGame(featuredOdds, fallbackTeam, opponent);
        oddsEventId = event?.id || "";
      }

      if (oddsEventId) {
        const eventOdds = await getNHLEventOdds(oddsEventId);
        oddsComparison = getAllPlayerPropOdds(eventOdds, market, fallbackName, overUnder);
      }
    }

    const [landing, logs, previousSeasonRaw] = await Promise.all([
      getPlayerLanding(String(playerId)),
      getGameLog(playerId),
      getPlayerSeasonLog(String(playerId), PREVIOUS_SEASON).catch(() => []),
    ]);

    const recentLogs = logs;
    const teamAbbrev = getTeamAbbrev(landing);
    const teamSchedule = teamAbbrev ? await getClubSchedule(teamAbbrev).catch(() => ({ games: [] })) : { games: [] };
    const scheduleLookup = await buildScheduleLookup([
      teamAbbrev,
      ...recentLogs.map((log) => log.teamAbbrev || ""),
    ]);

    const games = await Promise.all(
      recentLogs.map(async (log) => {
        const scheduleGame = scheduleLookup.get(log.gameId);
        const baseGame = scheduleGame ? mapScheduleGame(scheduleGame, log.opponentAbbrev, log.isHome) : null;

        let fallbackGame: PlayerTrendGame | null = baseGame;
        if (!fallbackGame && log.gameId) {
          try {
            const rawGame = await getGamecenterLanding(log.gameId);
            fallbackGame = mapScheduleGame(rawGame, log.opponentAbbrev, log.isHome);
          } catch {
            fallbackGame = null;
          }
        }

        return {
          gameId: log.gameId,
          date: fallbackGame?.date || log.gameDate,
          teamAbbrev: log.teamAbbrev || teamAbbrev,
          opponent: fallbackGame?.opponent || log.opponentAbbrev,
          opponentAbbrev: fallbackGame?.opponentAbbrev || log.opponentAbbrev,
          isHome: log.isHome,
          result: fallbackGame?.result ?? null,
          score: fallbackGame?.score || "Final",
          goals: log.goals,
          assists: log.assists,
          points: log.points,
          shots: log.shots,
          minutes: log.toi,
          minutesPlayed: parseClockMinutes(log.toi),
        } satisfies PlayerTrendGame;
      })
    );

    const previousSeasonGames = previousSeasonRaw.map((log: any) => ({
      gameId: String(log.gameId || log.id || ""),
      date: log.gameDate || "",
      teamAbbrev: log.teamAbbrev?.default || log.teamAbbrev || teamAbbrev,
      opponent: log.opponentAbbrev || log.opponentTeamAbbrev?.default || log.opponentTeamAbbrev || "",
      opponentAbbrev: log.opponentAbbrev || log.opponentTeamAbbrev?.default || log.opponentTeamAbbrev || "",
      isHome: log.homeRoadFlag === "H",
      result: null,
      score: "Final",
      goals: Number(log.goals) || 0,
      assists: Number(log.assists) || 0,
      points: Number(log.points) || 0,
      shots: Number(log.shots) || 0,
      minutes: log.toi || "0:00",
      minutesPlayed: parseClockMinutes(log.toi),
    })) satisfies PlayerTrendGame[];

    const upcomingGame = (Array.isArray(teamSchedule?.games) ? teamSchedule.games : []).find((game: any) => {
      const state = String(game?.gameState || "").toUpperCase();
      return state !== "OFF" && state !== "FINAL";
    });
    const nextGameInfo = upcomingGame
      ? {
          gameId: String(upcomingGame?.id || ""),
          opponent: upcomingGame?.homeTeam?.abbrev === teamAbbrev ? upcomingGame?.awayTeam?.abbrev || "" : upcomingGame?.homeTeam?.abbrev || "",
          team: teamAbbrev,
          isAway: upcomingGame?.awayTeam?.abbrev === teamAbbrev,
          startTimeUTC: upcomingGame?.startTimeUTC,
          display: formatNextGameDisplay(
            teamAbbrev,
            upcomingGame?.homeTeam?.abbrev === teamAbbrev ? upcomingGame?.awayTeam?.abbrev || "" : upcomingGame?.homeTeam?.abbrev || "",
            upcomingGame?.awayTeam?.abbrev === teamAbbrev,
            upcomingGame?.startTimeUTC
          ),
        }
      : null;
    const positionCode = getPositionCode(landing);
    const defenseGrid = await getDefenseGridForPlayer("NHL", (opponent || nextGameInfo?.opponent || "").toUpperCase(), positionCode);

    return NextResponse.json({
      league: "NHL",
      playerId,
      playerName: getPlayerName(landing),
      team: teamAbbrev,
      teamColor: NHL_TEAM_COLORS[teamAbbrev] || "#4a9eff",
      headshot: landing?.headshot || null,
      oddsComparison,
      availableStats: getPlayerResearchStats("NHL"),
      nextGame: nextGameInfo,
      defenseGrid,
      player: {
        position: positionCode,
        positionLabel: POSITION_LABELS[positionCode] || positionCode || "Skater",
        jerseyNumber: landing?.sweaterNumber || null,
        injuryStatus: getInjuryStatus(landing),
      },
      games,
      previousSeasonGames,
    });
  } catch {
    return NextResponse.json({
      league: "NHL",
      availableStats: getPlayerResearchStats("NHL"),
      player: {
        position: "",
        positionLabel: "Skater",
        jerseyNumber: null,
        injuryStatus: null,
      },
      games: [],
      previousSeasonGames: [],
    }, { status: 500 });
  }
}
