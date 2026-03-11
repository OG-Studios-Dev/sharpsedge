import { NHLGame, ScheduleResponse } from "./types";

const NHL_BASE = "https://api-web.nhle.com/v1";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

type CacheEntry<T> = { data: T; timestamp: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(url: string, ttl: number = CACHE_TTL): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }
  const revalidate = Math.round(ttl / 1000);
  const res = await fetch(url, { next: { revalidate } });
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
      .filter((g: any) => g.gameState !== "OFF")
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

// Returns recent + upcoming games including completed ones — used for Trends (always has data)
export async function getBroadSchedule(days: number = 4): Promise<ScheduleResponse> {
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

export type TeamStandingRow = {
  teamAbbrev: string;
  teamName: string;
  homeWins: number;
  homeLosses: number;
  homeOtLosses: number;
  roadWins: number;
  roadLosses: number;
  roadOtLosses: number;
  streakCode: string; // e.g. "W3", "L2"
  points: number;
  gamesPlayed: number;
  winPct: number;
  goalsFor: number;
  goalsAgainst: number;
  logo?: string;
};

export async function getTeamStandings(): Promise<TeamStandingRow[]> {
  try {
    const data = await cachedFetch<any>(`${NHL_BASE}/standings/now`);
    const standings = data.standings || [];
    return standings.map((t: any) => ({
      teamAbbrev: t.teamAbbrev?.default || t.teamAbbrev || "",
      teamName: t.teamName?.default || t.teamCommonName?.default || "",
      homeWins: t.homeWins ?? 0,
      homeLosses: t.homeLosses ?? 0,
      homeOtLosses: t.homeOtLosses ?? 0,
      roadWins: t.roadWins ?? 0,
      roadLosses: t.roadLosses ?? 0,
      roadOtLosses: t.roadOtLosses ?? 0,
      streakCode: t.streakCode || "",
      points: t.points ?? 0,
      gamesPlayed: t.gamesPlayed ?? 0,
      winPct: t.winPctg ?? 0,
      goalsFor: t.goalFor ?? 0,
      goalsAgainst: t.goalAgainst ?? 0,
      logo: t.teamLogo || "",
    }));
  } catch {
    return [];
  }
}

export type TeamRecentGame = {
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  win: boolean;
  period1GoalsFor: number;
  period1GoalsAgainst: number;
  scoredFirst: boolean;
};

export async function getTeamRecentGames(teamAbbrev: string): Promise<TeamRecentGame[]> {
  try {
    const data = await cachedFetch<{ games?: any[] }>(
      `${NHL_BASE}/club-schedule-season/${teamAbbrev}/20252026`
    );
    const allGames = data.games || [];
    const completed = allGames.filter((g: any) => g.gameState === "OFF");
    const last10 = completed.slice(-10);

    return last10.map((g: any) => {
      const isHome = g.homeTeam?.abbrev === teamAbbrev;
      const goalsFor = isHome ? (g.homeTeam?.score ?? 0) : (g.awayTeam?.score ?? 0);
      const goalsAgainst = isHome ? (g.awayTeam?.score ?? 0) : (g.homeTeam?.score ?? 0);
      const win = goalsFor > goalsAgainst;

      // TODO: NHL club-schedule-season endpoint doesn't include period-level scoring.
      // Period 1 goals and scoredFirst are approximated as 0/false for now.
      const period1GoalsFor = 0;
      const period1GoalsAgainst = 0;
      const scoredFirst = false;

      return { isHome, goalsFor, goalsAgainst, win, period1GoalsFor, period1GoalsAgainst, scoredFirst };
    });
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Starting goalie data
// ──────────────────────────────────────────────────────────────────────

export type GoalieStarter = {
  playerId: number;
  name: string;
  status: "confirmed" | "probable" | "unconfirmed";
  team: string;
  wins: number;
  losses: number;
  otLosses: number;
  savePct: number;
  gaa: number;
  isBackup: boolean;
};

export type GameGoalies = {
  gameId: number;
  home: GoalieStarter | null;
  away: GoalieStarter | null;
};

function parseGoalieFromMatchup(player: any, team: string): GoalieStarter | null {
  if (!player) return null;
  const seasonStats = player.seasonStats || {};
  const wins = seasonStats.wins ?? 0;
  const losses = seasonStats.losses ?? 0;
  const otLosses = seasonStats.otLosses ?? 0;
  return {
    playerId: player.playerId ?? 0,
    name: `${player.firstName?.default || ""} ${player.lastName?.default || ""}`.trim(),
    status: "probable",
    team,
    wins,
    losses,
    otLosses,
    savePct: seasonStats.savePctg ?? 0,
    gaa: seasonStats.goalsAgainstAvg ?? 0,
    isBackup: wins + losses + otLosses < 10,
  };
}

function parseGoalieFromBoxscore(goalies: any[], team: string): GoalieStarter | null {
  if (!goalies?.length) return null;
  // Starting goalie: has toi > "00:00" or has a decision field
  const starter = goalies.find((g: any) => g.decision) || goalies.find((g: any) => g.toi && g.toi !== "00:00") || goalies[0];
  if (!starter) return null;
  return {
    playerId: starter.playerId ?? 0,
    name: `${starter.firstName?.default || starter.name?.default || ""} ${starter.lastName?.default || ""}`.trim(),
    status: starter.decision ? "confirmed" : "probable",
    team,
    wins: starter.wins ?? 0,
    losses: starter.losses ?? 0,
    otLosses: starter.otLosses ?? 0,
    savePct: starter.savePctg ?? starter.savePct ?? 0,
    gaa: starter.goalsAgainstAvg ?? starter.gaa ?? 0,
    isBackup: (starter.wins ?? 0) + (starter.losses ?? 0) + (starter.otLosses ?? 0) < 10,
  };
}

export async function getGameGoalies(gameId: number): Promise<GameGoalies> {
  const GOALIE_TTL = 5 * 60 * 1000; // 5 minutes
  const empty: GameGoalies = { gameId, home: null, away: null };

  try {
    // Try landing endpoint first (works for pre-game and live)
    const landing = await cachedFetch<any>(`${NHL_BASE}/gamecenter/${gameId}/landing`, GOALIE_TTL);

    let home: GoalieStarter | null = null;
    let away: GoalieStarter | null = null;
    const homeAbbrev = landing.homeTeam?.abbrev || "";
    const awayAbbrev = landing.awayTeam?.abbrev || "";

    // Try matchup goalie comparison (pre-game)
    const gc = landing.matchup?.goalieComparison;
    if (gc) {
      const homePlayers = gc.homeTeam?.players;
      const awayPlayers = gc.awayTeam?.players;
      if (homePlayers?.length) home = parseGoalieFromMatchup(homePlayers[0], homeAbbrev);
      if (awayPlayers?.length) away = parseGoalieFromMatchup(awayPlayers[0], awayAbbrev);
    }

    // Try boxscore for live/completed games (overrides matchup data with confirmed info)
    try {
      const boxscore = await cachedFetch<any>(`${NHL_BASE}/gamecenter/${gameId}/boxscore`, GOALIE_TTL);
      const pgs = boxscore.playerByGameStats;
      if (pgs) {
        const homeBox = parseGoalieFromBoxscore(pgs.homeTeam?.goalies, homeAbbrev);
        const awayBox = parseGoalieFromBoxscore(pgs.awayTeam?.goalies, awayAbbrev);
        if (homeBox) home = homeBox;
        if (awayBox) away = awayBox;
      }
    } catch {
      // Boxscore not available yet (pre-game) — use matchup data
    }

    return { gameId, home, away };
  } catch {
    return empty;
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
