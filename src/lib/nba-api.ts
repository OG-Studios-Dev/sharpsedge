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

import { BookOddsBySide } from "@/lib/types";
import { getDateKey, getDateKeyWithOffset, NBA_TIME_ZONE } from "@/lib/date-utils";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const ESPN_BASE_V2 = "https://site.web.api.espn.com/apis/v2/sports/basketball/nba";
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
  status: string;             // "Final" | "Live" | "7:30 PM ET"
  statusDetail: string;       // "Final" | "Q4 2:35" | "Halftime"
  oddsEventId?: string;
  homeTeam: { id: string; abbreviation: string; fullName: string; record: string };
  awayTeam: { id: string; abbreviation: string; fullName: string; record: string };
  homeScore: number | null;
  awayScore: number | null;
  spread?: string;            // "CLE -8.5"
  overUnder?: number;         // 224.5
  homeML?: number;            // American odds
  awayML?: number;
  bestMoneyline?: {
    home?: { odds: number; book: string } | null;
    away?: { odds: number; book: string } | null;
  };
  moneylineBookOdds?: BookOddsBySide;
};

export type NBAPlayerGameLog = {
  playerId: string;
  playerName: string;
  team: string;
  position?: string;
  jersey?: string;
  headshot?: string | null;
  gameId: string;
  gameDate: string;
  opponent: string;
  opponentAbbrev: string;
  isHome: boolean;
  result: "W" | "L" | null;
  score: string;
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
  jersey?: string;
  headshot?: string | null;
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

export type NBARosterPlayer = {
  id: number;
  name: string;
  position: string;
  jersey?: string;
  headshot?: string | null;
  injuryStatus?: string | null;
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

  // Odds (from ESPN embedded DraftKings data — free, no API key)
  const oddsData = comp.odds?.[0] ?? {};
  const spread = oddsData.details as string | undefined;
  const overUnder = oddsData.overUnder as number | undefined;
  const espnHomeML = oddsData.homeTeamOdds?.moneyLine as number | undefined;
  const espnAwayML = oddsData.awayTeamOdds?.moneyLine as number | undefined;
  const espnBook = oddsData.provider?.name as string | undefined;

  return {
    id: event.id,
    date: event.date ? getDateKey(new Date(event.date), NBA_TIME_ZONE) : "",
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
    homeML: espnHomeML,
    awayML: espnAwayML,
    // ESPN embeds DraftKings odds — use as fallback when Odds API quota exhausted
    bestMoneyline: (espnHomeML || espnAwayML) ? {
      home: espnHomeML ? { odds: espnHomeML, book: espnBook || "DraftKings" } : null,
      away: espnAwayML ? { odds: espnAwayML, book: espnBook || "DraftKings" } : null,
    } : undefined,
  };
}

export async function getNBASchedule(daysAhead = 2): Promise<NBAGame[]> {
  try {
    const games: NBAGame[] = [];
    const dates: string[] = [];
    for (let i = 0; i <= daysAhead; i++) {
      dates.push(getDateKeyWithOffset(i, NBA_TIME_ZONE).replace(/-/g, ""));
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

export function parseNBARecord(record: string): { wins: number; losses: number } {
  const [wins, losses] = String(record || "0-0").split("-").map((value) => parseInt(value, 10));
  return {
    wins: Number.isFinite(wins) ? wins : 0,
    losses: Number.isFinite(losses) ? losses : 0,
  };
}

function parseWinPct(value: unknown): number {
  const raw = String(value ?? "0").trim();
  if (!raw) return 0;
  if (raw.startsWith(".")) return Number(`0${raw}`) || 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1 ? parsed / 100 : parsed;
}

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
          winPct: parseWinPct(s["winPercent"]),
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

export async function getNBAGameSummary(eventId: string): Promise<any | null> {
  try {
    return await cachedFetch<any>(`${ESPN_BASE}/summary?event=${eventId}`);
  } catch (err) {
    console.warn("[nba-api] getNBAGameSummary failed:", err);
    return null;
  }
}

export async function getNBABoxscore(eventId: string): Promise<{ home: NBABoxscorePlayer[]; away: NBABoxscorePlayer[] }> {
  try {
    const data = await getNBAGameSummary(eventId);
    if (!data) return { home: [], away: [] };
    const teams: any[] = data.boxscore?.players ?? [];
    const result = { home: [] as NBABoxscorePlayer[], away: [] as NBABoxscorePlayer[] };

    // Determine home team from competition data since boxscore.players doesn't have homeAway
    const competitors: any[] = data.header?.competitions?.[0]?.competitors ?? [];
    const homeTeamId = competitors.find((c: any) => c.homeAway === "home")?.team?.abbreviation ?? "";

    for (const team of teams) {
      const abbrev = team.team?.abbreviation ?? "";
      const isHome = abbrev === homeTeamId || team.homeAway === "home";
      const statGroups: any[] = team.statistics ?? [];

      for (const statsGroup of statGroups) {
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
            jersey: a.athlete?.jersey ?? "",
            headshot: a.athlete?.headshot?.href || (a.athlete?.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${a.athlete.id}.png` : null),
            minutes: minIdx >= 0 ? stats[minIdx] : "0",
            points: ptIdx >= 0 ? parseInt(stats[ptIdx], 10) || 0 : 0,
            rebounds: rebIdx >= 0 ? parseInt(stats[rebIdx], 10) || 0 : 0,
            assists: astIdx >= 0 ? parseInt(stats[astIdx], 10) || 0 : 0,
            steals: stlIdx >= 0 ? parseInt(stats[stlIdx], 10) || 0 : 0,
            blocks: blkIdx >= 0 ? parseInt(stats[blkIdx], 10) || 0 : 0,
            fieldGoals: fgIdx >= 0 ? stats[fgIdx] : "0-0",
            threePointers: tpIdx >= 0 ? stats[tpIdx] : "0-0",
            plusMinus: pmIdx >= 0 ? stats[pmIdx] : "0",
          };
          if (isHome) result.home.push(player);
          else result.away.push(player);
        }
      }
    }
    return result;
  } catch (err) {
    console.warn("[nba-api] getNBABoxscore failed:", err);
    return { home: [], away: [] };
  }
}

// ── Player game log (derived from recent boxscores) ───────────────────────────

export async function getNBAPlayerGameLog(
  playerName: string,
  teamAbbrev: string,
  recentGames: NBAGame[],
  limit = 20
): Promise<NBAPlayerGameLog[]> {
  const logs: NBAPlayerGameLog[] = [];
  const completedGames = recentGames
    .filter((g) => g.status === "Final" && (g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev))
    .slice(0, limit * 2);

  for (const game of completedGames) {
    try {
      const boxscore = await getNBABoxscore(game.id);
      const isHome = game.homeTeam.abbreviation === teamAbbrev;
      const players = isHome ? boxscore.home : boxscore.away;
      const player = players.find((p) =>
        p.name.toLowerCase().includes(playerName.split(" ").pop()?.toLowerCase() ?? "")
      );
      if (player) {
        const mins = parseFloat(player.minutes) || 0;
        if (mins < 15) continue; // skip DNP/garbage time
        const teamScore = isHome ? game.homeScore : game.awayScore;
        const opponentScore = isHome ? game.awayScore : game.homeScore;
        logs.push({
          playerId: player.id,
          playerName: player.name,
          team: teamAbbrev,
          position: player.position,
          jersey: player.jersey,
          headshot: player.headshot,
          gameId: game.id,
          gameDate: game.date,
          opponent: isHome ? game.awayTeam.fullName : game.homeTeam.fullName,
          opponentAbbrev: isHome ? game.awayTeam.abbreviation : game.homeTeam.abbreviation,
          isHome,
          result: teamScore != null && opponentScore != null ? (teamScore > opponentScore ? "W" : "L") : null,
          score: teamScore != null && opponentScore != null ? `${teamScore}-${opponentScore}` : "Final",
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
    if (logs.length >= limit) break;
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

export async function getNBATeamRosterEntries(teamAbbrev: string): Promise<NBARosterPlayer[]> {
  const teamId = ESPN_TEAM_IDS[teamAbbrev];
  if (!teamId) return [];

  try {
    const data = await cachedFetch<any>(`${ESPN_BASE}/teams/${teamId}/roster`, 60 * 60 * 1000);
    const raw = Array.isArray(data?.athletes) ? data.athletes : [];

    // ESPN NBA roster returns a flat array of athlete objects (not grouped by position).
    // Each element is either a flat athlete OR a position-group object with an `items` array.
    // We handle both shapes here.
    const athletes: any[] = [];
    for (const entry of raw) {
      if (Array.isArray(entry?.items)) {
        // Old grouped shape: { position, items: [...athletes] }
        for (const a of entry.items) athletes.push(a);
      } else if (entry?.displayName || entry?.fullName) {
        // Flat shape: the entry IS the athlete
        athletes.push(entry);
      }
    }

    return athletes.map((athlete: any) => {
      // Injury status: check injuries[] array first, then status field
      const injuryEntry = Array.isArray(athlete?.injuries) ? athlete.injuries[0] : null;
      const injuryStatus =
        injuryEntry?.status ||
        injuryEntry?.type?.description ||
        injuryEntry?.shortDetail ||
        injuryEntry?.detail ||
        // If status.type !== "active", treat it as an injury note
        (athlete?.status?.type && athlete.status.type !== "active" ? athlete.status.type : null) ||
        null;
      return {
        id: Number(athlete?.id) || 0,
        name: athlete?.displayName || athlete?.fullName || "",
        position: athlete?.position?.abbreviation || athlete?.position?.name || "",
        jersey: athlete?.jersey || "",
        headshot: athlete?.headshot?.href || (athlete?.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${athlete.id}.png` : null),
        injuryStatus,
      };
    }).filter((player: { id: number; name: string }) => player.id && player.name);
  } catch {
    return [];
  }
}

// ── Team ID mappings ──────────────────────────────────────────────────────────
// ESPN IDs are used for ESPN boxscores/summaries. BallDontLie IDs are separate.
export const ESPN_TEAM_IDS: Record<string, string> = {
  ATL: "1", BOS: "2", BKN: "17", CHA: "30", CHI: "4", CLE: "5",
  DAL: "6", DEN: "7", DET: "8", GSW: "9", HOU: "10", IND: "11",
  LAC: "12", LAL: "13", MEM: "29", MIA: "14", MIL: "15", MIN: "16",
  NOP: "3", NYK: "18", OKC: "25", ORL: "19", PHI: "20", PHX: "21",
  POR: "22", SAC: "23", SAS: "24", TOR: "28", UTA: "26", WAS: "27",
};

export const BDL_TEAM_IDS: Record<string, number> = {
  ATL: 1, BOS: 2, BKN: 3, CHA: 4, CHI: 5, CLE: 6,
  DAL: 7, DEN: 8, DET: 9, GSW: 10, HOU: 11, IND: 12,
  LAC: 13, LAL: 14, MEM: 15, MIA: 16, MIL: 17, MIN: 18,
  NOP: 19, NYK: 20, OKC: 21, ORL: 22, PHI: 23, PHX: 24,
  POR: 25, SAC: 26, SAS: 27, TOR: 28, UTA: 29, WAS: 30,
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

  // Fetch all days in parallel for speed
  const dateStrings: string[] = [];
  for (let i = 1; i <= daysBack; i++) {
    dateStrings.push(getDateKeyWithOffset(-i, NBA_TIME_ZONE).replace(/-/g, ""));
  }

  const results = await Promise.all(
    dateStrings.map(async (dateStr) => {
      try {
        const data = await cachedFetch<any>(`${ESPN_BASE}/scoreboard?dates=${dateStr}`, CACHE_TTL);
        const events: any[] = data.events ?? [];
        return events
          .filter((e) => e.status?.type?.completed)
          .map(parseESPNGame);
      } catch {
        return [];
      }
    })
  );

  const games = results.flat().slice(0, 80);
  cache.set(cacheKey, { data: games, timestamp: Date.now() });
  return games;
}

// ESPN embedded odds fallback (DraftKings, no API key needed)
export function parseESPNOdds(event: any): { spread?: string; overUnder?: number; homeML?: number; awayML?: number; book?: string } | null {
  const odds = event?.competitions?.[0]?.odds;
  if (!odds || !Array.isArray(odds) || odds.length === 0) return null;
  const primary = odds[0];
  return {
    spread: primary.details || undefined,
    overUnder: typeof primary.overUnder === "number" ? primary.overUnder : undefined,
    homeML: primary.homeTeamOdds?.moneyLine || undefined,
    awayML: primary.awayTeamOdds?.moneyLine || undefined,
    book: primary.provider?.name || "DraftKings",
  };
}
