/**
 * nba-handle.ts
 *
 * NBA public betting handle and ticket splits ingestion.
 *
 * Source: Action Network public scoreboard API (no key required, server-side only).
 * Endpoint: https://api.actionnetwork.com/web/v1/scoreboard/nba
 *
 * Returns per-game public money % (handle) and ticket % for moneyline and spread.
 *
 * Field naming convention from Action Network:
 *   *_public → % of tickets (bet count)
 *   *_money  → % of handle (dollar amount wagered)
 *
 * ⚠️  Terms of service note:
 * Action Network's public scoreboard endpoint is undocumented but widely used
 * for public research. This module is for internal/research use. If Goosalytics
 * commercializes, migrate to a licensed splits feed (e.g. The Odds API Pro,
 * BettingPros API, or Sportradar).
 *
 * Cache: 60 minutes (splits shift slowly; over-polling won't improve freshness).
 */

const AN_BASE = "https://api.actionnetwork.com/web/v1/scoreboard/nba";
// bookIds: consensus / aggregate public-facing books (DraftKings=15, FanDuel=30, BetMGM=76, etc.)
const AN_BOOK_IDS = "15,30,76,75,123,69,68,72,247,79";
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export type NBAHandleSplits = {
  /** Action Network internal game ID */
  anGameId: number;
  /** Away team abbreviation (e.g. "LAC") */
  awayAbbr: string;
  /** Home team abbreviation (e.g. "GSW") */
  homeAbbr: string;
  /** Away team full name */
  awayName: string;
  /** Home team full name */
  homeName: string;
  /** ISO 8601 game start time */
  startTime: string;
  /** Game status: "scheduled" | "in_progress" | "complete" */
  status: string;

  // Moneyline handle splits
  /** % of moneyline handle on home team (dollars bet) */
  mlHomeMoneyPct: number | null;
  /** % of moneyline handle on away team (dollars bet) */
  mlAwayMoneyPct: number | null;
  /** % of moneyline tickets on home team (bet count) */
  mlHomeTicketPct: number | null;
  /** % of moneyline tickets on away team (bet count) */
  mlAwayTicketPct: number | null;

  // Spread handle splits
  /** % of spread handle on home team */
  spreadHomeMoneyPct: number | null;
  /** % of spread handle on away team */
  spreadAwayMoneyPct: number | null;
  /** % of spread tickets on home team */
  spreadHomeTicketPct: number | null;
  /** % of spread tickets on away team */
  spreadAwayTicketPct: number | null;

  // Current consensus moneyline (from AN consensus book, bookId=15)
  homeML: number | null;
  awayML: number | null;
  /** Spread from the away team's perspective (negative = away is favored) */
  spreadAway: number | null;
  /** Total points line */
  total: number | null;

  /** Number of bets tracked for this game (data quality proxy) */
  numBets: number;
  /** ISO timestamp when this was last fetched/updated */
  fetchedAt: string;
  /** Whether splits were present in the response (false = API returned game but no splits data) */
  splitsAvailable: boolean;
};

export type NBAHandleBoard = {
  games: NBAHandleSplits[];
  fetchedAt: string;
  /** Date string queried (YYYYMMDD) */
  queryDate: string;
  source: "action-network";
};

// ── Internal AN response types ─────────────────────────────────────────────────

type ANTeam = {
  id: number;
  abbr: string;
  full_name: string;
  display_name: string;
};

type ANOddsRow = {
  book_id: number;
  ml_home: number | null;
  ml_away: number | null;
  spread_away: number | null;
  spread_home: number | null;
  total: number | null;
  ml_home_public: number | null;
  ml_away_public: number | null;
  ml_home_money: number | null;
  ml_away_money: number | null;
  spread_home_public: number | null;
  spread_away_public: number | null;
  spread_home_money: number | null;
  spread_away_money: number | null;
  num_bets: number | null;
};

type ANGame = {
  id: number;
  status: string;
  real_status: string;
  start_time: string;
  teams: ANTeam[];
  odds: ANOddsRow[];
  away_team_id: number;
  home_team_id: number;
};

type ANResponse = {
  games: ANGame[];
};

// ── Module-level cache ────────────────────────────────────────────────────────

type CacheEntry = { board: NBAHandleBoard; expiresAt: number };
let _cache: CacheEntry | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayYYYYMMDD(): string {
  // Use US/Eastern wall clock for NBA day boundaries
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    .replace(/-/g, "");
}

