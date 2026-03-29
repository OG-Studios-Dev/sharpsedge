/**
 * betting-splits.ts
 * Cross-sport public betting splits ingestion rail.
 *
 * Source: Action Network public scoreboard API (DraftKings-sourced splits, bookId=15).
 *   Endpoint: https://api.actionnetwork.com/web/v1/scoreboard/{sport}?bookIds=15&date=YYYYMMDD
 *   No API key required. Data is available for NBA, NHL, MLB, NFL.
 *   PGA is excluded — no meaningful public splits source from Action Network.
 *
 * Normalized fields per split entry:
 *   sport, source, marketType, matchup, teams, side/label,
 *   betsPercent, handlePercent, line (if available), snapshot timestamp, game date
 */

export type BettingSplitsSport = "NBA" | "NHL" | "MLB" | "NFL";
export type BettingSplitsMarketType = "moneyline" | "spread" | "total";
export type BettingSplitsSide = "home" | "away" | "over" | "under";

export type BettingSplitsEntry = {
  /** Sport identifier */
  sport: BettingSplitsSport;
  /** Data source name */
  source: "action-network-dk";
  /** Market type */
  marketType: BettingSplitsMarketType;
  /** Formatted matchup string e.g. "LAC @ MIL" */
  matchup: string;
  /** Away team abbreviation */
  awayTeam: string;
  /** Home team abbreviation */
  homeTeam: string;
  /** Which side this entry represents */
  side: BettingSplitsSide;
  /** Human-readable side label e.g. "MIL (home)" */
  sideLabel: string;
  /** Percentage of public tickets on this side (0–100, integer) */
  betsPercent: number | null;
  /** Percentage of public handle on this side (0–100, integer) */
  handlePercent: number | null;
  /** Spread or total line for context (null for moneyline market type) */
  line: number | null;
  /** ISO timestamp when this snapshot was taken */
  snapshotAt: string;
  /** Game date in YYYY-MM-DD */
  gameDate: string;
  /** Action Network internal game ID */
  actionNetworkGameId: number;
};

export type BettingSplitsSnapshot = {
  /** Action Network internal game ID */
  gameId: number;
  sport: BettingSplitsSport;
  /** e.g. "LAC @ MIL" */
  matchup: string;
  awayTeam: string;
  homeTeam: string;
  awayTeamFull: string;
  homeTeamFull: string;
  gameDate: string;
  startTime: string | null;
  /** ISO timestamp of when this snapshot was captured */
  snapshotAt: string;
  /** All normalized split entries for this game */
  splits: BettingSplitsEntry[];
  /** Was moneyline splits data available from the source? */
  mlSplitsAvailable: boolean;
  /** Was spread splits data available from the source? */
  spreadSplitsAvailable: boolean;
  /** Was total splits data available from the source? */
  totalSplitsAvailable: boolean;
};

export type BettingSplitsBoardResult = {
  sport: BettingSplitsSport;
  gameDate: string;
  snapshotAt: string;
  games: BettingSplitsSnapshot[];
  /** Number of games with at least moneyline splits */
  gamesWithSplits: number;
  source: "action-network-dk";
  available: boolean;
  error: string | null;
};

const ACTION_NETWORK_SPORT_KEYS: Record<BettingSplitsSport, string> = {
  NBA: "nba",
  NHL: "nhl",
  MLB: "mlb",
  NFL: "nfl",
};

// Book ID 15 = DraftKings on Action Network — most consistent for public splits
const DK_BOOK_ID = 15;

