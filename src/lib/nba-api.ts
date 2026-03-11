/**
 * NBA API Client
 * Primary source: ESPN hidden API (no key required, server-side only)
 * Fallback: BallDontLie v1 (key: BALLDONTLIE_API_KEY — basic schedule/players only)
 *
 * ⚠️  COMMERCIAL USE WARNING:
 * ESPN's API is NOT licensed for commercial use (ToS prohibits it).
 * This implementation is for development/personal use ONLY.
 *
 * BEFORE MONETIZING — migrate to a licensed data provider:
 *   • MySportsFeeds  — ~$30/mo for NBA, commercial OK, same data shape (easiest migration)
 *   • SportsDataIO   — ~$100+/mo, full official licensed feed
 *   • Sportradar     — Official NBA partner, enterprise pricing
 *
 * Migration path: swap this file only. All exported types + function signatures
 * stay the same. Everything upstream (stats engine, live-data, routes) is unaffected.
 *
 * ESPN endpoints currently used:
 *   Scoreboard:   site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
 *   Game summary: site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=ID
 *   Standings:    site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2025
 */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_BASE_V2 = "https://site.api.espn.com/apis/v2/sports/basketball/nba";
const BDL_BASE = "https://api.balldontlie.io/v1";
const CACHE_TTL = 15 * 60 * 1000;

type CacheEntry<T> = { data: T; timestamp: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(url: string, ttl = CACHE_TTL, headers?: HeadersInit): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.timestamp < ttl) return hit.data as T;
  const res = await fetch(url, { headers, next: { revalidate: Math.round(ttl / 1000) } });
  if (!res.ok) throw new Error(`Fetch error ${res.status}: ${url}`);
  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type NBAGame = {
  id: string;                 // ESPN event id (string)
  date: string;               // YYYY-MM-DD
  status: string;             // "Final" | "In Progress" | "7:30 PM ET"
  statusDetail: string;       // "Final" | "Q4 2:35" | "Halftime"
  homeTeam: { id: string; abbreviation: string; fullName: string; record: string };
  awayTeam: { id: string; abbreviation: string; fullName: string; record: string };
  homeScore: number | null;
  awayScore: number | null;
  spread?: string;            // "CLE -8.5"
  overUnder?: number;         // 224.5
  homeML?: number;            // American odds
  awayML?: number;
};

export type NBAPlayerGameLog = {
  playerId: string;
  playerName: string;
  gameDate: string;
  points: number;
  rebounds: number;
  assists: number;
  threePointersMade: number;
  steals: number;
  blocks: number;
  minutesPlayed: number;
};

export type NBATeamStanding = {
  teamAbbrev: string;
  teamName: string;
  conference: "Eastern" | "Western";
  seed: number;
  wins: number;
  losses: number;
  winPct: number;
  homeRecord: string;   // "34-7"
  roadRecord: string;   // "30-11"
  last10: string;       // "7-3"
  streak: string;       // "L1" | "W3"
  gamesBehind: string;
};

export type NBABoxscorePlayer = {
  id: string;
  name: string;
  teamAbbrev: string;
  position: string;
  minutes: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fieldGoals: string;  // "7-18"
  threePointers: string; // "2-5"
  plusMinus: string;
};

// ── ESPN Scoreboard ──────────────────────────────────────────────────────────