function nullableNum(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Pick the "consensus" odds row from an AN game.
 * Prefers bookId=15 (DraftKings — highest bets volume on AN), then the first row with splits.
 */
function pickConsensusOddsRow(odds: ANOddsRow[]): ANOddsRow | null {
  if (!odds?.length) return null;
  const dk = odds.find((o) => o.book_id === 15);
  if (dk && (dk.ml_home_money != null || dk.spread_home_money != null)) return dk;
  // Fallback: first row that has any splits data
  return odds.find((o) => o.ml_home_money != null || o.spread_home_money != null) ?? odds[0] ?? null;
}

function resolveTeams(game: ANGame): { away: ANTeam; home: ANTeam } | null {
  const teams = game.teams ?? [];
  const away = teams.find((t) => t.id === game.away_team_id);
  const home = teams.find((t) => t.id === game.home_team_id);
  if (!away || !home) return null;
  return { away, home };
}

function mapGame(game: ANGame): NBAHandleSplits | null {
  const resolved = resolveTeams(game);
  if (!resolved) return null;
  const { away, home } = resolved;

  const row = pickConsensusOddsRow(game.odds ?? []);
  const splitsAvailable = Boolean(
    row && (row.ml_home_money != null || row.spread_home_money != null)
  );

  return {
    anGameId: game.id,
    awayAbbr: away.abbr,
    homeAbbr: home.abbr,
    awayName: away.full_name,
    homeName: home.full_name,
    startTime: game.start_time,
    status: game.real_status ?? game.status ?? "unknown",

    mlHomeMoneyPct: row ? nullableNum(row.ml_home_money) : null,
    mlAwayMoneyPct: row ? nullableNum(row.ml_away_money) : null,
    mlHomeTicketPct: row ? nullableNum(row.ml_home_public) : null,
    mlAwayTicketPct: row ? nullableNum(row.ml_away_public) : null,

    spreadHomeMoneyPct: row ? nullableNum(row.spread_home_money) : null,
    spreadAwayMoneyPct: row ? nullableNum(row.spread_away_money) : null,
    spreadHomeTicketPct: row ? nullableNum(row.spread_home_public) : null,
    spreadAwayTicketPct: row ? nullableNum(row.spread_away_public) : null,

    homeML: row ? nullableNum(row.ml_home) : null,
    awayML: row ? nullableNum(row.ml_away) : null,
    spreadAway: row ? nullableNum(row.spread_away) : null,
    total: row ? nullableNum(row.total) : null,

    numBets: row?.num_bets ?? 0,
    fetchedAt: new Date().toISOString(),
    splitsAvailable,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch today's NBA handle/splits board from Action Network.
 * Cached for 60 minutes. Returns empty board on fetch failure.
 */
export async function getNBAHandleBoard(dateYYYYMMDD?: string): Promise<NBAHandleBoard> {
  const queryDate = dateYYYYMMDD ?? todayYYYYMMDD();

  // Return cache if still fresh and same date
  if (_cache && Date.now() < _cache.expiresAt && _cache.board.queryDate === queryDate) {
    return _cache.board;
  }

  const url = `${AN_BASE}?period=game&bookIds=${AN_BOOK_IDS}&date=${queryDate}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "application/json",
      },
      // Next.js: do not cache at edge — we manage cache ourselves
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[nba-handle] AN API returned ${res.status} for ${url}`);
      return emptyBoard(queryDate);
    }

    const raw: ANResponse = await res.json();
    const games = (raw.games ?? [])
      .map(mapGame)
      .filter((g): g is NBAHandleSplits => g !== null);

    const board: NBAHandleBoard = {
      games,
      fetchedAt: new Date().toISOString(),
      queryDate,
      source: "action-network",
    };

    _cache = { board, expiresAt: Date.now() + CACHE_TTL_MS };
    return board;
  } catch (err) {
    console.warn("[nba-handle] fetch failed:", err);
    return emptyBoard(queryDate);
  }
}

function emptyBoard(queryDate: string): NBAHandleBoard {
  return {
    games: [],
    fetchedAt: new Date().toISOString(),
    queryDate,
    source: "action-network",
  };
}

/**
 * Look up handle splits for a specific game by team abbreviations.
 * Checks both home/away directions to handle abbreviation normalization.
 */
export function findHandleSplitsForGame(
  board: NBAHandleBoard,
  homeAbbr: string,
  awayAbbr: string
): NBAHandleSplits | null {
  const homeLower = homeAbbr.toLowerCase();
  const awayLower = awayAbbr.toLowerCase();
  return (
    board.games.find(
      (g) =>
        g.homeAbbr.toLowerCase() === homeLower &&
        g.awayAbbr.toLowerCase() === awayLower
    ) ?? null
  );
}

// ── System qualifier helpers ──────────────────────────────────────────────────

/**
 * Returns true if the home team has majority moneyline handle (≥ 55% of ML handle dollars).
 * "Majority" threshold: 55%+. "Super-majority" threshold: 65%+.
 */
export function homeHasMajorityMLHandle(splits: NBAHandleSplits, threshold = 55): boolean {
  if (splits.mlHomeMoneyPct == null) return false;
  return splits.mlHomeMoneyPct >= threshold;
}

/**
 * Returns true if the home team is a moneyline underdog (homeML > 0 in American odds).
 */
export function homeIsMoneylineUnderdog(splits: NBAHandleSplits): boolean {
  if (splits.homeML == null) return false;
  return splits.homeML > 0;
}

/**
 * Returns true if the spread is "close" — home team spread is between -4 and +4.
 * Tight-spread games are more likely to be genuinely competitive.
 */
export function isCloseSpread(splits: NBAHandleSplits, maxSpreadAbs = 4): boolean {
  // spreadAway is from away team perspective; home spread = -spreadAway
  if (splits.spreadAway == null) return false;
  const homeSpread = -splits.spreadAway;
  return Math.abs(homeSpread) <= maxSpreadAbs;
}

/**
 * System qualifier: Home underdog with majority ML handle.
 *
 * Fires when:
 *  - Home team is a moneyline underdog (homeML > 0)
 *  - Home team has ≥ 55% of ML handle dollars
 *  - Splits data is available (splitsAvailable = true)
 */
export function qualifiesHomeUnderdogMajorityHandle(splits: NBAHandleSplits): boolean {
  return (
    splits.splitsAvailable &&
    homeIsMoneylineUnderdog(splits) &&
    homeHasMajorityMLHandle(splits, 55)
  );
}

/**
 * System qualifier: Home super-majority handle in close games.
 *
 * Fires when:
 *  - Home team has ≥ 65% of ML handle dollars (super-majority)
 *  - The game spread is within ±4 points (close game)
 *  - Splits data is available
 */
export function qualifiesHomeSuperMajorityHandleCloseGame(splits: NBAHandleSplits): boolean {
  return (
    splits.splitsAvailable &&
    homeHasMajorityMLHandle(splits, 65) &&
    isCloseSpread(splits, 4)
  );
}
