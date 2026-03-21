import { readFile } from "fs/promises";
import path from "path";
import { getDateKey } from "@/lib/date-utils";
import { getUpcomingSchedule } from "@/lib/nhl-api";
import type { NHLGame } from "@/lib/types";

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();

const NHL_BASE = "https://api-web.nhle.com/v1";
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const SCHEDULE_TTL_MS = 10 * 60 * 1000;
const MONEYPICK_TTL_MS = 6 * 60 * 60 * 1000;
const LIVE_MONEYPICK_MIRROR_URL = "https://raw.githubusercontent.com/jmbarton04/nhl_odds_moneypuck/main/data/moneypuck_today.csv";
const BUNDLED_MONEYPICK_PATH = path.join(process.cwd(), "data", "nhl", "moneypuck-team-context.snapshot.json");
const REGULAR_SEASON_GAME_TYPE = 2;

type RawStanding = {
  conferenceAbbrev?: string;
  conferenceName?: string;
  conferenceSequence?: number;
  divisionName?: string;
  gamesPlayed?: number;
  points?: number;
  streakCode?: string;
  streakCount?: number;
  teamAbbrev?: { default?: string } | string;
  teamName?: { default?: string };
  teamCommonName?: { default?: string };
  teamLogo?: string;
};

type ClubScheduleGame = {
  id: number;
  gameType: number;
  gameDate: string;
  startTimeUTC: string;
  gameState: string;
  venueTimezone?: string;
  venueUTCOffset?: string;
  homeTeam?: { abbrev?: string };
  awayTeam?: { abbrev?: string };
};

type MoneyPuckTeamSnapshot = {
  teamAbbrev: string;
  xGoalsPercentage: number | null;
  xGoalsFor: number | null;
  xGoalsAgainst: number | null;
  scoreVenueAdjustedXGoalsFor: number | null;
  goalsFor: number | null;
};

type MoneyPuckSnapshotEnvelope = {
  season: string;
  asOf: string | null;
  sourcedAt: string | null;
  source: {
    name: string;
    kind: "github-mirror" | "bundled-snapshot" | "unavailable";
    upstream: string;
    url: string | null;
    notes?: string;
  };
  teams: MoneyPuckTeamSnapshot[];
};

type MoneyPuckSnapshotResult = MoneyPuckSnapshotEnvelope & {
  teamMap: Map<string, MoneyPuckTeamSnapshot>;
  fetchedAt: string;
};

type DerivedRestContext = {
  lastGameDate: string | null;
  restDays: number | null;
  isBackToBack: boolean;
  gamesInLast4Days: number;
  gamesInLast7Days: number;
};

type DerivedTravelContext = {
  previousVenueTeamAbbrev: string | null;
  currentVenueTeamAbbrev: string;
  travelKm: number | null;
  timezoneShiftHours: number | null;
  longHaul: boolean;
};

type DerivedPlayoffPressure = {
  heuristic: "conference-top-8";
  conferenceRank: number | null;
  cutlineRank: number;
  cutlineTeamAbbrev: string | null;
  cutlineDeltaPoints: number | null;
  gamesRemaining: number | null;
  urgencyTier: "high" | "medium" | "low" | "none";
  reason: string;
};

export type NHLContextTeamBoardEntry = {
  role: "away" | "home";
  teamAbbrev: string;
  teamName: string;
  opponentAbbrev: string;
  sourced: {
    standings: {
      points: number;
      gamesPlayed: number;
      conference: string;
      division: string;
      conferenceRank: number | null;
      streakCode: string;
      fetchedAt: string;
      source: "nhl-api";
    } | null;
    moneyPuck: {
      xGoalsPercentage: number | null;
      xGoalsFor: number | null;
      xGoalsAgainst: number | null;
      scoreVenueAdjustedXGoalsFor: number | null;
      goalsFor: number | null;
      season: string;
      asOf: string | null;
      fetchedAt: string | null;
      source: MoneyPuckSnapshotResult["source"];
    } | null;
  };
  derived: {
    rest: DerivedRestContext;
    travel: DerivedTravelContext;
    playoffPressure: DerivedPlayoffPressure;
    fatigueScore: number | null;
    fatigueFlags: string[];
  };
};

