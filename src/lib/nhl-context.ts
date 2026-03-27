import { readFile } from "fs/promises";
import path from "path";
import { getDateKey } from "@/lib/date-utils";
import { getUpcomingSchedule, getGameGoalies, getNHLTeamPPStats, getNHLTeamPKStats, getNHLGoalieStrengthStats } from "@/lib/nhl-api";
import type { GoalieStarter, TeamPPStats, TeamPKStats, GoalieStrengthStats } from "@/lib/nhl-api";
import type { NHLGame } from "@/lib/types";
import { buildSourceHealthCheck, summarizeSourceHealth } from "@/lib/source-health";

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

type SourcedGoalieContext = {
  starter: GoalieStarter | null;
  /**
   * EV/PP/SH save breakdown — sourced from NHL stats REST API (goalie/savesByStrength).
   * Null when goalie is unconfirmed pre-game or not found in season stats.
   *
   * NOTE: High-danger zone SV% (HDSV%) is NOT available from NHL API.
   * Only EV/PP/SH strength splits are exposed. HDSV% requires MoneyPuck/NST analytics.
   */
  strengthSplits: GoalieStrengthStats | null;
  source: "nhl-api";
  fetchedAt: string;
};

// ─── PP / PK context types ──────────────────────────────────────────────

/**
 * Sourced power-play data for a team — from NHL stats REST API.
 */
type SourcedPPContext = {
  powerPlayPct: number;
  powerPlayNetPct: number;
  powerPlayGoalsFor: number;
  ppOpportunities: number;
  /** Average PP time per game (seconds) */
  ppTimeOnIcePerGame: number;
  /** Short-handed goals allowed while on PP (negative efficiency signal) */
  shGoalsAgainst: number;
  season: string;
  source: "nhl-stats-rest";
  fetchedAt: string;
} | null;

/**
 * Sourced penalty-kill data for a team — from NHL stats REST API.
 */
type SourcedPKContext = {
  penaltyKillPct: number;
  penaltyKillNetPct: number;
  timesShorthanded: number;
  ppGoalsAgainst: number;
  /** Short-handed goals for (bonus negative for opponent PP) */
  shGoalsFor: number;
  season: string;
  source: "nhl-stats-rest";
  fetchedAt: string;
} | null;

/**
 * Derived PP efficiency differential for this matchup.
 *
 * PP efficiency differential = team PP% minus opponent PK%.
 * Positive value means team's PP is stronger than opponent's PK → PP edge.
 * Negative value means opponent's PK is suppressing the team's PP unit.
 *
 * Signal tier (differential = team PP% - opp allowed rate, where allowed rate = 1 - oppPK%):
 *   "strong"   → differential >= 0.04  (team PP converts 4pp above opp's typical allowed rate)
 *   "moderate" → differential >= 0.02
 *   "neutral"  → |differential| < 0.02
 *   "adverse"  → differential < -0.02  (team PP converts below opp's typical allowed rate)
 *   "unavailable" → PP/PK data not loaded
 */
type DerivedPPEfficiency = {
  teamPPPct: number | null;
  opponentPKPct: number | null;
  /**
   * Raw differential (teamPPPct - opponentPKPct).
   * Positive = team PP likely to convert if drawn. Negative = PK advantage for opponent.
   */
  ppEfficiencyDifferential: number | null;
  /**
   * Net special teams advantage (also accounts for opponent PP vs team PK).
   * = teamPPPct - oppPKPct - (oppPPPct - teamPKPct)
   * Captures full picture: how both teams do on special teams against each other.
   */
  netSpecialTeamsDifferential: number | null;
  tier: "strong" | "moderate" | "neutral" | "adverse" | "unavailable";
  note: string;
};

