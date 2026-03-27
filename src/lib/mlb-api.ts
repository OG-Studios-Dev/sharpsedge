import { MLB_TIME_ZONE, getDateKey, getDateKeyWithOffset } from "@/lib/date-utils";
import { findMLBTeamAbbreviationByName, normalizeMLBTeamAbbrev } from "@/lib/mlb-mappings";
import type { MLBGame } from "@/lib/types";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const CACHE_TTL = 15 * 60 * 1000;
export type { MLBGame };

type CacheEntry<T> = { data: T; timestamp: number };
const cache = new Map<string, CacheEntry<unknown>>();

async function cachedFetch<T>(url: string, ttl = CACHE_TTL): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.timestamp < ttl) {
    return hit.data as T;
  }

  const res = await fetch(url, { next: { revalidate: Math.round(ttl / 1000) } });
  if (!res.ok) {
    throw new Error(`MLB API error ${res.status}: ${url}`);
  }

  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

export type MLBPlayer = {
  id: number;
  name: string;
  team: string;
  position: string;
  jerseyNumber?: string;
  bats?: string;
  throws?: string;
  status?: string;
};

export type MLBBoxscorePlayer = {
  id: string;
  name: string;
  teamAbbrev: string;
  position: string;
  battingOrder?: string;
  isPitcher: boolean;
  isStarter: boolean;
  atBats: number;
  hits: number;
  totalBases: number;
  homeRuns: number;
  rbis: number;
  runs: number;
  stolenBases: number;
  strikeOuts: number;
  inningsPitched: number;
  earnedRuns: number;
  hitsAllowed: number;
  walksAllowed: number;
  pitchCount: number;
  avg?: number | null;
  ops?: number | null;
  era?: number | null;
  whip?: number | null;
};

export type MLBTeamStanding = {
  teamAbbrev: string;
  teamName: string;
  league: "AL" | "NL";
  division: string;
  wins: number;
  losses: number;
  winPct: number;
  gamesBack: string;
  homeRecord: string;
  awayRecord: string;
  runsScored: number;
  runsAllowed: number;
  streak: string;
};

export type MLBPlayerGameLog = {
  playerId: number;
  playerName: string;
  team: string;
  gameId: string;
  gameDate: string;
  opponent: string;
  opponentAbbrev: string;
  isHome: boolean;
  result: "W" | "L" | null;
  score: string;
  statGroup: "hitting" | "pitching";
  atBats: number;
  hits: number;
  totalBases: number;
  homeRuns: number;
  rbis: number;
  runs: number;
  stolenBases: number;
  strikeOuts: number;
  inningsPitched: number;
  earnedRuns: number;
  hitsAllowed: number;
  walksAllowed: number;
  pitchesThrown: number;
};

type TeamInfo = {
  id: number;
  fullName: string;
  color: string;
};