export type NHLContextBoardGame = {
  gameId: number;
  gameDate: string;
  startTimeUTC: string;
  gameState: string;
  matchup: {
    awayTeam: { abbrev: string; name: string };
    homeTeam: { abbrev: string; name: string };
  };
  teams: {
    away: NHLContextTeamBoardEntry;
    home: NHLContextTeamBoardEntry;
  };
};

export type NHLContextBoardResponse = {
  date: string;
  season: string;
  builtAt: string;
  games: NHLContextBoardGame[];
  meta: {
    sources: {
      schedule: {
        provider: "nhl-api";
        fetchedAt: string;
      };
      standings: {
        provider: "nhl-api";
        fetchedAt: string;
      };
      moneyPuck: {
        provider: string;
        kind: MoneyPuckSnapshotResult["source"]["kind"];
        upstream: string;
        url: string | null;
        asOf: string | null;
        fetchedAt: string | null;
        teamCount: number;
      };
    };
    notes: string[];
  };
};

const TEAM_HOME_BASE: Record<string, { lat: number; lon: number; tzOffsetHours: number }> = {
  ANA: { lat: 33.8079, lon: -117.8763, tzOffsetHours: -7 },
  BOS: { lat: 42.3662, lon: -71.0621, tzOffsetHours: -4 },
  BUF: { lat: 42.875, lon: -78.8767, tzOffsetHours: -4 },
  CGY: { lat: 51.0374, lon: -114.0519, tzOffsetHours: -6 },
  CAR: { lat: 35.8033, lon: -78.7218, tzOffsetHours: -4 },
  CHI: { lat: 41.8807, lon: -87.6742, tzOffsetHours: -5 },
  COL: { lat: 39.7487, lon: -105.0077, tzOffsetHours: -6 },
  CBJ: { lat: 39.9693, lon: -83.0061, tzOffsetHours: -4 },
  DAL: { lat: 32.7905, lon: -96.8103, tzOffsetHours: -5 },
  DET: { lat: 42.3411, lon: -83.0551, tzOffsetHours: -4 },
  EDM: { lat: 53.5468, lon: -113.4976, tzOffsetHours: -6 },
  FLA: { lat: 26.1584, lon: -80.3258, tzOffsetHours: -4 },
  LAK: { lat: 34.043, lon: -118.2673, tzOffsetHours: -7 },
  MIN: { lat: 44.9448, lon: -93.101, tzOffsetHours: -5 },
  MTL: { lat: 45.496, lon: -73.5693, tzOffsetHours: -4 },
  NSH: { lat: 36.1591, lon: -86.7785, tzOffsetHours: -5 },
  NJD: { lat: 40.7335, lon: -74.1711, tzOffsetHours: -4 },
  NYI: { lat: 40.7229, lon: -73.5908, tzOffsetHours: -4 },
  NYR: { lat: 40.7505, lon: -73.9934, tzOffsetHours: -4 },
  OTT: { lat: 45.2969, lon: -75.9272, tzOffsetHours: -4 },
  PHI: { lat: 39.9012, lon: -75.1719, tzOffsetHours: -4 },
  PIT: { lat: 40.439, lon: -79.9894, tzOffsetHours: -4 },
  SEA: { lat: 47.6221, lon: -122.354, tzOffsetHours: -7 },
  SJS: { lat: 37.3328, lon: -121.9012, tzOffsetHours: -7 },
  STL: { lat: 38.6268, lon: -90.2026, tzOffsetHours: -5 },
  TBL: { lat: 27.9427, lon: -82.4518, tzOffsetHours: -4 },
  TOR: { lat: 43.6435, lon: -79.3791, tzOffsetHours: -4 },
  UTA: { lat: 40.7683, lon: -111.9012, tzOffsetHours: -6 },
  VAN: { lat: 49.2778, lon: -123.1089, tzOffsetHours: -7 },
  VGK: { lat: 36.1029, lon: -115.1783, tzOffsetHours: -7 },
  WSH: { lat: 38.8981, lon: -77.0209, tzOffsetHours: -4 },
  WPG: { lat: 49.8927, lon: -97.1436, tzOffsetHours: -5 },
};

