import { NHLGame, ScheduleResponse } from "./types";

const NHL_BASE = "https://api-web.nhle.com/v1";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

type CacheEntry<T> = { data: T; timestamp: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`NHL API error: ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function mapGame(g: any): NHLGame {
  return {
    id: g.id,
    startTimeUTC: g.startTimeUTC,
    gameState: g.gameState,
    awayTeam: {
      abbrev: g.awayTeam?.abbrev || "???",
      name: g.awayTeam?.placeName?.default,
      score: g.awayTeam?.score,
      logo: g.awayTeam?.logo,
    },
    homeTeam: {
      abbrev: g.homeTeam?.abbrev || "???",
      name: g.homeTeam?.placeName?.default,
      score: g.homeTeam?.score,
      logo: g.homeTeam?.logo,
    },
  };
}

export async function getTodaySchedule(): Promise<ScheduleResponse> {
  try {
    const data = await cachedFetch<any>(`${NHL_BASE}/schedule/now`);
    const gameWeek = data.gameWeek || [];
    const today = gameWeek[0];
    if (!today) return { games: [], date: new Date().toISOString().slice(0, 10) };

    const games: NHLGame[] = (today.games || []).map(mapGame);

    return { games, date: today.date };
  } catch {
    return { games: [], date: new Date().toISOString().slice(0, 10) };
  }
}

export async function getUpcomingSchedule(days: number = 3): Promise<ScheduleResponse> {
  try {
    const data = await cachedFetch<any>(`${NHL_BASE}/schedule/now`);
    const gameWeek = Array.isArray(data.gameWeek) ? data.gameWeek.slice(0, days) : [];
    const games: NHLGame[] = gameWeek
      .flatMap((day: any) => day.games || [])
      .map(mapGame)
      .sort((a: NHLGame, b: NHLGame) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime());

    return {
      games,
      date: gameWeek[0]?.date || new Date().toISOString().slice(0, 10),
    };
  } catch {
    return { games: [], date: new Date().toISOString().slice(0, 10) };
  }
}

export async function getPlayerGameLog(
  playerId: number,
  season: string = "20252026"
): Promise<any[]> {
  try {
    const data = await cachedFetch<any>(
      `${NHL_BASE}/player/${playerId}/game-log/${season}/2`
    );
    return data.gameLog || [];
  } catch {
    return [];
  }
}

export async function getTeamRoster(teamAbbrev: string): Promise<any[]> {
  try {
    const data = await cachedFetch<any>(
      `${NHL_BASE}/roster/${teamAbbrev}/current`
    );
    const forwards = data.forwards || [];
    const defensemen = data.defensemen || [];
    const goalies = data.goalies || [];
    return [...forwards, ...defensemen, ...goalies];
  } catch {
    return [];
  }
}

// NHL team colors for rendering
export const NHL_TEAM_COLORS: Record<string, string> = {
  ANA: "#F47A38", ARI: "#8C2633", BOS: "#FFB81C", BUF: "#002654",
  CGY: "#D2001C", CAR: "#CC0000", CHI: "#CF0A2C", COL: "#6F263D",
  CBJ: "#002654", DAL: "#006847", DET: "#CE1126", EDM: "#041E42",
  FLA: "#041E42", LAK: "#111111", MIN: "#154734", MTL: "#AF1E2D",
  NSH: "#FFB81C", NJD: "#CE1126", NYI: "#00539B", NYR: "#0038A8",
  OTT: "#C52032", PHI: "#F74902", PIT: "#FCB514", SEA: "#99D9D9",
  SJS: "#006D75", STL: "#002F87", TBL: "#002868", TOR: "#00205B",
  UTA: "#69B3E7", VAN: "#00205B", VGK: "#B4975A", WPG: "#041E42",
  WSH: "#C8102E",
};