const MLB_TEAM_INFO: Record<string, TeamInfo> = {
  ARI: { id: 109, fullName: "Arizona Diamondbacks", color: "#A71930" },
  ATL: { id: 144, fullName: "Atlanta Braves", color: "#CE1141" },
  BAL: { id: 110, fullName: "Baltimore Orioles", color: "#DF4601" },
  BOS: { id: 111, fullName: "Boston Red Sox", color: "#BD3039" },
  CHC: { id: 112, fullName: "Chicago Cubs", color: "#0E3386" },
  CWS: { id: 145, fullName: "Chicago White Sox", color: "#27251F" },
  CIN: { id: 113, fullName: "Cincinnati Reds", color: "#C6011F" },
  CLE: { id: 114, fullName: "Cleveland Guardians", color: "#0C2340" },
  COL: { id: 115, fullName: "Colorado Rockies", color: "#33006F" },
  DET: { id: 116, fullName: "Detroit Tigers", color: "#0C2340" },
  HOU: { id: 117, fullName: "Houston Astros", color: "#EB6E1F" },
  KC: { id: 118, fullName: "Kansas City Royals", color: "#004687" },
  LAA: { id: 108, fullName: "Los Angeles Angels", color: "#BA0021" },
  LAD: { id: 119, fullName: "Los Angeles Dodgers", color: "#005A9C" },
  MIA: { id: 146, fullName: "Miami Marlins", color: "#00A3E0" },
  MIL: { id: 158, fullName: "Milwaukee Brewers", color: "#12284B" },
  MIN: { id: 142, fullName: "Minnesota Twins", color: "#002B5C" },
  NYM: { id: 121, fullName: "New York Mets", color: "#002D72" },
  NYY: { id: 147, fullName: "New York Yankees", color: "#132448" },
  OAK: { id: 133, fullName: "Athletics", color: "#003831" },
  PHI: { id: 143, fullName: "Philadelphia Phillies", color: "#E81828" },
  PIT: { id: 134, fullName: "Pittsburgh Pirates", color: "#FDB827" },
  SD: { id: 135, fullName: "San Diego Padres", color: "#2F241D" },
  SF: { id: 137, fullName: "San Francisco Giants", color: "#FD5A1E" },
  SEA: { id: 136, fullName: "Seattle Mariners", color: "#0C2C56" },
  STL: { id: 138, fullName: "St. Louis Cardinals", color: "#C41E3A" },
  TB: { id: 139, fullName: "Tampa Bay Rays", color: "#092C5C" },
  TEX: { id: 140, fullName: "Texas Rangers", color: "#003278" },
  TOR: { id: 141, fullName: "Toronto Blue Jays", color: "#134A8E" },
  WSH: { id: 120, fullName: "Washington Nationals", color: "#AB0003" },
};

export const MLB_TEAM_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(MLB_TEAM_INFO).map(([abbrev, info]) => [abbrev, info.color]),
);

export const MLB_TEAM_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(MLB_TEAM_INFO).map(([abbrev, info]) => [abbrev, info.id]),
);

const MLB_TEAM_IDS_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(MLB_TEAM_INFO).map(([abbrev, info]) => [info.id, abbrev]),
);

function getTeamLogo(teamId?: number, abbrev?: string) {
  const resolvedId = teamId ?? MLB_TEAM_IDS[normalizeMLBTeamAbbrev(abbrev || "")];
  if (!resolvedId) return undefined;
  return `https://www.mlbstatic.com/team-logos/team-cap-on-light/${resolvedId}.svg`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFloatOrNull(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRecordString(value: unknown) {
  const wins = toNumber((value as { wins?: number })?.wins);
  const losses = toNumber((value as { losses?: number })?.losses);
  if (wins || losses) return `${wins}-${losses}`;
  return "";
}

function parseInningsPitched(value: unknown) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const [whole, fraction] = raw.split(".");
  const innings = toNumber(whole);
  const outs = toNumber(fraction);
  if (!fraction) return innings;
  return innings + Math.min(outs, 2) / 3;
}

function inferGameStatus(game: any) {
  const abstractState = String(game?.status?.abstractGameState ?? "").toLowerCase();
  const detailedState = String(game?.status?.detailedState ?? "").trim();
  const codedState = String(game?.status?.codedGameState ?? "").trim();
  const gameDate = game?.gameDate;

  if (abstractState === "final" || ["F", "O"].includes(codedState)) {
    return {
      status: "Final",
      statusDetail: detailedState || "Final",
      inning: undefined,
    };
  }

  if (abstractState === "live") {
    const inningState = String(game?.linescore?.inningState ?? "").trim();
    const currentInning = String(game?.linescore?.currentInningOrdinal ?? "").trim();
    const inning = [inningState, currentInning].filter(Boolean).join(" ").trim();
    return {
      status: "Live",
      statusDetail: inning || detailedState || "Live",
      inning: inning || currentInning || undefined,
    };
  }

  const scheduledTime = gameDate
    ? new Date(gameDate).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: MLB_TIME_ZONE,
      }) + " ET"
    : "TBD";

  return {
    status: scheduledTime,
    statusDetail: detailedState || scheduledTime,
    inning: undefined,
  };
}