function parseESPNGame(event: any): NBAGame {
  const comp = event.competitions?.[0] ?? {};
  const comps: any[] = comp.competitors ?? [];
  const home = comps.find((c: any) => c.homeAway === "home") ?? comps[0] ?? {};
  const away = comps.find((c: any) => c.homeAway === "away") ?? comps[1] ?? {};

  const status = event.status?.type;
  const statusText = status?.completed ? "Final"
    : status?.state === "in" ? "Live"
    : event.date ? new Date(event.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"
    : "TBD";
  const statusDetail = status?.shortDetail ?? statusText;

  // Odds
  const odds = comp.odds?.[0] ?? {};
  const spread = odds.details as string | undefined;
  const overUnder = odds.overUnder as number | undefined;

  return {
    id: event.id,
    date: event.date ? event.date.slice(0, 10) : "",
    status: statusText,
    statusDetail,
    homeTeam: {
      id: home.team?.id ?? "",
      abbreviation: home.team?.abbreviation ?? "???",
      fullName: home.team?.displayName ?? "",
      record: home.records?.[0]?.summary ?? "",
    },
    awayTeam: {
      id: away.team?.id ?? "",
      abbreviation: away.team?.abbreviation ?? "???",
      fullName: away.team?.displayName ?? "",
      record: away.records?.[0]?.summary ?? "",
    },
    homeScore: home.score != null ? parseInt(home.score) : null,
    awayScore: away.score != null ? parseInt(away.score) : null,
    spread,
    overUnder,
  };
}

export async function getNBASchedule(daysAhead = 2): Promise<NBAGame[]> {
  try {
    const games: NBAGame[] = [];
    const dates: string[] = [];
    for (let i = 0; i <= daysAhead; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    }

    for (const dateStr of dates) {
      const data = await cachedFetch<any>(`${ESPN_BASE}/scoreboard?dates=${dateStr}`);
      const events: any[] = data.events ?? [];
      games.push(...events.map(parseESPNGame));
    }
    return games;
  } catch (err) {
    console.warn("[nba-api] getNBASchedule failed:", err);
    return [];
  }
}

// ── ESPN Standings ────────────────────────────────────────────────────────────

export async function getNBAStandings(): Promise<NBATeamStanding[]> {
  try {
    const data = await cachedFetch<any>(`${ESPN_BASE_V2}/standings?season=2025`, 30 * 60 * 1000);
    const results: NBATeamStanding[] = [];

    for (const conf of (data.children ?? [])) {
      const confName: "Eastern" | "Western" = conf.name?.includes("Eastern") ? "Eastern" : "Western";
      const entries: any[] = conf.standings?.entries ?? [];

      for (const entry of entries) {
        const statsArr: any[] = entry.stats ?? [];
        const s = Object.fromEntries(statsArr.map((x: any) => [x.name, x.displayValue ?? x.value]));
        results.push({
          teamAbbrev: entry.team?.abbreviation ?? "",
          teamName: entry.team?.displayName ?? "",
          conference: confName,
          seed: parseInt(s["playoffSeed"] ?? "0") || 0,
          wins: parseInt(s["wins"] ?? "0") || 0,
          losses: parseInt(s["losses"] ?? "0") || 0,
          winPct: parseFloat(s["winPercent"]?.replace(".","0.") ?? "0") || 0,
          homeRecord: s["Home"] ?? "0-0",
          roadRecord: s["Road"] ?? "0-0",
          last10: s["Last Ten Games"] ?? "—",
          streak: s["streak"] ?? "—",
          gamesBehind: s["gamesBehind"] ?? "—",
        });
      }
    }
    return results.sort((a, b) => a.seed - b.seed || b.wins - a.wins);
  } catch (err) {
    console.warn("[nba-api] getNBAStandings failed:", err);
    return [];
  }
}

// ── ESPN Game Summary (boxscore + player stats) ───────────────────────────────

export async function getNBABoxscore(eventId: string): Promise<{ home: NBABoxscorePlayer[]; away: NBABoxscorePlayer[] }> {
  try {
    const data = await cachedFetch<any>(`${ESPN_BASE}/summary?event=${eventId}`);
    const teams: any[] = data.boxscore?.players ?? [];
    const result = { home: [] as NBABoxscorePlayer[], away: [] as NBABoxscorePlayer[] };

    for (const team of teams) {
      const abbrev = team.team?.abbreviation ?? "";
      const isHome = team.homeAway === "home";
      const statsGroup: any = team.statistics?.[0] ?? {};
      const labels: string[] = statsGroup.labels ?? [];
      const athletes: any[] = statsGroup.athletes ?? [];

      const getIdx = (label: string) => labels.indexOf(label);
      const ptIdx = getIdx("PTS");
      const rebIdx = getIdx("REB");
      const astIdx = getIdx("AST");
      const stlIdx = getIdx("STL");
      const blkIdx = getIdx("BLK");
      const fgIdx = getIdx("FG");
      const tpIdx = getIdx("3PT");
      const minIdx = getIdx("MIN");
      const pmIdx = getIdx("+/-");

      for (const a of athletes) {
        const stats: string[] = a.stats ?? [];
        if (!stats.length) continue;
        const player: NBABoxscorePlayer = {
          id: a.athlete?.id ?? "",
          name: a.athlete?.displayName ?? "",
          teamAbbrev: abbrev,
          position: a.athlete?.position?.abbreviation ?? "",
          minutes: minIdx >= 0 ? stats[minIdx] : "0",
          points: ptIdx >= 0 ? parseInt(stats[ptIdx]) || 0 : 0,
          rebounds: rebIdx >= 0 ? parseInt(stats[rebIdx]) || 0 : 0,
          assists: astIdx >= 0 ? parseInt(stats[astIdx]) || 0 : 0,
          steals: stlIdx >= 0 ? parseInt(stats[stlIdx]) || 0 : 0,
          blocks: blkIdx >= 0 ? parseInt(stats[blkIdx]) || 0 : 0,
          fieldGoals: fgIdx >= 0 ? stats[fgIdx] : "0-0",
          threePointers: tpIdx >= 0 ? stats[tpIdx] : "0-0",
          plusMinus: pmIdx >= 0 ? stats[pmIdx] : "0",
        };
        if (isHome) result.home.push(player);
        else result.away.push(player);
      }
    }
    return result;
  } catch (err) {
    console.warn("[nba-api] getNBABoxscore failed:", err);
    return { home: [], away: [] };
  }
}

// ── Player game log (derived from recent boxscores) ───────────────────────────

export async function getNBAPlayerGameLog(playerName: string, teamAbbrev: string, recentGames: NBAGame[]): Promise<NBAPlayerGameLog[]> {
  const logs: NBAPlayerGameLog[] = [];
  const completedGames = recentGames
    .filter((g) => g.status === "Final" && (g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev))
    .slice(0, 10);

  for (const game of completedGames) {
    try {
      const boxscore = await getNBABoxscore(game.id);
      const isHome = game.homeTeam.abbreviation === teamAbbrev;
      const players = isHome ? boxscore.home : boxscore.away;
      const player = players.find((p) =>
        p.name.toLowerCase().includes(playerName.split(" ").pop()?.toLowerCase() ?? "")
      );
      if (player && player.points > 0) {
        const mins = parseFloat(player.minutes) || 0;
        if (mins < 15) continue; // skip DNP/garbage time
        logs.push({
          playerId: player.id,
          playerName: player.name,
          gameDate: game.date,
          points: player.points,
          rebounds: player.rebounds,
          assists: player.assists,
          threePointersMade: parseInt(player.threePointers.split("-")[0]) || 0,
          steals: player.steals,
          blocks: player.blocks,
          minutesPlayed: mins,
        });
      }
    } catch {
      // skip failed game
    }
  }
  return logs;
}

// ── Team roster from BallDontLie (basic, no stats) ───────────────────────────

export async function getNBATeamRoster(teamId: number): Promise<Array<{ id: number; name: string; position: string }>> {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) return [];
  try {
    const data = await cachedFetch<any>(
      `${BDL_BASE}/players?team_ids[]=${teamId}&per_page=30`,
      60 * 60 * 1000,
      { Authorization: key }
    );
    return (data.data ?? []).map((p: any) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      position: p.position ?? "",
    }));
  } catch {
    return [];
  }
}