function formatGameDate(isoString: string): string {
  const parsed = new Date(isoString);
  if (isNaN(parsed.getTime())) return isoString.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function buildMatchup(awayAbbr: string, homeAbbr: string): string {
  return `${awayAbbr} @ ${homeAbbr}`;
}

function normalizeSnapshotFromGame(
  game: Record<string, unknown>,
  sport: BettingSplitsSport,
  snapshotAt: string,
): BettingSplitsSnapshot | null {
  const gameId = typeof game.id === "number" ? game.id : null;
  if (gameId === null) return null;

  const teams = Array.isArray(game.teams) ? (game.teams as Array<Record<string, unknown>>) : [];
  const awayTeam = teams[0] ?? {};
  const homeTeam = teams[1] ?? {};

  const awayAbbr = String(awayTeam.abbr ?? awayTeam.location ?? "AWAY");
  const homeAbbr = String(homeTeam.abbr ?? homeTeam.location ?? "HOME");
  const awayFull = String(awayTeam.full_name ?? awayAbbr);
  const homeFull = String(homeTeam.full_name ?? homeAbbr);
  const startTime = typeof game.start_time === "string" ? game.start_time : null;
  const gameDate = startTime ? formatGameDate(startTime) : "";

  const matchup = buildMatchup(awayAbbr, homeAbbr);

  // Find the primary game-type odds row with DK splits
  const oddsRows = Array.isArray(game.odds)
    ? (game.odds as Array<Record<string, unknown>>).filter(
        (o) =>
          o.type === "game" &&
          o.book_id === DK_BOOK_ID &&
          (o.ml_home_public != null || o.spread_home_public != null || o.total_over_public != null),
      )
    : [];

  const oddsRow: Record<string, unknown> = oddsRows[0] ?? {};

  // Helper to safely extract a percentage value (0–100)
  function extractPct(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
  }

  function extractLine(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  const mlHomeBets = extractPct(oddsRow.ml_home_public);
  const mlAwayBets = extractPct(oddsRow.ml_away_public);
  const mlHomeHandle = extractPct(oddsRow.ml_home_money);
  const mlAwayHandle = extractPct(oddsRow.ml_away_money);

  const spreadHomeBets = extractPct(oddsRow.spread_home_public);
  const spreadAwayBets = extractPct(oddsRow.spread_away_public);
  const spreadHomeHandle = extractPct(oddsRow.spread_home_money);
  const spreadAwayHandle = extractPct(oddsRow.spread_away_money);
  const spreadHome = extractLine(oddsRow.spread_home);
  const spreadAway = extractLine(oddsRow.spread_away);

  const totalOverBets = extractPct(oddsRow.total_over_public);
  const totalUnderBets = extractPct(oddsRow.total_under_public);
  const totalOverHandle = extractPct(oddsRow.total_over_money);
  const totalUnderHandle = extractPct(oddsRow.total_under_money);
  const totalLine = extractLine(oddsRow.total);

  const mlAvailable = mlHomeBets !== null || mlHomeHandle !== null;
  const spreadAvailable = spreadHomeBets !== null || spreadHomeHandle !== null;
  const totalAvailable = totalOverBets !== null || totalOverHandle !== null;

  const splits: BettingSplitsEntry[] = [];

  // Moneyline entries
  if (mlAvailable) {
    splits.push({
      sport,
      source: "action-network-dk",
      marketType: "moneyline",
      matchup,
      awayTeam: awayAbbr,
      homeTeam: homeAbbr,
      side: "home",
      sideLabel: `${homeAbbr} (home)`,
      betsPercent: mlHomeBets,
      handlePercent: mlHomeHandle,
      line: null,
      snapshotAt,
      gameDate,
      actionNetworkGameId: gameId,
    });
    splits.push({
      sport,
      source: "action-network-dk",
      marketType: "moneyline",
      matchup,
      awayTeam: awayAbbr,
      homeTeam: homeAbbr,
      side: "away",
      sideLabel: `${awayAbbr} (away)`,
      betsPercent: mlAwayBets,
      handlePercent: mlAwayHandle,
      line: null,
      snapshotAt,
      gameDate,
      actionNetworkGameId: gameId,
    });
  }

  // Spread entries
  if (spreadAvailable) {
    splits.push({
      sport,
      source: "action-network-dk",
      marketType: "spread",
      matchup,
      awayTeam: awayAbbr,
      homeTeam: homeAbbr,
      side: "home",
      sideLabel: `${homeAbbr} ${spreadHome != null ? (spreadHome > 0 ? "+" : "") + spreadHome : "(home)"} spread`,
      betsPercent: spreadHomeBets,
      handlePercent: spreadHomeHandle,
      line: spreadHome,
      snapshotAt,
      gameDate,
      actionNetworkGameId: gameId,
    });
    splits.push({
      sport,
      source: "action-network-dk",
      marketType: "spread",
      matchup,
      awayTeam: awayAbbr,
      homeTeam: homeAbbr,
      side: "away",
      sideLabel: `${awayAbbr} ${spreadAway != null ? (spreadAway > 0 ? "+" : "") + spreadAway : "(away)"} spread`,
      betsPercent: spreadAwayBets,
      handlePercent: spreadAwayHandle,
      line: spreadAway,
      snapshotAt,
      gameDate,
      actionNetworkGameId: gameId,
    });
  }

  // Total entries
  if (totalAvailable) {
    splits.push({
      sport,
      source: "action-network-dk",
      marketType: "total",
      matchup,
      awayTeam: awayAbbr,
      homeTeam: homeAbbr,
      side: "over",
      sideLabel: `Over ${totalLine ?? ""}`,
      betsPercent: totalOverBets,
      handlePercent: totalOverHandle,
      line: totalLine,
      snapshotAt,
      gameDate,
      actionNetworkGameId: gameId,
    });
    splits.push({
      sport,
      source: "action-network-dk",
      marketType: "total",
      matchup,
      awayTeam: awayAbbr,
      homeTeam: homeAbbr,
      side: "under",
      sideLabel: `Under ${totalLine ?? ""}`,
      betsPercent: totalUnderBets,
      handlePercent: totalUnderHandle,
      line: totalLine,
      snapshotAt,
      gameDate,
      actionNetworkGameId: gameId,
    });
  }

  return {
    gameId,
    sport,
    matchup,
    awayTeam: awayAbbr,
    homeTeam: homeAbbr,
    awayTeamFull: awayFull,
    homeTeamFull: homeFull,
    gameDate,
    startTime,
    snapshotAt,
    splits,
    mlSplitsAvailable: mlAvailable,
    spreadSplitsAvailable: spreadAvailable,
    totalSplitsAvailable: totalAvailable,
  };
}

/**
 * Fetch betting splits board for one sport from Action Network.
 * @param sport - "NBA" | "NHL" | "MLB" | "NFL"
 * @param date - YYYYMMDD format (e.g. "20260329") or YYYY-MM-DD
 */
export async function getBettingSplits(
  sport: BettingSplitsSport,
  date: string,
): Promise<BettingSplitsBoardResult> {
  const snapshotAt = new Date().toISOString();
  const normalized = date.replace(/-/g, "");
  const gameDate = `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  const sportKey = ACTION_NETWORK_SPORT_KEYS[sport];

  try {
    const url = `https://api.actionnetwork.com/web/v1/scoreboard/${sportKey}?bookIds=${DK_BOOK_ID}&date=${normalized}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Goosalytics/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        sport,
        gameDate,
        snapshotAt,
        games: [],
        gamesWithSplits: 0,
        source: "action-network-dk",
        available: false,
        error: `Action Network returned ${response.status} for ${sport} on ${gameDate}`,
      };
    }

    const json = (await response.json()) as Record<string, unknown>;
    const rawGames = Array.isArray(json.games) ? (json.games as Array<Record<string, unknown>>) : [];

    const games: BettingSplitsSnapshot[] = [];
    for (const rawGame of rawGames) {
      const snapshot = normalizeSnapshotFromGame(rawGame, sport, snapshotAt);
      if (snapshot) games.push(snapshot);
    }

    const gamesWithSplits = games.filter((g) => g.mlSplitsAvailable || g.spreadSplitsAvailable).length;

    return {
      sport,
      gameDate,
      snapshotAt,
      games,
      gamesWithSplits,
      source: "action-network-dk",
      available: true,
      error: null,
    };
  } catch (err) {
    return {
      sport,
      gameDate,
      snapshotAt,
      games: [],
      gamesWithSplits: 0,
      source: "action-network-dk",
      available: false,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

/**
 * Fetch betting splits for all covered sports at once.
 * Covered: NBA, NHL, MLB, NFL. PGA excluded — no meaningful splits source.
 * @param date - YYYY-MM-DD
 */
export async function getBettingSplitsCrossSport(
  date: string,
): Promise<Record<BettingSplitsSport, BettingSplitsBoardResult>> {
  const sports: BettingSplitsSport[] = ["NBA", "NHL", "MLB", "NFL"];
  const results = await Promise.all(sports.map((sport) => getBettingSplits(sport, date)));
  return Object.fromEntries(sports.map((sport, i) => [sport, results[i]])) as Record<
    BettingSplitsSport,
    BettingSplitsBoardResult
  >;
}

/**
 * Look up splits for a specific game by home+away team abbreviations from a board result.
 */
export function findGameSplits(
  board: BettingSplitsBoardResult,
  homeTeamAbbr: string,
  awayTeamAbbr: string,
): BettingSplitsSnapshot | null {
  const normalize = (s: string) => s.toUpperCase().trim();
  return (
    board.games.find(
      (g) =>
        normalize(g.homeTeam) === normalize(homeTeamAbbr) &&
        normalize(g.awayTeam) === normalize(awayTeamAbbr),
    ) ?? null
  );
}

/**
 * Get a specific market's splits from a snapshot.
 * Returns { home: BettingSplitsEntry, away: BettingSplitsEntry } for ml/spread,
 * or { over: BettingSplitsEntry, under: BettingSplitsEntry } for total.
 */
export function getMarketSplits(
  snapshot: BettingSplitsSnapshot,
  marketType: BettingSplitsMarketType,
): {
  side1: BettingSplitsEntry | null;
  side2: BettingSplitsEntry | null;
} {
  const relevant = snapshot.splits.filter((s) => s.marketType === marketType);
  if (marketType === "total") {
    return {
      side1: relevant.find((s) => s.side === "over") ?? null,
      side2: relevant.find((s) => s.side === "under") ?? null,
    };
  }
  return {
    side1: relevant.find((s) => s.side === "home") ?? null,
    side2: relevant.find((s) => s.side === "away") ?? null,
  };
}
