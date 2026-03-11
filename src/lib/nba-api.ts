/**
 * NBA API Client
 * Uses BallDontLie API (v1) for schedule, player stats, rosters, and standings.
 * Falls back gracefully when API key is missing.
 */

const BDL_BASE = "https://api.balldontlie.io/v1";
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

type CacheEntry<T> = { data: T; timestamp: number };
const cache = new Map<string, CacheEntry<unknown>>();

function getHeaders(): HeadersInit {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (key) return { Authorization: key };
  return {};
}

async function cachedFetch<T>(url: string, ttl: number = CACHE_TTL): Promise<T> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }
  const res = await fetch(url, {
    headers: getHeaders(),
    next: { revalidate: Math.round(ttl / 1000) },
  });
  if (!res.ok) throw new Error(`BallDontLie API error: ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type NBAGame = {
  id: number;
  date: string;
  status: string;
  homeTeam: { id: number; abbreviation: string; full_name: string };
  awayTeam: { id: number; abbreviation: string; full_name: string };
  homeScore: number | null;
  awayScore: number | null;
};

export type NBAPlayerGameLog = {
  playerId: number;
  playerName: string;
  gameDate: string;
  points: number;
  rebounds: number;
  assists: number;
  threePointersMade: number;
  steals: number;
  blocks: number;
  minutesPlayed: string;
};

export type NBATeamStanding = {
  teamAbbrev: string;
  teamName: string;
  wins: number;
  losses: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  winPct: number;
  streak: string;
};

// ──────────────────────────────────────────────────────────────────────
// Helper: format date as YYYY-MM-DD
// ──────────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapGame(g: any): NBAGame {
  return {
    id: g.id,
    date: g.date ? g.date.slice(0, 10) : "",
    status: g.status || "Final",
    homeTeam: {
      id: g.home_team?.id ?? 0,
      abbreviation: g.home_team?.abbreviation || "???",
      full_name: g.home_team?.full_name || "",
    },
    awayTeam: {
      id: g.visitor_team?.id ?? g.away_team?.id ?? 0,
      abbreviation: g.visitor_team?.abbreviation || g.away_team?.abbreviation || "???",
      full_name: g.visitor_team?.full_name || g.away_team?.full_name || "",
    },
    homeScore: g.home_team_score ?? null,
    awayScore: g.visitor_team_score ?? g.away_team_score ?? null,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Schedule: today + tomorrow
// ──────────────────────────────────────────────────────────────────────

export async function getNBASchedule(): Promise<NBAGame[]> {
  try {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const d1 = formatDate(today);
    const d2 = formatDate(tomorrow);

    const data = await cachedFetch<any>(
      `${BDL_BASE}/games?dates[]=${d1}&dates[]=${d2}&per_page=100`
    );
    return (data.data || []).map(mapGame);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Player game log: last 15 games for a player in the current season
// ──────────────────────────────────────────────────────────────────────

export async function getNBAPlayerGameLog(playerId: number): Promise<NBAPlayerGameLog[]> {
  try {
    const data = await cachedFetch<any>(
      `${BDL_BASE}/stats?player_ids[]=${playerId}&per_page=15&seasons[]=2025&sort=-game.date`
    );
    return (data.data || []).map((s: any) => ({
      playerId: s.player?.id ?? playerId,
      playerName: `${s.player?.first_name || ""} ${s.player?.last_name || ""}`.trim(),
      gameDate: s.game?.date?.slice(0, 10) || "",
      points: s.pts ?? 0,
      rebounds: s.reb ?? 0,
      assists: s.ast ?? 0,
      threePointersMade: s.fg3m ?? 0,
      steals: s.stl ?? 0,
      blocks: s.blk ?? 0,
      minutesPlayed: s.min || "0:00",
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Team roster
// ──────────────────────────────────────────────────────────────────────

export async function getNBATeamRoster(
  teamId: number
): Promise<Array<{ id: number; name: string; position: string }>> {
  try {
    const data = await cachedFetch<any>(
      `${BDL_BASE}/players?team_ids[]=${teamId}&per_page=100`
    );
    return (data.data || []).map((p: any) => ({
      id: p.id,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      position: p.position || "",
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Standings — BallDontLie free tier does not expose a standings endpoint.
// We derive standings from season averages if possible, otherwise return [].
// TODO: Integrate a standings source when available.
// ──────────────────────────────────────────────────────────────────────

export async function getNBAStandings(): Promise<NBATeamStanding[]> {
  // BallDontLie v1 does not have a standings endpoint in the free tier.
  // Use the /games endpoint to derive W/L records from completed games.
  try {
    // Fetch a large batch of completed games from the current season
    const data = await cachedFetch<any>(
      `${BDL_BASE}/games?seasons[]=2025&per_page=100&page=1`,
      30 * 60 * 1000 // 30-min cache for standings derivation
    );
    const allGames: any[] = data.data || [];

    // Build team records from completed games
    const teamMap = new Map<string, {
      teamName: string;
      wins: number; losses: number;
      homeWins: number; homeLosses: number;
      awayWins: number; awayLosses: number;
      streak: string; lastResults: string[];
    }>();

    const ensureTeam = (abbrev: string, name: string) => {
      if (!teamMap.has(abbrev)) {
        teamMap.set(abbrev, {
          teamName: name,
          wins: 0, losses: 0,
          homeWins: 0, homeLosses: 0,
          awayWins: 0, awayLosses: 0,
          streak: "", lastResults: [],
        });
      }
    };

    for (const g of allGames) {
      if (g.status !== "Final") continue;
      const homeAbbrev = g.home_team?.abbreviation;
      const awayAbbrev = g.visitor_team?.abbreviation || g.away_team?.abbreviation;
      if (!homeAbbrev || !awayAbbrev) continue;

      ensureTeam(homeAbbrev, g.home_team?.full_name || homeAbbrev);
      ensureTeam(awayAbbrev, g.visitor_team?.full_name || g.away_team?.full_name || awayAbbrev);

      const homeScore = g.home_team_score ?? 0;
      const awayScore = g.visitor_team_score ?? g.away_team_score ?? 0;
      const homeWin = homeScore > awayScore;

      const home = teamMap.get(homeAbbrev)!;
      const away = teamMap.get(awayAbbrev)!;

      if (homeWin) {
        home.wins++; home.homeWins++;
        away.losses++; away.awayLosses++;
        home.lastResults.push("W");
        away.lastResults.push("L");
      } else {
        away.wins++; away.awayWins++;
        home.losses++; home.homeLosses++;
        away.lastResults.push("W");
        home.lastResults.push("L");
      }
    }

    // Compute streaks
    teamMap.forEach((team) => {
      const results = team.lastResults;
      if (!results.length) { team.streak = ""; return; }
      const last = results[results.length - 1];
      let count = 0;
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i] === last) count++;
        else break;
      }
      team.streak = `${last}${count}`;
    });

    const standings: NBATeamStanding[] = [];
    teamMap.forEach((t, abbrev) => {
      const total = t.wins + t.losses;
      standings.push({
        teamAbbrev: abbrev,
        teamName: t.teamName,
        wins: t.wins,
        losses: t.losses,
        homeWins: t.homeWins,
        homeLosses: t.homeLosses,
        awayWins: t.awayWins,
        awayLosses: t.awayLosses,
        winPct: total > 0 ? t.wins / total : 0,
        streak: t.streak,
      });
    });

    return standings.sort((a, b) => b.winPct - a.winPct);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// NBA Team Colors (official primary colors)
// ──────────────────────────────────────────────────────────────────────

export const NBA_TEAM_COLORS: Record<string, string> = {
  ATL: "#E03A3E", // Hawks
  BOS: "#007A33", // Celtics
  BKN: "#000000", // Nets
  CHA: "#1D1160", // Hornets
  CHI: "#CE1141", // Bulls
  CLE: "#860038", // Cavaliers
  DAL: "#00538C", // Mavericks
  DEN: "#0E2240", // Nuggets
  DET: "#C8102E", // Pistons
  GSW: "#1D428A", // Warriors
  HOU: "#CE1141", // Rockets
  IND: "#002D62", // Pacers
  LAC: "#C8102E", // Clippers
  LAL: "#552583", // Lakers
  MEM: "#5D76A9", // Grizzlies
  MIA: "#98002E", // Heat
  MIL: "#00471B", // Bucks
  MIN: "#0C2340", // Timberwolves
  NOP: "#0C2340", // Pelicans
  NYK: "#006BB6", // Knicks
  OKC: "#007AC1", // Thunder
  ORL: "#0077C0", // Magic
  PHI: "#006BB6", // 76ers
  PHX: "#1D1160", // Suns
  POR: "#E03A3E", // Trail Blazers
  SAC: "#5A2D81", // Kings
  SAS: "#C4CED4", // Spurs
  TOR: "#CE1141", // Raptors
  UTA: "#002B5C", // Jazz
  WAS: "#002B5C", // Wizards
};
