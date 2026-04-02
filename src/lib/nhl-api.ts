import { NHLGame, ScheduleResponse } from "./types";
import { getDateKey } from "@/lib/date-utils";

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
  if (!res.ok) {
    if (res.status === 429 && cached) {
      return cached.data as T;
    }
    throw new Error(`NHL API error: ${res.status}`);
  }
  const data = await res.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function getCanonicalTeamName(team: any): string {
  const place = team?.placeName?.default || team?.placeName || "";
  const common = team?.commonName?.default || team?.commonName || "";
  const full = [place, common].filter(Boolean).join(" ").trim();
  return full || team?.name?.default || team?.teamName?.default || place || common || team?.abbrev || "???";
}

function mapGame(g: any): NHLGame {
  return {
    id: g.id,
    startTimeUTC: g.startTimeUTC,
    gameState: g.gameState,
    awayTeam: {
      abbrev: g.awayTeam?.abbrev || "???",
      name: getCanonicalTeamName(g.awayTeam),
      score: g.awayTeam?.score,
      logo: g.awayTeam?.logo,
    },
    homeTeam: {
      abbrev: g.homeTeam?.abbrev || "???",
      name: getCanonicalTeamName(g.homeTeam),
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
    if (!today) return { games: [], date: getDateKey() };

    const games: NHLGame[] = (today.games || []).map(mapGame);

    return { games, date: today.date };
  } catch {
    return { games: [], date: getDateKey() };
  }
}

export async function getUpcomingSchedule(days: number = 3): Promise<ScheduleResponse> {
  try {
    // Use date-specific endpoint for reliability (schedule/now can be slow)
    const today = getDateKey();
    const data = await cachedFetch<any>(`${NHL_BASE}/schedule/${today}`);
    const gameWeek = Array.isArray(data.gameWeek) ? data.gameWeek.slice(0, days) : [];
    const games: NHLGame[] = gameWeek
      .flatMap((day: any) => day.games || [])
      .filter((g: any) => g.gameState !== "OFF")
      .map(mapGame)
      .sort((a: NHLGame, b: NHLGame) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime());

    return {
      games,
      date: gameWeek[0]?.date || today,
    };
  } catch {
    return { games: [], date: getDateKey() };
  }
}

// Returns recent + upcoming games including completed ones — used for Trends (always has data)
export async function getBroadSchedule(days: number = 4): Promise<ScheduleResponse> {
  try {
    const today = getDateKey();
    const data = await cachedFetch<any>(`${NHL_BASE}/schedule/${today}`);
    const gameWeek = Array.isArray(data.gameWeek) ? data.gameWeek.slice(0, days) : [];
    const games: NHLGame[] = gameWeek
      .flatMap((day: any) => day.games || [])
      .map(mapGame)
      .sort((a: NHLGame, b: NHLGame) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime());

    return {
      games,
      date: gameWeek[0]?.date || getDateKey(),
    };
  } catch {
    return { games: [], date: getDateKey() };
  }
}

export async function getScheduleGameById(gameId: number): Promise<NHLGame | null> {
  try {
    const data = await cachedFetch<any>(`${NHL_BASE}/schedule/now`);
    const rawGame = (data.gameWeek || [])
      .flatMap((day: any) => day.games || [])
      .find((game: any) => Number(game?.id) === gameId);

    return rawGame ? mapGame(rawGame) : null;
  } catch {
    return null;
  }
}

export async function getNHLGameLanding(gameId: number): Promise<any | null> {
  try {
    return await cachedFetch<any>(`${NHL_BASE}/gamecenter/${gameId}/landing`, 5 * 60 * 1000);
  } catch {
    return null;
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
  conferenceName: string;
  divisionName: string;
  wins: number;
  losses: number;
  otLosses: number;
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
      conferenceName: t.conferenceName || "",
      divisionName: t.divisionName || "",
      wins: (t.homeWins ?? 0) + (t.roadWins ?? 0),
      losses: (t.homeLosses ?? 0) + (t.roadLosses ?? 0),
      otLosses: (t.homeOtLosses ?? 0) + (t.roadOtLosses ?? 0),
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
  opponentAbbrev: string;
  gameDate: string;
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

      const opponentAbbrev = isHome ? (g.awayTeam?.abbrev || "") : (g.homeTeam?.abbrev || "");
      const gameDate = g.gameDate || "";
      return { isHome, goalsFor, goalsAgainst, win, period1GoalsFor, period1GoalsAgainst, scoredFirst, opponentAbbrev, gameDate };
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

// ──────────────────────────────────────────────────────────────────────
// PP / PK team stats (api.nhle.com/stats/rest)
// ──────────────────────────────────────────────────────────────────────

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";

/**
 * Maps teamFullName (as returned by NHL stats REST API) → teamAbbrev.
 * Built from the live `/team/powerplay` response for season 20252026.
 */
const TEAM_FULLNAME_TO_ABBREV: Record<string, string> = {
  "Anaheim Ducks": "ANA",
  "Boston Bruins": "BOS",
  "Buffalo Sabres": "BUF",
  "Calgary Flames": "CGY",
  "Carolina Hurricanes": "CAR",
  "Chicago Blackhawks": "CHI",
  "Colorado Avalanche": "COL",
  "Columbus Blue Jackets": "CBJ",
  "Dallas Stars": "DAL",
  "Detroit Red Wings": "DET",
  "Edmonton Oilers": "EDM",
  "Florida Panthers": "FLA",
  "Los Angeles Kings": "LAK",
  "Minnesota Wild": "MIN",
  "Montréal Canadiens": "MTL",
  "Nashville Predators": "NSH",
  "New Jersey Devils": "NJD",
  "New York Islanders": "NYI",
  "New York Rangers": "NYR",
  "Ottawa Senators": "OTT",
  "Philadelphia Flyers": "PHI",
  "Pittsburgh Penguins": "PIT",
  "San Jose Sharks": "SJS",
  "Seattle Kraken": "SEA",
  "St. Louis Blues": "STL",
  "Tampa Bay Lightning": "TBL",
  "Toronto Maple Leafs": "TOR",
  "Utah Mammoth": "UTA",
  "Vancouver Canucks": "VAN",
  "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH",
  "Winnipeg Jets": "WPG",
};

export type TeamPPStats = {
  teamAbbrev: string;
  gamesPlayed: number;
  /** Power-play conversion rate (goals / opportunities) */
  powerPlayPct: number;
  /** Net PP% (excluding short-handed goals against) */
  powerPlayNetPct: number;
  powerPlayGoalsFor: number;
  ppOpportunities: number;
  ppTimeOnIcePerGame: number;
  /** Short-handed goals allowed while on PP */
  shGoalsAgainst: number;
};

export type TeamPKStats = {
  teamAbbrev: string;
  gamesPlayed: number;
  /** Penalty-kill success rate */
  penaltyKillPct: number;
  /** Net PK% (excluding shorthanded goals for) */
  penaltyKillNetPct: number;
  timesShorthanded: number;
  /** PP goals allowed */
  ppGoalsAgainst: number;
  /** Short-handed goals scored while killing a penalty */
  shGoalsFor: number;
};

export type GoalieStrengthStats = {
  playerId: number;
  goalieFullName: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  savePct: number;
  /** Even-strength save % */
  evSavePct: number;
  evSaves: number;
  evShotsAgainst: number;
  /** Power-play save % (opponent on PP) */
  ppSavePct: number;
  ppSaves: number;
  ppShotsAgainst: number;
  /** Short-handed save % (team on PP) */
  shSavePct: number;
  shSaves: number;
  shShotsAgainst: number;
};

const PP_CACHE_TTL = 30 * 60 * 1000; // 30 minutes — changes rarely
const CURRENT_SEASON = "20252026";
const GAME_TYPE_REGULAR = "2";

async function fetchNHLStatsRest<T>(path: string, ttl: number = PP_CACHE_TTL): Promise<T> {
  return cachedFetch<T>(`${NHL_STATS_BASE}/${path}`, ttl);
}

export async function getNHLTeamPPStats(season: string = CURRENT_SEASON): Promise<TeamPPStats[]> {
  try {
    const data = await fetchNHLStatsRest<{ data: any[] }>(
      `team/powerplay?isAggregate=false&isGame=false&limit=40&cayenneExp=gameTypeId%3D${GAME_TYPE_REGULAR}%20and%20seasonId%3D${season}`
    );
    return (data.data || []).map((row): TeamPPStats | null => {
      const abbrev = TEAM_FULLNAME_TO_ABBREV[row.teamFullName];
      if (!abbrev) return null;
      return {
        teamAbbrev: abbrev,
        gamesPlayed: row.gamesPlayed ?? 0,
        powerPlayPct: row.powerPlayPct ?? 0,
        powerPlayNetPct: row.powerPlayNetPct ?? 0,
        powerPlayGoalsFor: row.powerPlayGoalsFor ?? 0,
        ppOpportunities: row.ppOpportunities ?? 0,
        ppTimeOnIcePerGame: row.ppTimeOnIcePerGame ?? 0,
        shGoalsAgainst: row.shGoalsAgainst ?? 0,
      };
    }).filter((r): r is TeamPPStats => r !== null);
  } catch {
    return [];
  }
}

export async function getNHLTeamPKStats(season: string = CURRENT_SEASON): Promise<TeamPKStats[]> {
  try {
    const data = await fetchNHLStatsRest<{ data: any[] }>(
      `team/penaltykill?isAggregate=false&isGame=false&limit=40&cayenneExp=gameTypeId%3D${GAME_TYPE_REGULAR}%20and%20seasonId%3D${season}`
    );
    return (data.data || []).map((row): TeamPKStats | null => {
      const abbrev = TEAM_FULLNAME_TO_ABBREV[row.teamFullName];
      if (!abbrev) return null;
      return {
        teamAbbrev: abbrev,
        gamesPlayed: row.gamesPlayed ?? 0,
        penaltyKillPct: row.penaltyKillPct ?? 0,
        penaltyKillNetPct: row.penaltyKillNetPct ?? 0,
        timesShorthanded: row.timesShorthanded ?? 0,
        ppGoalsAgainst: row.ppGoalsAgainst ?? 0,
        shGoalsFor: row.shGoalsFor ?? 0,
      };
    }).filter((r): r is TeamPKStats => r !== null);
  } catch {
    return [];
  }
}

/**
 * Goalie save breakdown by game situation (EV / PP / SH).
 * Sourced from NHL stats REST API — season aggregates.
 *
 * NOTE: High-danger zone-specific save % is NOT available from NHL API.
 * That level of granularity (HDSA, MDSV%) is only in MoneyPuck/NST analytics.
 * This endpoint provides EV/PP/SH strength breakdown only.
 */
export async function getNHLGoalieStrengthStats(season: string = CURRENT_SEASON): Promise<GoalieStrengthStats[]> {
  try {
    const data = await fetchNHLStatsRest<{ data: any[] }>(
      `goalie/savesByStrength?isAggregate=false&isGame=false&limit=80&cayenneExp=gameTypeId%3D${GAME_TYPE_REGULAR}%20and%20seasonId%3D${season}`
    );
    return (data.data || []).map((row): GoalieStrengthStats => ({
      playerId: row.playerId ?? 0,
      goalieFullName: row.goalieFullName ?? "",
      teamAbbrevs: row.teamAbbrevs ?? "",
      gamesPlayed: row.gamesPlayed ?? 0,
      savePct: row.savePct ?? 0,
      evSavePct: row.evSavePct ?? 0,
      evSaves: row.evSaves ?? 0,
      evShotsAgainst: row.evShotsAgainst ?? 0,
      ppSavePct: row.ppSavePct ?? 0,
      ppSaves: row.ppSaves ?? 0,
      ppShotsAgainst: row.ppShotsAgainst ?? 0,
      shSavePct: row.shSavePct ?? 0,
      shSaves: row.shSaves ?? 0,
      shShotsAgainst: row.shShotsAgainst ?? 0,
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// NHL Injury / Availability Rail
//
// SOURCE: api-web.nhle.com/v1/roster/{teamAbbrev}/current
//
// The NHL roster API returns player objects that include an `injuryStatus`
// field when a player is on IR, DTD, or otherwise unavailable.
// This is an officially-structured source (not HTML scraping).
//
// IMPORTANT UNCERTAINTY NOTES:
//   - The roster endpoint is updated by NHL Operations, not in real-time.
//   - Day-of-game scratch decisions (healthy scratches) are NOT reflected here.
//   - Injury status updates can lag by hours, especially for DTD players.
//   - "DTD" (day-to-day) is not confirmed OUT — player may still play.
//   - Pre-game lineups (confirmed scratches) are only available ~30-60min pregame.
//
// Certainty model:
//   - injuryStatus = "IR" or "IR-NR" → HIGH certainty player is out (confirmed by NHL ops)
//   - injuryStatus = "DTD"           → LOW certainty — may or may not play
//   - injuryStatus absent/null       → NOT CONFIRMED AVAILABLE (healthy scratch possible)
//   - Pre-game PBP lineup            → HIGHEST certainty (post-warmup only)
//
// This is the best structured injury data available without a paid API.
// All statuses are stamped with certainty tier and source notes.
// ──────────────────────────────────────────────────────────────────────

export type PlayerInjuryStatus = {
  playerId: number;
  playerName: string;
  position: string;
  /** Raw injuryStatus value from NHL API (e.g. "IR", "DTD", "IR-NR") */
  rawStatus: string;
  /**
   * Certainty tier for how confident we are this player is unavailable.
   *
   * "confirmed_out": Player is on IR/IR-NR per NHL Operations. Will not dress.
   *                  Source: NHL roster API injuryStatus = "IR" | "IR-NR" | "LTIR".
   *
   * "day_to_day":   Player is DTD per NHL Operations. May or may not play.
   *                  Treat as uncertain — do NOT assume unavailable.
   *                  Source: NHL roster API injuryStatus = "DTD".
   *
   * "unverified":   Status came from a non-official source (e.g. news URL slug).
   *                  Do not use for high-confidence decisions.
   */
  certainty: "confirmed_out" | "day_to_day" | "unverified";
  /**
   * Whether this player should be considered unavailable for model/pick purposes.
   * true only for "confirmed_out" (IR/IR-NR). DTD is NOT assumed unavailable.
   */
  likelyUnavailable: boolean;
  source: "nhl-roster-api";
  /** ISO timestamp when this status was fetched */
  fetchedAt: string;
  /**
   * Explicit uncertainty note for consumers.
   * Always surface this — do not suppress uncertainty.
   */
  uncertaintyNote: string;
};

export type TeamInjuryReport = {
  teamAbbrev: string;
  /** Players with a confirmed injury status from NHL API */
  players: PlayerInjuryStatus[];
  /** Count of confirmed-out players */
  confirmedOutCount: number;
  /** Count of day-to-day players (uncertain) */
  dayToDayCount: number;
  /** True if any key players (any position) are confirmed out */
  hasConfirmedInjuries: boolean;
  source: "nhl-roster-api";
  fetchedAt: string;
  /**
   * Explicit rail limitation note.
   * Consumers MUST surface this note to avoid over-confidence.
   */
  railNote: string;
};

const INJURY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — injuries change daily

/**
 * Fetch confirmed injury statuses for a team's roster from the NHL API.
 *
 * SOURCE: api-web.nhle.com/v1/roster/{teamAbbrev}/current
 *
 * Returns all players with a non-null injuryStatus field.
 * The `injuryStatus` field is populated by NHL Operations and is the most
 * reliable structured injury source available without a paid API.
 *
 * LIMITATIONS (always surface these):
 *   - Healthy scratches (coach decisions) are NOT exposed in this endpoint
 *   - DTD status is uncertain — player may dress regardless
 *   - Status updates can lag up to a few hours after official announcements
 *   - Pre-game availability is only confirmed via lineup/warmup (1hr pre-game)
 *
 * @param teamAbbrev NHL team abbreviation (e.g. "TOR", "EDM")
 * @returns TeamInjuryReport (empty player list if no injuries or API unavailable)
 */
export async function getNHLTeamInjuries(teamAbbrev: string): Promise<TeamInjuryReport> {
  const cacheKey = `injuries:${teamAbbrev}`;
  const fetchedAt = new Date().toISOString();

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < INJURY_CACHE_TTL) {
    return cached.data as TeamInjuryReport;
  }

  const railNote =
    "NHL roster API (api-web.nhle.com/v1/roster) provides structured injury status (IR/DTD/IR-NR). " +
    "Healthy scratches are NOT available. DTD status is uncertain. " +
    "Day-of-game scratch decisions are only confirmed via lineup announcements (~1hr pre-game). " +
    "Do not treat absent injury status as confirmed availability.";

  try {
    const data = await cachedFetch<any>(
      `${NHL_BASE}/roster/${teamAbbrev}/current`,
      INJURY_CACHE_TTL
    );

    const allPlayers = [
      ...(data.forwards ?? []).map((p: any) => ({ ...p, pos: "F" })),
      ...(data.defensemen ?? []).map((p: any) => ({ ...p, pos: "D" })),
      ...(data.goalies ?? []).map((p: any) => ({ ...p, pos: "G" })),
    ];

    const injuredPlayers: PlayerInjuryStatus[] = [];
    for (const p of allPlayers) {
      // injuryStatus is absent (undefined/null) for healthy players — field only
      // appears in the NHL API response when a player has an active injury designation.
      const rawStatus: string | null = (typeof p.injuryStatus === "string" && p.injuryStatus.trim().length > 0)
        ? p.injuryStatus.trim()
        : null;
      if (!rawStatus) continue; // No injury status = not on injury list

      const statusUpper = rawStatus.toUpperCase();
      let certainty: PlayerInjuryStatus["certainty"];
      let likelyUnavailable: boolean;
      let uncertaintyNote: string;

      if (statusUpper === "DTD") {
        certainty = "day_to_day";
        likelyUnavailable = false;
        uncertaintyNote =
          `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""} is day-to-day per NHL Operations roster. ` +
          "DTD status does NOT confirm unavailability — player may dress. " +
          "Monitor lineup announcements closer to game time for confirmation.";
      } else if (["IR", "IR-NR", "LTIR", "10-DAY", "60-DAY"].includes(statusUpper) || statusUpper.startsWith("IR")) {
        certainty = "confirmed_out";
        likelyUnavailable = true;
        uncertaintyNote =
          `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""} is on ${rawStatus} per NHL Operations. ` +
          "High confidence unavailable for upcoming games. " +
          "Status sourced directly from NHL roster API (structured, not scraped).";
      } else {
        certainty = "unverified";
        likelyUnavailable = false;
        uncertaintyNote =
          `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""} has injuryStatus='${rawStatus}' — unrecognized status code. ` +
          "Treat as uncertain. Monitor official team communications.";
      }

      injuredPlayers.push({
        playerId: p.id ?? 0,
        playerName: `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim(),
        position: p.positionCode ?? p.pos ?? "?",
        rawStatus,
        certainty,
        likelyUnavailable,
        source: "nhl-roster-api",
        fetchedAt,
        uncertaintyNote,
      });
    }

    const report: TeamInjuryReport = {
      teamAbbrev,
      players: injuredPlayers,
      confirmedOutCount: injuredPlayers.filter(p => p.certainty === "confirmed_out").length,
      dayToDayCount: injuredPlayers.filter(p => p.certainty === "day_to_day").length,
      hasConfirmedInjuries: injuredPlayers.some(p => p.certainty === "confirmed_out"),
      source: "nhl-roster-api",
      fetchedAt,
      railNote,
    };

    cache.set(cacheKey, { data: report, timestamp: Date.now() });
    return report;
  } catch {
    // API unavailable — return empty report with honest note
    const empty: TeamInjuryReport = {
      teamAbbrev,
      players: [],
      confirmedOutCount: 0,
      dayToDayCount: 0,
      hasConfirmedInjuries: false,
      source: "nhl-roster-api",
      fetchedAt,
      railNote: railNote + " [UNAVAILABLE: NHL roster API did not respond — injury statuses unknown.]",
    };
    cache.set(cacheKey, { data: empty, timestamp: 5 * 60 * 1000 }); // short cache on failure
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