// ── ESPN team ID mapping ──────────────────────────────────────────────────────
// Maps our abbreviations to ESPN team IDs (for roster/stats lookups)
export const ESPN_TEAM_IDS: Record<string, string> = {
  ATL: "1", BOS: "2", BKN: "17", CHA: "30", CHI: "4", CLE: "5",
  DAL: "6", DEN: "7", DET: "8", GSW: "9", HOU: "10", IND: "11",
  LAC: "12", LAL: "13", MEM: "29", MIA: "14", MIL: "15", MIN: "16",
  NOP: "3", NYK: "18", OKC: "25", ORL: "19", PHI: "20", PHX: "21",
  POR: "22", SAC: "23", SAS: "24", TOR: "28", UTA: "26", WAS: "27",
};

// ── Team colors ───────────────────────────────────────────────────────────────
export const NBA_TEAM_COLORS: Record<string, string> = {
  ATL: "#E03A3E", BOS: "#007A33", BKN: "#000000", CHA: "#1D1160", CHI: "#CE1141",
  CLE: "#860038", DAL: "#00538C", DEN: "#0E2240", DET: "#C8102E", GSW: "#1D428A",
  HOU: "#CE1141", IND: "#002D62", LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9",
  MIA: "#98002E", MIL: "#00471B", MIN: "#0C2340", NOP: "#0C2340", NYK: "#006BB6",
  OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#1D1160", POR: "#E03A3E",
  SAC: "#5A2D81", SAS: "#C4CED4", TOR: "#CE1141", UTA: "#002B5C", WAS: "#002B5C",
};

// ── Recent completed games (last N days) — used by stats engine ───────────────
export async function getRecentNBAGames(daysBack = 10): Promise<NBAGame[]> {
  const cacheKey = `recent-games-${daysBack}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) return hit.data as NBAGame[];

  const games: NBAGame[] = [];
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const data = await cachedFetch<any>(`${ESPN_BASE}/scoreboard?dates=${dateStr}`, CACHE_TTL);
      const events: any[] = data.events ?? [];
      const completed = events
        .filter((e) => e.status?.type?.completed)
        .map(parseESPNGame);
      games.push(...completed);
    } catch { /* skip day */ }
    if (games.length >= 40) break;
  }

  cache.set(cacheKey, { data: games, timestamp: Date.now() });
  return games;
}