function inferSeason(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function cachedJsonFetch<T>(url: string, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const cacheKey = `json:${url}`;
  const cached = cacheGet<T>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url, { next: { revalidate: Math.max(1, Math.round(ttlMs / 1000)) } });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  const data = await response.json() as T;
  cacheSet(cacheKey, data, ttlMs);
  return data;
}

async function cachedTextFetch(url: string, ttlMs = DEFAULT_TTL_MS): Promise<string> {
  const cacheKey = `text:${url}`;
  const cached = cacheGet<string>(cacheKey);
  if (cached) return cached;

  const response = await fetch(url, { next: { revalidate: Math.max(1, Math.round(ttlMs / 1000)) } });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  const text = await response.text();
  cacheSet(cacheKey, text, ttlMs);
  return text;
}

function parseCsvRows(csvText: string) {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [] as Record<string, string>[];
  const headers = lines[0].split(",").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(",").map((part) => part.trim());
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = parts[index] ?? "";
      return acc;
    }, {});
  });
}

function safeNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function moneyPuckTeamFromRow(row: Record<string, string>): MoneyPuckTeamSnapshot | null {
  const teamAbbrev = String(row.team || row.teamAbbrev || "").trim().toUpperCase();
  const xGoalsPercentage = safeNumber(row.xGoalsPercentage);
  const xGoalsFor = safeNumber(row.xGoalsFor);
  if (!teamAbbrev || xGoalsPercentage === null || xGoalsFor === null || xGoalsPercentage <= 0) {
    return null;
  }

  const xGoalsAgainst = Number((xGoalsFor * (1 - xGoalsPercentage)) / xGoalsPercentage);
  return {
    teamAbbrev,
    xGoalsPercentage: Number(xGoalsPercentage.toFixed(4)),
    xGoalsFor: Number(xGoalsFor.toFixed(2)),
    xGoalsAgainst: Number(xGoalsAgainst.toFixed(2)),
    scoreVenueAdjustedXGoalsFor: safeNumber(row.scoreVenueAdjustedxGoalsFor),
    goalsFor: safeNumber(row.goalsFor),
  };
}

function toMoneyPuckResult(snapshot: MoneyPuckSnapshotEnvelope): MoneyPuckSnapshotResult {
  return {
    ...snapshot,
    fetchedAt: new Date().toISOString(),
    teamMap: new Map(snapshot.teams.map((team) => [team.teamAbbrev, team])),
  };
}

async function loadBundledMoneyPuckSnapshot(): Promise<MoneyPuckSnapshotResult> {
  const raw = await readFile(BUNDLED_MONEYPICK_PATH, "utf8");
  return toMoneyPuckResult(JSON.parse(raw) as MoneyPuckSnapshotEnvelope);
}