function parseProbablePitcher(pitcher: any) {
  if (!pitcher?.id && !pitcher?.fullName) return null;

  const stat = pitcher?.stats?.[0]?.splits?.[0]?.stat
    ?? pitcher?.stats?.[0]?.stat
    ?? pitcher?.seasonStats?.pitching
    ?? {};

  return {
    id: String(pitcher.id ?? ""),
    name: pitcher.fullName ?? pitcher.name ?? "",
    hand: pitcher.pitchHand?.code || pitcher.pitchHand?.description || undefined,
    era: parseFloatOrNull(stat.era),
    whip: parseFloatOrNull(stat.whip),
    strikeOuts: toNumber(stat.strikeOuts),
    baseOnBalls: toNumber(stat.baseOnBalls),
    inningsPitched: parseFloatOrNull(stat.inningsPitched),
    wins: toNumber(stat.wins),
    losses: toNumber(stat.losses),
  };
}

function mapGameTeam(side: any) {
  const teamId = toNumber(side?.team?.id);
  const abbrev = normalizeMLBTeamAbbrev(side?.team?.abbreviation || MLB_TEAM_IDS_REVERSE[teamId] || "");
  const fallbackInfo = MLB_TEAM_INFO[abbrev];

  return {
    id: String(teamId || fallbackInfo?.id || ""),
    abbreviation: abbrev,
    fullName: side?.team?.name || fallbackInfo?.fullName || abbrev,
    record: parseRecordString(side?.leagueRecord),
    logo: getTeamLogo(teamId || fallbackInfo?.id, abbrev),
    probablePitcher: parseProbablePitcher(side?.probablePitcher),
  };
}

function parseScheduleGame(game: any): MLBGame {
  const status = inferGameStatus(game);
  const awayTeam = mapGameTeam(game?.teams?.away);
  const homeTeam = mapGameTeam(game?.teams?.home);

  return {
    id: String(game?.gamePk ?? ""),
    date: String(game?.officialDate || game?.gameDate || "").slice(0, 10),
    startTimeUTC: game?.gameDate || "",
    status: status.status,
    statusDetail: status.statusDetail,
    inning: status.inning,
    venue: {
      id: game?.venue?.id != null ? String(game.venue.id) : undefined,
      name: game?.venue?.name || game?.teams?.home?.team?.venue?.name || undefined,
    },
    awayTeam,
    homeTeam,
    awayScore: game?.teams?.away?.score != null ? toNumber(game.teams.away.score) : null,
    homeScore: game?.teams?.home?.score != null ? toNumber(game.teams.home.score) : null,
  };
}

function scheduleUrlForDate(date: string) {
  // Request pitcher season stats alongside probablePitcher so ERA, WHIP, K, BB are available
  return `${MLB_BASE}/schedule?date=${date}&sportId=1&hydrate=team,linescore,probablePitcher(stats(group=[pitching],type=[season]))`;
}

export async function getMLBSchedule(daysAhead = 2): Promise<MLBGame[]> {
  try {
    const results = await Promise.all(
      Array.from({ length: daysAhead + 1 }, (_, index) => {
        const date = getDateKeyWithOffset(index, MLB_TIME_ZONE);
        return cachedFetch<any>(scheduleUrlForDate(date));
      }),
    );

    return results
      .flatMap((payload) => payload?.dates ?? [])
      .flatMap((dateEntry: any) => dateEntry?.games ?? [])
      .map(parseScheduleGame)
      .sort((a: MLBGame, b: MLBGame) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime());
  } catch (error) {
    console.warn("[mlb-api] getMLBSchedule failed:", error);
    return [];
  }
}