type DerivedGoalieContext = {
  starterStatus: GoalieStarter["status"] | "unavailable";
  isConfirmed: boolean;
  isBackup: boolean;
  experienceTier: "starter" | "limited-sample" | "unknown";
  /**
   * Quality tier based on season SV% + GAA.
   * elite  = SV% ≥ 0.915
   * average = SV% 0.895–0.914
   * weak   = SV% < 0.895 && GAA > 3.00 (confirmed market edge signal)
   * unknown = stats unavailable
   */
  qualityTier: "elite" | "average" | "weak" | "unknown";
  sampleDecisionCount: number | null;
  alertFlags: string[];
  /**
   * EV/PP/SH save breakdown from NHL stats REST API (goalie/savesByStrength).
   * Null when not available or goalie has < 5 GP this season.
   *
   * NOTE: High-danger zone SV% is NOT exposed by NHL API. Only strength-situation
   * splits (even-strength, power-play, shorthanded) are available here.
   * HDSV% requires MoneyPuck or Natural Stat Trick analytics — currently blocked.
   */
  strengthSplits: {
    evSavePct: number;
    ppSavePct: number;
    shSavePct: number;
    evShotsAgainst: number;
    ppShotsAgainst: number;
    shShotsAgainst: number;
  } | null;
};

type SourcedNewsItem = {
  title: string;
  url: string;
  sourceLabel: string;
  publishedAt: string | null;
  articleType: "team-site" | "league-site";
};

type SourcedNewsContext = {
  items: SourcedNewsItem[];
  source: {
    provider: "nhl.com";
    kind: "team-site-links" | "unavailable";
    url: string | null;
    fetchedAt: string;
    note: string;
  };
};