async function loadMoneyPuckSnapshot(): Promise<MoneyPuckSnapshotResult> {
  const cached = cacheGet<MoneyPuckSnapshotResult>("nhl-context:moneypuck");
  if (cached) return cached;

  try {
    const csvText = await cachedTextFetch(LIVE_MONEYPICK_MIRROR_URL, MONEYPICK_TTL_MS);
    const teams = parseCsvRows(csvText)
      .map(moneyPuckTeamFromRow)
      .filter((team): team is MoneyPuckTeamSnapshot => Boolean(team))
      .sort((left, right) => left.teamAbbrev.localeCompare(right.teamAbbrev));

    if (teams.length) {
      const liveResult = toMoneyPuckResult({
        season: inferSeason(),
        asOf: getDateKey(new Date()),
        sourcedAt: new Date().toISOString(),
        source: {
          name: "MoneyPuck daily team snapshot mirror",
          kind: "github-mirror",
          upstream: "MoneyPuck",
          url: LIVE_MONEYPICK_MIRROR_URL,
          notes: "Daily mirror used because direct MoneyPuck downloads are Cloudflare-blocked from this runtime.",
        },
        teams,
      });
      cacheSet("nhl-context:moneypuck", liveResult, MONEYPICK_TTL_MS);
      return liveResult;
    }
  } catch {
    // Fall through to bundled snapshot.
  }

  try {
    const bundled = await loadBundledMoneyPuckSnapshot();
    cacheSet("nhl-context:moneypuck", bundled, MONEYPICK_TTL_MS);
    return bundled;
  } catch {
    const empty = toMoneyPuckResult({
      season: inferSeason(),
      asOf: null,
      sourcedAt: null,
      source: {
        name: "MoneyPuck unavailable",
        kind: "unavailable",
        upstream: "MoneyPuck",
        url: null,
        notes: "Both live mirror and bundled startup snapshot were unavailable.",
      },
      teams: [],
    });
    cacheSet("nhl-context:moneypuck", empty, 5 * 60 * 1000);
    return empty;
  }
}

async function getRawStandings() {
  return cachedJsonFetch<{ standings: RawStanding[] }>(`${NHL_BASE}/standings/now`, DEFAULT_TTL_MS);
}

async function getClubSchedule(teamAbbrev: string, season = inferSeason()) {
  return cachedJsonFetch<{ games: ClubScheduleGame[] }>(`${NHL_BASE}/club-schedule-season/${teamAbbrev}/${season}`, DEFAULT_TTL_MS);
}

function normalizeStandingTeamAbbrev(teamAbbrev: RawStanding["teamAbbrev"]) {
  if (typeof teamAbbrev === "string") return teamAbbrev.toUpperCase();
  return String(teamAbbrev?.default || "").toUpperCase();
}

function normalizeTeamName(standing: RawStanding) {
  return standing.teamName?.default
    || standing.teamCommonName?.default
    || normalizeStandingTeamAbbrev(standing.teamAbbrev);
}

function differenceInCalendarDays(leftDateKey: string, rightDateKey: string) {
  const left = Date.parse(`${leftDateKey}T12:00:00Z`);
  const right = Date.parse(`${rightDateKey}T12:00:00Z`);
  return Math.round((left - right) / (24 * 60 * 60 * 1000));
}