export async function getMLBScheduleRange(startDate: string, endDate: string): Promise<MLBGame[]> {
  try {
    const url = `${MLB_BASE}/schedule?startDate=${startDate}&endDate=${endDate}&sportId=1&hydrate=team,linescore,probablePitcher`;
    const data = await cachedFetch<any>(url, 60 * 60 * 1000);
    return (data?.dates ?? [])
      .flatMap((entry: any) => entry?.games ?? [])
      .map(parseScheduleGame)
      .sort((a: MLBGame, b: MLBGame) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime());
  } catch (error) {
    console.warn("[mlb-api] getMLBScheduleRange failed:", error);
    return [];
  }
}

export async function getRecentMLBGames(daysBack = 10): Promise<MLBGame[]> {
  const cacheKey = `mlb-recent-games-${daysBack}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data as MLBGame[];
  }

  try {
    const results = await Promise.all(
      Array.from({ length: daysBack }, (_, index) => {
        const date = getDateKeyWithOffset(-(index + 1), MLB_TIME_ZONE);
        return cachedFetch<any>(scheduleUrlForDate(date));
      }),
    );

    const games = results
      .flatMap((payload) => payload?.dates ?? [])
      .flatMap((dateEntry: any) => dateEntry?.games ?? [])
      .map(parseScheduleGame)
      .filter((game) => game.status === "Final")
      .sort((a: MLBGame, b: MLBGame) => new Date(b.startTimeUTC).getTime() - new Date(a.startTimeUTC).getTime());

    cache.set(cacheKey, { data: games, timestamp: Date.now() });
    return games;
  } catch (error) {
    console.warn("[mlb-api] getRecentMLBGames failed:", error);
    return [];
  }
}

function parseSplitRecord(teamRecord: any, name: string) {
  const match = (teamRecord?.records?.splitRecords ?? []).find((entry: any) => {
    const candidate = String(entry?.type ?? entry?.name ?? "").toLowerCase();
    return candidate === name.toLowerCase();
  });
  const wins = toNumber(match?.wins);
  const losses = toNumber(match?.losses);
  return `${wins}-${losses}`;
}

function parseStreak(teamRecord: any) {
  const type = String(teamRecord?.streak?.streakType ?? "").toUpperCase();
  const number = toNumber(teamRecord?.streak?.streakNumber);
  if (!type || !number) return "—";
  return `${type}${number}`;
}

async function fetchStandings(season: number) {
  const url = `${MLB_BASE}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`;
  return cachedFetch<any>(url, 30 * 60 * 1000);
}

export async function getMLBStandings(season = new Date().getFullYear()): Promise<MLBTeamStanding[]> {
  try {
    let data = await fetchStandings(season);
    let records = Array.isArray(data?.records) ? data.records : [];

    if (records.length === 0 && season > 2000) {
      data = await fetchStandings(season - 1);
      records = Array.isArray(data?.records) ? data.records : [];
    }

    const standings: MLBTeamStanding[] = records.flatMap((record: any) => {
      const division = String(record?.division?.name ?? "");
      const league = String(record?.league?.abbreviation ?? "").toUpperCase() === "NL" ? "NL" : "AL";

      return (record?.teamRecords ?? []).map((teamRecord: any) => {
        const teamId = toNumber(teamRecord?.team?.id);
        const teamAbbrev = normalizeMLBTeamAbbrev(teamRecord?.team?.abbreviation || MLB_TEAM_IDS_REVERSE[teamId] || "");
        const winningPercentage = String(teamRecord?.winningPercentage ?? teamRecord?.winPercentage ?? "0");
        const winPct = winningPercentage.startsWith(".")
          ? Number(`0${winningPercentage}`) || 0
          : Number(winningPercentage) || 0;

        return {
          teamAbbrev,
          teamName: teamRecord?.team?.name || MLB_TEAM_INFO[teamAbbrev]?.fullName || teamAbbrev,
          league,
          division,
          wins: toNumber(teamRecord?.wins),
          losses: toNumber(teamRecord?.losses),
          winPct,
          gamesBack: String(teamRecord?.gamesBack ?? teamRecord?.divisionGamesBack ?? "0"),
          homeRecord: parseSplitRecord(teamRecord, "home"),
          awayRecord: parseSplitRecord(teamRecord, "away"),
          runsScored: toNumber(teamRecord?.runsScored),
          runsAllowed: toNumber(teamRecord?.runsAllowed),
          streak: parseStreak(teamRecord),
        };
      });
    });

    return standings.sort((a: MLBTeamStanding, b: MLBTeamStanding) => (
      a.league.localeCompare(b.league)
      || a.division.localeCompare(b.division)
      || b.wins - a.wins
      || a.losses - b.losses
    ));
  } catch (error) {
    console.warn("[mlb-api] getMLBStandings failed:", error);
    return [];
  }
}

function parseBoxscorePlayer(player: any, teamAbbrev: string): MLBBoxscorePlayer {
  const batting = player?.stats?.batting ?? {};
  const pitching = player?.stats?.pitching ?? {};
  const seasonBatting = player?.seasonStats?.batting ?? {};
  const seasonPitching = player?.seasonStats?.pitching ?? {};
  const inningsPitched = parseInningsPitched(pitching?.inningsPitched);
  const position = player?.position?.abbreviation || player?.allPositions?.[0]?.abbreviation || "";
  const isPitcher = position === "P" || inningsPitched > 0;
  const battingOrder = player?.battingOrder ? String(player.battingOrder) : undefined;

  return {
    id: String(player?.person?.id ?? ""),
    name: player?.person?.fullName ?? "",
    teamAbbrev,
    position,
    battingOrder,
    isPitcher,
    isStarter: Boolean(battingOrder) || inningsPitched >= 4,
    atBats: toNumber(batting?.atBats),
    hits: toNumber(batting?.hits),
    totalBases: toNumber(batting?.totalBases),
    homeRuns: toNumber(batting?.homeRuns),
    rbis: toNumber(batting?.rbi ?? batting?.rbis),
    runs: toNumber(batting?.runs),
    stolenBases: toNumber(batting?.stolenBases),
    strikeOuts: isPitcher ? toNumber(pitching?.strikeOuts) : toNumber(batting?.strikeOuts),
    inningsPitched,
    earnedRuns: toNumber(pitching?.earnedRuns),
    hitsAllowed: toNumber(pitching?.hits),
    walksAllowed: toNumber(pitching?.baseOnBalls),
    pitchCount: toNumber(pitching?.numberOfPitches),
    avg: parseFloatOrNull(seasonBatting?.avg),
    ops: parseFloatOrNull(seasonBatting?.ops),
    era: parseFloatOrNull(seasonPitching?.era),
    whip: parseFloatOrNull(seasonPitching?.whip),
  };
}

export async function getMLBBoxscore(gamePk: string): Promise<{ home: MLBBoxscorePlayer[]; away: MLBBoxscorePlayer[] }> {
  try {
    const data = await cachedFetch<any>(`${MLB_BASE}/game/${gamePk}/boxscore`);
    const homeAbbrev = normalizeMLBTeamAbbrev(data?.teams?.home?.team?.abbreviation || MLB_TEAM_IDS_REVERSE[toNumber(data?.teams?.home?.team?.id)] || "");
    const awayAbbrev = normalizeMLBTeamAbbrev(data?.teams?.away?.team?.abbreviation || MLB_TEAM_IDS_REVERSE[toNumber(data?.teams?.away?.team?.id)] || "");

    const homePlayers = Object.values<any>(data?.teams?.home?.players ?? {}).map((player) => parseBoxscorePlayer(player, homeAbbrev));
    const awayPlayers = Object.values<any>(data?.teams?.away?.players ?? {}).map((player) => parseBoxscorePlayer(player, awayAbbrev));

    return { home: homePlayers, away: awayPlayers };
  } catch (error) {
    console.warn("[mlb-api] getMLBBoxscore failed:", error);
    return { home: [], away: [] };
  }
}

export async function getMLBPlayerGameLog(
  playerId: number,
  season = new Date().getFullYear(),
  group: "hitting" | "pitching" = "hitting",
): Promise<MLBPlayerGameLog[]> {
  try {
    const url = `${MLB_BASE}/people/${playerId}/stats?stats=gameLog&group=${group}&season=${season}`;
    const data = await cachedFetch<any>(url, 60 * 60 * 1000);
    const splits = data?.stats?.[0]?.splits ?? [];
    const playerName = data?.people?.[0]?.fullName ?? "";

    return splits.map((split: any) => {
      const stat = split?.stat ?? {};
      const opponentName = split?.opponent?.name ?? "";
      const opponentAbbrev = normalizeMLBTeamAbbrev(
        split?.opponent?.abbreviation || MLB_TEAM_IDS_REVERSE[toNumber(split?.opponent?.id)] || findMLBTeamAbbreviationByName(opponentName),
      );

      const rawResult = String(split?.result?.type ?? split?.result ?? "").toUpperCase();
      const result = rawResult.startsWith("W") ? "W" : rawResult.startsWith("L") ? "L" : null;
      const homeAway = String(split?.homeOrAway ?? split?.isHome ?? "").toLowerCase();
      const isHome = homeAway === "home" || homeAway === "true";
      const teamAbbrev = normalizeMLBTeamAbbrev(
        split?.team?.abbreviation || MLB_TEAM_IDS_REVERSE[toNumber(split?.team?.id)] || "",
      );

      return {
        playerId,
        playerName: split?.player?.fullName ?? playerName,
        team: teamAbbrev,
        gameId: String(split?.game?.gamePk ?? split?.gamePk ?? ""),
        gameDate: String(split?.date ?? split?.game?.gameDate ?? "").slice(0, 10),
        opponent: opponentName,
        opponentAbbrev,
        isHome,
        result,
        score: String(split?.result?.description ?? split?.game?.summary ?? split?.score ?? ""),
        statGroup: group,
        atBats: toNumber(stat?.atBats),
        hits: toNumber(stat?.hits),
        totalBases: toNumber(stat?.totalBases),
        homeRuns: toNumber(stat?.homeRuns),
        rbis: toNumber(stat?.rbi ?? stat?.rbis),
        runs: toNumber(stat?.runs),
        stolenBases: toNumber(stat?.stolenBases),
        strikeOuts: toNumber(stat?.strikeOuts),
        inningsPitched: parseInningsPitched(stat?.inningsPitched),
        earnedRuns: toNumber(stat?.earnedRuns),
        hitsAllowed: group === "pitching" ? toNumber(stat?.hits) : 0,
        walksAllowed: toNumber(stat?.baseOnBalls),
        pitchesThrown: toNumber(stat?.numberOfPitches),
      };
    }).sort((a: MLBPlayerGameLog, b: MLBPlayerGameLog) => b.gameDate.localeCompare(a.gameDate));
  } catch (error) {
    console.warn("[mlb-api] getMLBPlayerGameLog failed:", error);
    return [];
  }
}

export async function getMLBTeamRoster(teamId: number): Promise<MLBPlayer[]> {
  try {
    const data = await cachedFetch<any>(`${MLB_BASE}/teams/${teamId}/roster/active`, 60 * 60 * 1000);
    const teamAbbrev = normalizeMLBTeamAbbrev(data?.team?.abbreviation || MLB_TEAM_IDS_REVERSE[teamId] || "");

    return (data?.roster ?? []).map((entry: any) => ({
      id: toNumber(entry?.person?.id),
      name: entry?.person?.fullName ?? "",
      team: teamAbbrev,
      position: entry?.position?.abbreviation ?? "",
      jerseyNumber: entry?.jerseyNumber ?? undefined,
      bats: entry?.person?.batSide?.code ?? undefined,
      throws: entry?.person?.pitchHand?.code ?? undefined,
      status: entry?.status?.description ?? undefined,
    }));
  } catch (error) {
    console.warn("[mlb-api] getMLBTeamRoster failed:", error);
    return [];
  }
}

export function getCurrentMLBSeason(date = new Date()) {
  return Number(getDateKey(date, MLB_TIME_ZONE).slice(0, 4));
}