type DerivedNewsContext = {
  recentItemCount: number;
  hasGameDayPost: boolean;
  hasRosterMovePost: boolean;
  labels: string[];
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
    goalie: SourcedGoalieContext;
    news: SourcedNewsContext;
    /** PP stats for this team — sourced from NHL stats REST API */
    pp: SourcedPPContext;
    /** PK stats for this team — sourced from NHL stats REST API */
    pk: SourcedPKContext;
  };
  derived: {
    rest: DerivedRestContext;
    travel: DerivedTravelContext;
    playoffPressure: DerivedPlayoffPressure;
    fatigueScore: number | null;
    fatigueFlags: string[];
    goalie: DerivedGoalieContext;
    news: DerivedNewsContext;
    /**
     * PP efficiency differential vs this opponent.
     * Measures team PP% vs opponent PK% — computed at matchup level.
     */
    ppEfficiency: DerivedPPEfficiency;
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
  availability: {
    officialAvailabilityApproximation: "team-news-link-tags";
    note: string;
    counts: {
      teamsWithOfficialNewsLinks: number;
      teamsWithRosterMoveSignals: number;
      teamsWithGameDaySignals: number;
      teamsMissingOfficialSignals: number;
    };
  };
  sourceHealth: ReturnType<typeof summarizeSourceHealth>;
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
      news: {
        provider: "nhl.com";
        kind: "team-site-links" | "unavailable";
        fetchedAt: string;
        note: string;
      };
      specialTeams: {
        provider: "nhl-stats-rest";
        endpoint: string;
        fetchedAt: string;
        teamsWithPP: number;
        teamsWithPK: number;
        teamsWithGoalieStrength: number;
        degraded: boolean;
        note: string;
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

const NHL_TEAM_SITE_SLUGS: Record<string, string> = {
  ANA: "ducks",
  BOS: "bruins",
  BUF: "sabres",
  CGY: "flames",
  CAR: "hurricanes",
  CHI: "blackhawks",
  COL: "avalanche",
  CBJ: "bluejackets",
  DAL: "stars",
  DET: "redwings",
  EDM: "oilers",
  FLA: "panthers",
  LAK: "kings",
  MIN: "wild",
  MTL: "canadiens",
  NSH: "predators",
  NJD: "devils",
  NYI: "islanders",
  NYR: "rangers",
  OTT: "senators",
  PHI: "flyers",
  PIT: "penguins",
  SEA: "kraken",
  SJS: "sharks",
  STL: "blues",
  TBL: "lightning",
  TOR: "mapleleafs",
  UTA: "utah",
  VAN: "canucks",
  VGK: "goldenknights",
  WPG: "jets",
  WSH: "capitals",
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function buildGoalieDerivedContext(
  starter: GoalieStarter | null,
  strengthStats: GoalieStrengthStats | null,
): DerivedGoalieContext {
  if (!starter) {
    return {
      starterStatus: "unavailable",
      isConfirmed: false,
      isBackup: false,
      experienceTier: "unknown",
      qualityTier: "unknown",
      sampleDecisionCount: null,
      alertFlags: ["goalie_unavailable"],
      strengthSplits: null,
    };
  }

  const sampleDecisionCount = starter.wins + starter.losses + starter.otLosses;
  const alertFlags: string[] = [];
  if (starter.status !== "confirmed") alertFlags.push("starter_not_confirmed");
  if (starter.isBackup) alertFlags.push("backup_goalie");
  if (sampleDecisionCount < 10) alertFlags.push("limited_sample");

  // Quality tier from season SV% + GAA. League average SV% ≈ 0.905.
  // Weak = below-average and exploitable even if technically "the starter".
  let qualityTier: DerivedGoalieContext["qualityTier"] = "unknown";
  if (starter.savePct > 0 && starter.gaa > 0) {
    if (starter.savePct >= 0.915) {
      qualityTier = "elite";
    } else if (starter.savePct >= 0.895) {
      qualityTier = "average";
    } else {
      // savePct < 0.895 — only label "weak" if GAA also confirms degraded performance
      qualityTier = starter.gaa > 3.00 ? "weak" : "average";
    }
    if (qualityTier === "weak") alertFlags.push("weak_starter");
  }

  // PP SV% alert — if goalie is weak on the penalty kill (ppSavePct < 0.85)
  if (strengthStats && strengthStats.ppShotsAgainst >= 10 && strengthStats.ppSavePct < 0.85) {
    alertFlags.push("weak_pp_save_pct");
  }

  // Strength splits — carry forward from NHL stats REST API
  const strengthSplits = strengthStats ? {
    evSavePct: strengthStats.evSavePct,
    ppSavePct: strengthStats.ppSavePct,
    shSavePct: strengthStats.shSavePct,
    evShotsAgainst: strengthStats.evShotsAgainst,
    ppShotsAgainst: strengthStats.ppShotsAgainst,
    shShotsAgainst: strengthStats.shShotsAgainst,
  } : null;

  return {
    starterStatus: starter.status,
    isConfirmed: starter.status === "confirmed",
    isBackup: starter.isBackup,
    experienceTier: sampleDecisionCount >= 10 ? "starter" : "limited-sample",
    qualityTier,
    sampleDecisionCount,
    alertFlags,
    strengthSplits,
  };
}

function buildPPEfficiency(
  teamAbbrev: string,
  opponentAbbrev: string,
  ppMap: Map<string, TeamPPStats>,
  pkMap: Map<string, TeamPKStats>,
): DerivedPPEfficiency {
  const teamPP = ppMap.get(teamAbbrev) ?? null;
  const oppPK = pkMap.get(opponentAbbrev) ?? null;
  const oppPP = ppMap.get(opponentAbbrev) ?? null;
  const teamPK = pkMap.get(teamAbbrev) ?? null;

  if (!teamPP || !oppPK) {
    return {
      teamPPPct: teamPP?.powerPlayPct ?? null,
      opponentPKPct: oppPK?.penaltyKillPct ?? null,
      ppEfficiencyDifferential: null,
      netSpecialTeamsDifferential: null,
      tier: "unavailable",
      note: "PP/PK data not available for one or both teams.",
    };
  }

  // Correct comparison frame:
  // PP% = rate at which team SCORES on the power play
  // PK% = rate at which opponent KILLS the penalty (prevents goals)
  // Opp allowed rate = 1 - oppPK% (how often they ALLOW PP goals)
  // Edge = team PP% - opp allowed rate = team PP% - (1 - opp PK%)
  // Positive = team converts more often than the opponent typically allows → real PP edge
  const oppAllowedRate = 1 - oppPK.penaltyKillPct;
  const ppDiff = teamPP.powerPlayPct - oppAllowedRate;

  // Net ST differential (symmetric: team PP vs opp, and team PK vs opp PP)
  // Net = (team PP% - opp allowed rate) - (opp PP% - team allowed rate)
  // Positive = team has overall special teams advantage
  let netSTDiff: number | null = null;
  if (oppPP && teamPK) {
    const teamAllowedRate = 1 - teamPK.penaltyKillPct;
    const pkDiff = oppPP.powerPlayPct - teamAllowedRate; // opp's PP edge over team PK
    netSTDiff = Number((ppDiff - pkDiff).toFixed(4)); // net = team's PP edge minus opp's PP edge
  }

  let tier: DerivedPPEfficiency["tier"] = "neutral";
  if (ppDiff >= 0.04) tier = "strong";
  else if (ppDiff >= 0.02) tier = "moderate";
  else if (ppDiff < -0.02) tier = "adverse";

  const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;
  return {
    teamPPPct: Number(teamPP.powerPlayPct.toFixed(4)),
    opponentPKPct: Number(oppPK.penaltyKillPct.toFixed(4)),
    ppEfficiencyDifferential: Number(ppDiff.toFixed(4)),
    netSpecialTeamsDifferential: netSTDiff,
    tier,
    note: `Team PP ${pctFmt(teamPP.powerPlayPct)} vs opp allowed rate ${pctFmt(oppAllowedRate)} (opp PK ${pctFmt(oppPK.penaltyKillPct)}) → diff ${pctFmt(ppDiff)}. Tier: ${tier}.`,
  };
}

async function loadTeamNews(teamAbbrev: string): Promise<SourcedNewsContext> {
  const fetchedAt = new Date().toISOString();
  const slug = NHL_TEAM_SITE_SLUGS[teamAbbrev];
  if (!slug) {
    return {
      items: [],
      source: {
        provider: "nhl.com",
        kind: "unavailable",
        url: null,
        fetchedAt,
        note: `No official nhl.com team-site slug is configured for ${teamAbbrev}.`,
      },
    };
  }

  const url = `https://www.nhl.com/${slug}/news`;
  try {
    const html = await cachedTextFetch(url, DEFAULT_TTL_MS);
    const linkPattern = /href="([^"]*\/news\/[^"#?]+)"/g;
    const seen = new Set<string>();
    const items: SourcedNewsItem[] = [];

    for (let match = linkPattern.exec(html); match; match = linkPattern.exec(html)) {
      const href = match[1];
      const absoluteUrl = href.startsWith("http") ? href : `https://www.nhl.com${href.startsWith("/") ? href : `/${href}`}`;
      if (seen.has(absoluteUrl)) continue;
      seen.add(absoluteUrl);

      const slugPart = absoluteUrl.split("/news/")[1] || "";
      const title = decodeHtml(slugPart.split("?")[0].split("#")[0].replace(/[-_]+/g, " ").trim());
      if (!title) continue;

      items.push({
        title,
        url: absoluteUrl,
        sourceLabel: `${teamAbbrev} official team site`,
        publishedAt: null,
        articleType: "team-site",
      });

      if (items.length >= 5) break;
    }

    return {
      items,
      source: {
        provider: "nhl.com",
        kind: items.length ? "team-site-links" : "unavailable",
        url,
        fetchedAt,
        note: items.length
          ? "Official nhl.com team news links only. Titles come from URL slugs; timestamps are omitted when the page does not expose them cleanly server-side."
          : "Official nhl.com team news page loaded, but no article links were extracted server-side.",
      },
    };
  } catch {
    return {
      items: [],
      source: {
        provider: "nhl.com",
        kind: "unavailable",
        url,
        fetchedAt,
        note: "Official nhl.com team news page was unavailable from this runtime.",
      },
    };
  }
}

function buildNewsDerivedContext(items: SourcedNewsItem[]): DerivedNewsContext {
  const labels = new Set<string>();
  for (const item of items) {
    const title = item.title.toLowerCase();
    if (title.includes("game day")) labels.add("game_day_post");
    if (/(sign|re-sign|trade|recall|assign|waiv|loan|activate|activate d|roster)/.test(title)) labels.add("roster_move_post");
  }

  return {
    recentItemCount: items.length,
    hasGameDayPost: labels.has("game_day_post"),
    hasRosterMovePost: labels.has("roster_move_post"),
    labels: Array.from(labels),
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
  goalie: GoalieStarter | null;
  goalieStrengthStats: GoalieStrengthStats | null;
  goalieFetchedAt: string;
  news: SourcedNewsContext;
  ppMap: Map<string, TeamPPStats>;
  pkMap: Map<string, TeamPKStats>;
  specialTeamsFetchedAt: string;
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
    goalie,
    goalieStrengthStats,
    goalieFetchedAt,
    news,
    ppMap,
    pkMap,
    specialTeamsFetchedAt,
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
  const derivedGoalie = buildGoalieDerivedContext(goalie, goalieStrengthStats);
  const derivedNews = buildNewsDerivedContext(news.items);
  const ppEfficiency = buildPPEfficiency(teamAbbrev, opponentAbbrev, ppMap, pkMap);

  const teamPP = ppMap.get(teamAbbrev) ?? null;
  const teamPK = pkMap.get(teamAbbrev) ?? null;

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
      goalie: {
        starter: goalie,
        strengthSplits: goalieStrengthStats,
        source: "nhl-api",
        fetchedAt: goalieFetchedAt,
      },
      news,
      pp: teamPP ? {
        powerPlayPct: teamPP.powerPlayPct,
        powerPlayNetPct: teamPP.powerPlayNetPct,
        powerPlayGoalsFor: teamPP.powerPlayGoalsFor,
        ppOpportunities: teamPP.ppOpportunities,
        ppTimeOnIcePerGame: teamPP.ppTimeOnIcePerGame,
        shGoalsAgainst: teamPP.shGoalsAgainst,
        season: "20252026",
        source: "nhl-stats-rest",
        fetchedAt: specialTeamsFetchedAt,
      } : null,
      pk: teamPK ? {
        penaltyKillPct: teamPK.penaltyKillPct,
        penaltyKillNetPct: teamPK.penaltyKillNetPct,
        timesShorthanded: teamPK.timesShorthanded,
        ppGoalsAgainst: teamPK.ppGoalsAgainst,
        shGoalsFor: teamPK.shGoalsFor,
        season: "20252026",
        source: "nhl-stats-rest",
        fetchedAt: specialTeamsFetchedAt,
      } : null,
    },
    derived: {
      rest,
      travel,
      playoffPressure,
      fatigueScore: fatigue.fatigueScore,
      fatigueFlags: fatigue.fatigueFlags,
      goalie: derivedGoalie,
      news: derivedNews,
      ppEfficiency,
    },
  };
}

export async function getTodayNHLContextBoard(): Promise<NHLContextBoardResponse> {
  const boardCacheKey = `nhl-context:board:${getDateKey()}`;
  const cached = cacheGet<NHLContextBoardResponse>(boardCacheKey);
  if (cached) return cached;

  const builtAt = new Date().toISOString();
  const [schedule, rawStandings, moneyPuck, ppStatsRaw, pkStatsRaw, goalieStrengthRaw] = await Promise.all([
    getUpcomingSchedule(1),
    getRawStandings(),
    loadMoneyPuckSnapshot(),
    getNHLTeamPPStats().catch(() => [] as TeamPPStats[]),
    getNHLTeamPKStats().catch(() => [] as TeamPKStats[]),
    getNHLGoalieStrengthStats().catch(() => [] as GoalieStrengthStats[]),
  ]);

  const boardDate = schedule.date || getDateKey();
  const games = schedule.games.filter((game) => getDateKey(new Date(game.startTimeUTC)) === boardDate);
  const uniqueTeams = Array.from(new Set(games.flatMap((game) => [game.awayTeam.abbrev, game.homeTeam.abbrev])));

  const [schedules, goalieEntries, teamNewsEntries] = await Promise.all([
    Promise.all(uniqueTeams.map(async (teamAbbrev) => {
      const data = await getClubSchedule(teamAbbrev, inferSeason());
      return [teamAbbrev, data.games || []] as const;
    })),
    Promise.all(games.map(async (game) => {
      const goalieData = await getGameGoalies(game.id).catch(() => ({ gameId: game.id, home: null, away: null }));
      return [game.id, goalieData] as const;
    })),
    Promise.all(uniqueTeams.map(async (teamAbbrev) => [teamAbbrev, await loadTeamNews(teamAbbrev)] as const)),
  ]);

  const schedulesByTeam = new Map<string, ClubScheduleGame[]>(schedules);
  const goaliesByGame = new Map<number, { gameId: number; home: GoalieStarter | null; away: GoalieStarter | null }>(goalieEntries);
  const newsByTeam = new Map<string, SourcedNewsContext>(teamNewsEntries);
  const standingsByTeam = new Map<string, RawStanding>(
    (rawStandings.standings || []).map((standing) => [normalizeStandingTeamAbbrev(standing.teamAbbrev), standing]),
  );

  // PP / PK / goalie strength maps
  const ppMap = new Map<string, TeamPPStats>(ppStatsRaw.map((r) => [r.teamAbbrev, r]));
  const pkMap = new Map<string, TeamPKStats>(pkStatsRaw.map((r) => [r.teamAbbrev, r]));
  // Goalie strength: indexed by playerId for fast lookup
  const goalieStrengthByPlayerId = new Map<number, GoalieStrengthStats>(
    goalieStrengthRaw.map((r) => [r.playerId, r])
  );

  const standingsFetchedAt = builtAt;
  const goalieFetchedAt = builtAt;
  const specialTeamsFetchedAt = builtAt;
  const boardGames: NHLContextBoardGame[] = games.map((game) => {
    const gameGoalies = goaliesByGame.get(game.id) || { gameId: game.id, home: null, away: null };

    // Look up goalie strength stats by playerId (from season aggregates)
    const awayGoalieStrength = gameGoalies.away?.playerId
      ? goalieStrengthByPlayerId.get(gameGoalies.away.playerId) ?? null
      : null;
    const homeGoalieStrength = gameGoalies.home?.playerId
      ? goalieStrengthByPlayerId.get(gameGoalies.home.playerId) ?? null
      : null;

    const awayNews = newsByTeam.get(game.awayTeam.abbrev) || {
      items: [],
      source: {
        provider: "nhl.com" as const,
        kind: "unavailable" as const,
        url: null,
        fetchedAt: builtAt,
        note: `Official team news unavailable for ${game.awayTeam.abbrev}.`,
      },
    };
    const homeNews = newsByTeam.get(game.homeTeam.abbrev) || {
      items: [],
      source: {
        provider: "nhl.com" as const,
        kind: "unavailable" as const,
        url: null,
        fetchedAt: builtAt,
        note: `Official team news unavailable for ${game.homeTeam.abbrev}.`,
      },
    };

    return {
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
          goalie: gameGoalies.away,
          goalieStrengthStats: awayGoalieStrength,
          goalieFetchedAt,
          news: awayNews,
          ppMap,
          pkMap,
          specialTeamsFetchedAt,
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
          goalie: gameGoalies.home,
          goalieStrengthStats: homeGoalieStrength,
          goalieFetchedAt,
          news: homeNews,
          ppMap,
          pkMap,
          specialTeamsFetchedAt,
        }),
      },
    };
  });

  const teams = boardGames.flatMap((game) => [game.teams.away, game.teams.home]);
  const availability = {
    officialAvailabilityApproximation: "team-news-link-tags" as const,
    note: "Current sustainable NHL availability rail uses official nhl.com team-site links plus source-labeled title tags as a conservative approximation. No player-level injury certainty is inferred from headlines alone.",
    counts: {
      teamsWithOfficialNewsLinks: teams.filter((team) => team.sourced.news.items.length > 0).length,
      teamsWithRosterMoveSignals: teams.filter((team) => team.derived.news.hasRosterMovePost).length,
      teamsWithGameDaySignals: teams.filter((team) => team.derived.news.hasGameDayPost).length,
      teamsMissingOfficialSignals: teams.filter((team) => team.sourced.news.items.length === 0).length,
    },
  };

  const sourceHealth = summarizeSourceHealth([
    buildSourceHealthCheck({
      key: "nhl-schedule",
      label: "NHL schedule",
      detail: "Official NHL API schedule rail.",
      fetchedAt: builtAt,
      staleAfter: new Date(Date.now() + SCHEDULE_TTL_MS).toISOString(),
      degraded: boardGames.length === 0,
    }),
    buildSourceHealthCheck({
      key: "nhl-standings",
      label: "Standings",
      detail: "Official NHL API standings rail.",
      fetchedAt: standingsFetchedAt,
      staleAfter: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
      degraded: standingsByTeam.size === 0,
    }),
    buildSourceHealthCheck({
      key: "moneypuck",
      label: "MoneyPuck mirror",
      detail: `MoneyPuck team context loaded from ${moneyPuck.source.kind}.`,
      fetchedAt: moneyPuck.sourcedAt,
      staleAfter: moneyPuck.sourcedAt ? new Date(new Date(moneyPuck.sourcedAt).getTime() + MONEYPICK_TTL_MS).toISOString() : null,
      degraded: moneyPuck.teams.length === 0 || moneyPuck.source.kind === "unavailable",
    }),
    buildSourceHealthCheck({
      key: "goalies",
      label: "Goalie status",
      detail: "NHL API probable/confirmed starter rail.",
      fetchedAt: goalieFetchedAt,
      staleAfter: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
      degraded: teams.some((team) => !team.sourced.goalie.starter),
      missingFields: teams.filter((team) => !team.sourced.goalie.starter).map((team) => `${team.teamAbbrev} starter unavailable`),
    }),
    buildSourceHealthCheck({
      key: "official-news",
      label: "Official team news / availability approximation",
      detail: availability.note,
      fetchedAt: builtAt,
      staleAfter: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
      degraded: availability.counts.teamsMissingOfficialSignals > 0,
      missingFields: teams.filter((team) => team.sourced.news.items.length === 0).map((team) => `${team.teamAbbrev} official news links missing`),
    }),
    buildSourceHealthCheck({
      key: "special-teams",
      label: "Special teams (PP/PK/goalie strength)",
      detail: "NHL stats REST API — season PP%, PK%, goalie EV/PP/SH save splits.",
      fetchedAt: specialTeamsFetchedAt,
      staleAfter: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      degraded: ppMap.size < 30 || pkMap.size < 30,
      missingFields: ppMap.size < 30 ? [`Only ${ppMap.size}/32 teams have PP data`] : [],
    }),
  ]);

  const response: NHLContextBoardResponse = {
    date: boardDate,
    season: inferSeason(),
    builtAt,
    games: boardGames,
    availability,
    sourceHealth,
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
        news: {
          provider: "nhl.com",
          kind: boardGames.some((game) => game.teams.away.sourced.news.items.length || game.teams.home.sourced.news.items.length) ? "team-site-links" : "unavailable",
          fetchedAt: builtAt,
          note: "News context is limited to official nhl.com team-site article links and simple source-labeled tags. No sentiment or quote inference is used.",
        },
        specialTeams: {
          provider: "nhl-stats-rest",
          endpoint: "api.nhle.com/stats/rest/en/team/{powerplay,penaltykill} + goalie/savesByStrength",
          fetchedAt: specialTeamsFetchedAt,
          teamsWithPP: ppMap.size,
          teamsWithPK: pkMap.size,
          teamsWithGoalieStrength: goalieStrengthRaw.length,
          degraded: ppMap.size < 30 || pkMap.size < 30,
          note: "PP/PK sourced from NHL stats REST API (season aggregates). Goalie EV/PP/SH save breakdown from savesByStrength. HIGH-DANGER zone SV% NOT available from NHL API — requires MoneyPuck/NST analytics (currently blocked by source gap).",
        },
      },
      notes: [
        "MoneyPuck values are sourced inputs; rest/travel/playoff-pressure are derived heuristics.",
        "Goalie context uses NHL API starter status and season stat lines; derived goalie flags are lightweight labels only.",
        "Goalie EV/PP/SH strength splits sourced from NHL stats REST API (savesByStrength). HIGH-DANGER zone SV% (HDSV%) is blocked — not exposed by NHL API; requires MoneyPuck/NST analytics.",
        "PP/PK efficiency differential is a season-aggregate matchup signal: team PP% vs opponent PK%. Does not account for 5v5 xGoals context.",
        "xGoals context (MoneyPuck xGoalsPercentage) is aggregate season-level; zone-specific shot danger (HDCF%, HDSA%) blocked by source gap — MoneyPuck GitHub mirror does not expose per-zone data.",
        "News context is limited to official nhl.com team-site links when available, with source-labeled derived tags from article titles only.",
        "No coach sentiment, injury sentiment, or locker-room narrative is inferred here.",
        "Playoff pressure uses a simple conference top-8 cutline heuristic, not full tie-breaker or clinch math.",
      ],
    },
  };

  cacheSet(boardCacheKey, response, SCHEDULE_TTL_MS);
  return response;
}