function haversineKm(start: { lat: number; lon: number }, end: { lat: number; lon: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLon = toRadians(end.lon - start.lon);
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildRestContext(games: ClubScheduleGame[], currentGame: NHLGame): DerivedRestContext {
  const currentStart = Date.parse(currentGame.startTimeUTC);
  const completedGames = games
    .filter((game) => game.gameType === REGULAR_SEASON_GAME_TYPE)
    .filter((game) => ["OFF", "FINAL"].includes(String(game.gameState || "").toUpperCase()))
    .filter((game) => Date.parse(game.startTimeUTC) < currentStart)
    .sort((left, right) => Date.parse(right.startTimeUTC) - Date.parse(left.startTimeUTC));

  const lastGame = completedGames[0] || null;
  const last4Days = completedGames.filter((game) => differenceInCalendarDays(currentGame.startTimeUTC.slice(0, 10), game.gameDate) <= 4).length;
  const last7Days = completedGames.filter((game) => differenceInCalendarDays(currentGame.startTimeUTC.slice(0, 10), game.gameDate) <= 7).length;

  if (!lastGame) {
    return {
      lastGameDate: null,
      restDays: null,
      isBackToBack: false,
      gamesInLast4Days: 0,
      gamesInLast7Days: 0,
    };
  }

  const daysBetween = differenceInCalendarDays(currentGame.startTimeUTC.slice(0, 10), lastGame.gameDate);
  const restDays = Math.max(0, daysBetween - 1);

  return {
    lastGameDate: lastGame.gameDate,
    restDays,
    isBackToBack: restDays === 0,
    gamesInLast4Days: last4Days,
    gamesInLast7Days: last7Days,
  };
}

function buildTravelContext(teamAbbrev: string, games: ClubScheduleGame[], currentGame: NHLGame): DerivedTravelContext {
  const currentHomeBase = TEAM_HOME_BASE[currentGame.homeTeam.abbrev];
  const currentStart = Date.parse(currentGame.startTimeUTC);
  const lastPlayed = games
    .filter((game) => game.gameType === REGULAR_SEASON_GAME_TYPE)
    .filter((game) => ["OFF", "FINAL"].includes(String(game.gameState || "").toUpperCase()))
    .filter((game) => Date.parse(game.startTimeUTC) < currentStart)
    .sort((left, right) => Date.parse(right.startTimeUTC) - Date.parse(left.startTimeUTC))[0];

  const previousVenueTeamAbbrev = lastPlayed
    ? (lastPlayed.homeTeam?.abbrev || null)
    : null;

  const previousHomeBase = previousVenueTeamAbbrev ? TEAM_HOME_BASE[previousVenueTeamAbbrev] : null;
  const travelKm = previousHomeBase && currentHomeBase
    ? Number(haversineKm(previousHomeBase, currentHomeBase).toFixed(0))
    : null;
  const timezoneShiftHours = previousHomeBase && currentHomeBase
    ? currentHomeBase.tzOffsetHours - previousHomeBase.tzOffsetHours
    : null;

  return {
    previousVenueTeamAbbrev,
    currentVenueTeamAbbrev: currentGame.homeTeam.abbrev,
    travelKm,
    timezoneShiftHours,
    longHaul: (travelKm ?? 0) >= 1500,
  };
}

function buildPlayoffPressure(teamAbbrev: string, standings: RawStanding[]): DerivedPlayoffPressure {
  const sortedConference = standings
    .filter((standing) => normalizeStandingTeamAbbrev(standing.teamAbbrev))
    .sort((left, right) => (left.conferenceSequence ?? 99) - (right.conferenceSequence ?? 99));

  const teamStanding = sortedConference.find((standing) => normalizeStandingTeamAbbrev(standing.teamAbbrev) === teamAbbrev) || null;
  if (!teamStanding) {
    return {
      heuristic: "conference-top-8",
      conferenceRank: null,
      cutlineRank: 8,
      cutlineTeamAbbrev: null,
      cutlineDeltaPoints: null,
      gamesRemaining: null,
      urgencyTier: "none",
      reason: "Standings unavailable for this team.",
    };
  }

  const conferenceRows = standings
    .filter((standing) => standing.conferenceName === teamStanding.conferenceName)
    .sort((left, right) => (left.conferenceSequence ?? 99) - (right.conferenceSequence ?? 99));

  const cutline = conferenceRows[7] || null;
  const cutlinePoints = cutline?.points ?? null;
  const teamPoints = teamStanding.points ?? null;
  const gamesRemaining = teamStanding.gamesPlayed != null ? Math.max(0, 82 - teamStanding.gamesPlayed) : null;
  const cutlineDeltaPoints = cutlinePoints != null && teamPoints != null ? teamPoints - cutlinePoints : null;

  let urgencyTier: DerivedPlayoffPressure["urgencyTier"] = "none";
  if (gamesRemaining !== null && cutlineDeltaPoints !== null) {
    if (gamesRemaining <= 12 && Math.abs(cutlineDeltaPoints) <= 2) urgencyTier = "high";
    else if (gamesRemaining <= 16 && Math.abs(cutlineDeltaPoints) <= 4) urgencyTier = "medium";
    else if (Math.abs(cutlineDeltaPoints) <= 6) urgencyTier = "low";
  }

  const relation = cutlineDeltaPoints === null
    ? "unknown"
    : cutlineDeltaPoints >= 0
      ? `${cutlineDeltaPoints} points above`
      : `${Math.abs(cutlineDeltaPoints)} points behind`;

  return {
    heuristic: "conference-top-8",
    conferenceRank: teamStanding.conferenceSequence ?? null,
    cutlineRank: 8,
    cutlineTeamAbbrev: cutline ? normalizeStandingTeamAbbrev(cutline.teamAbbrev) : null,
    cutlineDeltaPoints,
    gamesRemaining,
    urgencyTier,
    reason: `Derived from conference top-8 cutline heuristic: rank ${teamStanding.conferenceSequence ?? "?"}, ${relation}, ${gamesRemaining ?? "?"} games remaining.`,
  };
}

function buildFatigue(rest: DerivedRestContext, travel: DerivedTravelContext) {
  if (rest.restDays === null) {
    return { fatigueScore: null, fatigueFlags: [] as string[] };
  }

  const flags: string[] = [];
  let fatigueScore = 0;

  if (rest.isBackToBack) {
    flags.push("back_to_back");
    fatigueScore += 35;
  }
  if (rest.gamesInLast4Days >= 3) {
    flags.push("three_in_four");
    fatigueScore += 25;
  }
  if (rest.gamesInLast7Days >= 4) {
    flags.push("four_plus_in_seven");
    fatigueScore += 15;
  }
  if (travel.longHaul) {
    flags.push("long_haul_travel");
    fatigueScore += 20;
  }
  if (Math.abs(travel.timezoneShiftHours ?? 0) >= 2) {
    flags.push("timezone_jump");
    fatigueScore += 10;
  }

  return {
    fatigueScore: Math.min(100, fatigueScore),
    fatigueFlags: flags,
  };
}

function buildTeamBoardEntry(params: {
  role: "away" | "home";
  teamAbbrev: string;
  teamName: string;
  opponentAbbrev: string;
  currentGame: NHLGame;
  schedulesByTeam: Map<string, ClubScheduleGame[]>;
  standingsByTeam: Map<string, RawStanding>;
  standingsFetchedAt: string;
  moneyPuck: MoneyPuckSnapshotResult;
}): NHLContextTeamBoardEntry {
  const {
    role,
    teamAbbrev,
    teamName,
    opponentAbbrev,
    currentGame,
    schedulesByTeam,
    standingsByTeam,
    standingsFetchedAt,
    moneyPuck,
  } = params;

  const teamSchedule = schedulesByTeam.get(teamAbbrev) || [];
  const standing = standingsByTeam.get(teamAbbrev) || null;
  const sameConferenceStandings = standing
    ? Array.from(standingsByTeam.values()).filter((row) => row.conferenceName === standing.conferenceName)
    : [];
  const moneyPuckRow = moneyPuck.teamMap.get(teamAbbrev) || null;

  const rest = buildRestContext(teamSchedule, currentGame);
  const travel = buildTravelContext(teamAbbrev, teamSchedule, currentGame);
  const playoffPressure = buildPlayoffPressure(teamAbbrev, sameConferenceStandings);
  const fatigue = buildFatigue(rest, travel);

  return {
    role,
    teamAbbrev,
    teamName,
    opponentAbbrev,
    sourced: {
      standings: standing ? {
        points: standing.points ?? 0,
        gamesPlayed: standing.gamesPlayed ?? 0,
        conference: standing.conferenceName || "",
        division: standing.divisionName || "",
        conferenceRank: standing.conferenceSequence ?? null,
        streakCode: `${standing.streakCode || ""}${standing.streakCount || ""}`,
        fetchedAt: standingsFetchedAt,
        source: "nhl-api",
      } : null,
      moneyPuck: {
        xGoalsPercentage: moneyPuckRow?.xGoalsPercentage ?? null,
        xGoalsFor: moneyPuckRow?.xGoalsFor ?? null,
        xGoalsAgainst: moneyPuckRow?.xGoalsAgainst ?? null,
        scoreVenueAdjustedXGoalsFor: moneyPuckRow?.scoreVenueAdjustedXGoalsFor ?? null,
        goalsFor: moneyPuckRow?.goalsFor ?? null,
        season: moneyPuck.season,
        asOf: moneyPuck.asOf,
        fetchedAt: moneyPuck.sourcedAt,
        source: moneyPuck.source,
      },
    },
    derived: {
      rest,
      travel,
      playoffPressure,
      fatigueScore: fatigue.fatigueScore,
      fatigueFlags: fatigue.fatigueFlags,
    },
  };
}

export async function getTodayNHLContextBoard(): Promise<NHLContextBoardResponse> {
  const boardCacheKey = `nhl-context:board:${getDateKey()}`;
  const cached = cacheGet<NHLContextBoardResponse>(boardCacheKey);
  if (cached) return cached;

  const builtAt = new Date().toISOString();
  const [schedule, rawStandings, moneyPuck] = await Promise.all([
    getUpcomingSchedule(1),
    getRawStandings(),
    loadMoneyPuckSnapshot(),
  ]);

  const boardDate = schedule.date || getDateKey();
  const games = schedule.games.filter((game) => getDateKey(new Date(game.startTimeUTC)) === boardDate);
  const uniqueTeams = Array.from(new Set(games.flatMap((game) => [game.awayTeam.abbrev, game.homeTeam.abbrev])));

  const schedules = await Promise.all(uniqueTeams.map(async (teamAbbrev) => {
    const data = await getClubSchedule(teamAbbrev, inferSeason());
    return [teamAbbrev, data.games || []] as const;
  }));

  const schedulesByTeam = new Map<string, ClubScheduleGame[]>(schedules);
  const standingsByTeam = new Map<string, RawStanding>(
    (rawStandings.standings || []).map((standing) => [normalizeStandingTeamAbbrev(standing.teamAbbrev), standing]),
  );

  const standingsFetchedAt = builtAt;
  const boardGames: NHLContextBoardGame[] = games.map((game) => ({
    gameId: game.id,
    gameDate: getDateKey(new Date(game.startTimeUTC)),
    startTimeUTC: game.startTimeUTC,
    gameState: game.gameState,
    matchup: {
      awayTeam: { abbrev: game.awayTeam.abbrev, name: game.awayTeam.name || game.awayTeam.abbrev },
      homeTeam: { abbrev: game.homeTeam.abbrev, name: game.homeTeam.name || game.homeTeam.abbrev },
    },
    teams: {
      away: buildTeamBoardEntry({
        role: "away",
        teamAbbrev: game.awayTeam.abbrev,
        teamName: game.awayTeam.name || game.awayTeam.abbrev,
        opponentAbbrev: game.homeTeam.abbrev,
        currentGame: game,
        schedulesByTeam,
        standingsByTeam,
        standingsFetchedAt,
        moneyPuck,
      }),
      home: buildTeamBoardEntry({
        role: "home",
        teamAbbrev: game.homeTeam.abbrev,
        teamName: game.homeTeam.name || game.homeTeam.abbrev,
        opponentAbbrev: game.awayTeam.abbrev,
        currentGame: game,
        schedulesByTeam,
        standingsByTeam,
        standingsFetchedAt,
        moneyPuck,
      }),
    },
  }));

  const response: NHLContextBoardResponse = {
    date: boardDate,
    season: inferSeason(),
    builtAt,
    games: boardGames,
    meta: {
      sources: {
        schedule: {
          provider: "nhl-api",
          fetchedAt: builtAt,
        },
        standings: {
          provider: "nhl-api",
          fetchedAt: standingsFetchedAt,
        },
        moneyPuck: {
          provider: moneyPuck.source.name,
          kind: moneyPuck.source.kind,
          upstream: moneyPuck.source.upstream,
          url: moneyPuck.source.url,
          asOf: moneyPuck.asOf,
          fetchedAt: moneyPuck.sourcedAt,
          teamCount: moneyPuck.teams.length,
        },
      },
      notes: [
        "MoneyPuck values are sourced inputs; rest/travel/playoff-pressure are derived heuristics.",
        "No coach sentiment, injury sentiment, or locker-room narrative is inferred here.",
        "Playoff pressure uses a simple conference top-8 cutline heuristic, not full tie-breaker or clinch math.",
      ],
    },
  };

  cacheSet(boardCacheKey, response, SCHEDULE_TTL_MS);
  return response;
}
