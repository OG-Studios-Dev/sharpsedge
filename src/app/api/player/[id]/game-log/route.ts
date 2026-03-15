import { NextResponse } from "next/server";
import { NHL_TEAM_COLORS, getTeamRoster } from "@/lib/nhl-api";
import { getGameLog } from "@/lib/nhl-stats-engine";
import { PlayerTrendGame } from "@/lib/player-trend";

const NHL_BASE = "https://api-web.nhle.com/v1";
const SEASON = "20252026";

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
    const numericId = Number(context.params.id);
    const playerId = Number.isFinite(numericId)
      ? numericId
      : fallbackTeam
        ? await resolvePlayerIdFromTeam(fallbackTeam, fallbackName)
        : null;

    if (!playerId) {
      return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
    }

    const [landing, logs] = await Promise.all([
      getPlayerLanding(String(playerId)),
      getGameLog(playerId),
    ]);

    const recentLogs = logs.slice(0, 20);
    const scheduleLookup = await buildScheduleLookup([
      getTeamAbbrev(landing),
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
        } satisfies PlayerTrendGame;
      })
    );

    return NextResponse.json({
      league: "NHL",
      playerId,
      playerName: getPlayerName(landing),
      team: getTeamAbbrev(landing),
      teamColor: NHL_TEAM_COLORS[getTeamAbbrev(landing)] || "#4a9eff",
      headshot: landing?.headshot || null,
      games,
    });
  } catch {
    return NextResponse.json({
      league: "NHL",
      games: [],
    }, { status: 500 });
  }
}
