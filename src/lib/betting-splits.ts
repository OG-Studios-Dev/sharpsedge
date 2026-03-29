/**
 * betting-splits.ts
 * Cross-sport public betting splits ingestion rail.
 *
 * Primary source:   Action Network / DraftKings splits (bookId=15, source="action-network-dk").
 * Comparison source: Action Network / FanDuel splits (bookId=30, source="action-network-fd").
 *
 * Endpoint pattern:
 *   https://api.actionnetwork.com/web/v1/scoreboard/{sport}?bookIds={id}&date=YYYYMMDD
 *   No API key required. Server-side only.
 *
 * Covered sports: NBA, NHL, MLB, NFL.
 * PGA: excluded — no meaningful public splits source.
 *
 * Source strategy (double-fallback / comparison):
 *   1. Fetch DK splits (primary).
 *   2. Fetch FD splits in the same call (comparison).
 *   3. If DK data is missing for a game, FD becomes the fallback.
 *   4. Both snapshots are retained with attribution so consumers can:
 *       - use primary when available
 *       - fall back when primary is missing
 *       - compare source agreement/disagreement
 *
 * VSIN and Covers.com status:
 *   - VSIN: No public free splits API available; paywalled. Cannot ingest without credentials.
 *   - Covers.com: Only returns HTML pages, no public JSON API for splits. Cannot ingest.
 *   These are documented blockers. DK vs FD comparison is the best available dual-source split.
 *
 * Normalized fields per split entry (minimum required):
 *   sport, source, sourceRole, marketType, matchup, teams, side/label,
 *   betsPercent, handlePercent, line (if available), gameDate, snapshotAt,
 *   isPrimary (whether this row is primary vs comparison/fallback)
 */

export type BettingSplitsSport = "NBA" | "NHL" | "MLB" | "NFL";
export type BettingSplitsMarketType = "moneyline" | "spread" | "total";
export type BettingSplitsSide = "home" | "away" | "over" | "under";
export type BettingSplitsSource = "action-network-dk" | "action-network-fd";
export type BettingSplitsSourceRole = "primary" | "comparison" | "fallback";

export type BettingSplitsEntry = {
  /** Sport identifier */
  sport: BettingSplitsSport;
  /** Data source name */
  source: BettingSplitsSource;
  /** Role of this source in the result set */
  sourceRole: BettingSplitsSourceRole;
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
  /** Whether this entry came from the primary source (true) or a comparison/fallback (false) */
  isPrimary: boolean;
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
  /** All normalized split entries for this game (may include entries from multiple sources) */
  splits: BettingSplitsEntry[];
  /** Primary source entries only */
  primarySplits: BettingSplitsEntry[];
  /** Comparison/fallback source entries only */
  comparisonSplits: BettingSplitsEntry[];
  /** Was moneyline splits data available from the primary source? */
  mlSplitsAvailable: boolean;
  /** Was spread splits data available from the primary source? */
  spreadSplitsAvailable: boolean;
  /** Was total splits data available from the primary source? */
  totalSplitsAvailable: boolean;
  /** Did the comparison source have splits for this game? */
  comparisonAvailable: boolean;
  /** Which source is actually authoritative for this game (primary if available, else fallback) */
  effectiveSource: BettingSplitsSource;
  /** Whether primary source data was used (vs falling back to comparison) */
  usingPrimary: boolean;
};

export type BettingSplitsBoardResult = {
  sport: BettingSplitsSport;
  gameDate: string;
  snapshotAt: string;
  games: BettingSplitsSnapshot[];
  /** Number of games with at least moneyline splits from any source */
  gamesWithSplits: number;
  /** Number of games with primary source data */
  gamesWithPrimarySource: number;
  /** Number of games using comparison/fallback source */
  gamesOnFallback: number;
  primarySource: BettingSplitsSource;
  comparisonSource: BettingSplitsSource;
  available: boolean;
  error: string | null;
};

// ── Book IDs ──────────────────────────────────────────────────────────────────

/** DraftKings on Action Network — primary source */
const DK_BOOK_ID = 15;
/** FanDuel on Action Network — comparison / fallback source */
const FD_BOOK_ID = 30;

const ACTION_NETWORK_SPORT_KEYS: Record<BettingSplitsSport, string> = {
  NBA: "nba",
  NHL: "nhl",
  MLB: "mlb",
  NFL: "nfl",
};

// ── Normalization helpers ─────────────────────────────────────────────────────

function formatGameDate(isoString: string): string {
  const parsed = new Date(isoString);
  if (isNaN(parsed.getTime())) return isoString.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function buildMatchup(awayAbbr: string, homeAbbr: string): string {
  return `${awayAbbr} @ ${homeAbbr}`;
}

function extractPct(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

function extractLine(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildSplitsFromOddsRow(
  oddsRow: Record<string, unknown>,
  sport: BettingSplitsSport,
  source: BettingSplitsSource,
  sourceRole: BettingSplitsSourceRole,
  matchup: string,
  awayAbbr: string,
  homeAbbr: string,
  snapshotAt: string,
  gameDate: string,
  gameId: number,
): BettingSplitsEntry[] {
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

  const isPrimary = sourceRole === "primary";
  const splits: BettingSplitsEntry[] = [];
  const base = { sport, source, sourceRole, matchup, awayTeam: awayAbbr, homeTeam: homeAbbr, snapshotAt, gameDate, actionNetworkGameId: gameId, isPrimary };

  if (mlAvailable) {
    splits.push({ ...base, marketType: "moneyline", side: "home", sideLabel: `${homeAbbr} (home)`, betsPercent: mlHomeBets, handlePercent: mlHomeHandle, line: null });
    splits.push({ ...base, marketType: "moneyline", side: "away", sideLabel: `${awayAbbr} (away)`, betsPercent: mlAwayBets, handlePercent: mlAwayHandle, line: null });
  }
  if (spreadAvailable) {
    splits.push({ ...base, marketType: "spread", side: "home", sideLabel: `${homeAbbr} ${spreadHome != null ? (spreadHome > 0 ? "+" : "") + spreadHome : "(home)"} spread`, betsPercent: spreadHomeBets, handlePercent: spreadHomeHandle, line: spreadHome });
    splits.push({ ...base, marketType: "spread", side: "away", sideLabel: `${awayAbbr} ${spreadAway != null ? (spreadAway > 0 ? "+" : "") + spreadAway : "(away)"} spread`, betsPercent: spreadAwayBets, handlePercent: spreadAwayHandle, line: spreadAway });
  }
  if (totalAvailable) {
    splits.push({ ...base, marketType: "total", side: "over", sideLabel: `Over ${totalLine ?? ""}`, betsPercent: totalOverBets, handlePercent: totalOverHandle, line: totalLine });
    splits.push({ ...base, marketType: "total", side: "under", sideLabel: `Under ${totalLine ?? ""}`, betsPercent: totalUnderBets, handlePercent: totalUnderHandle, line: totalLine });
  }
  return splits;
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

  const oddsRows = Array.isArray(game.odds) ? (game.odds as Array<Record<string, unknown>>) : [];

  const dkRow = oddsRows.find((o) => o.book_id === DK_BOOK_ID && (o.ml_home_public != null || o.spread_home_public != null || o.total_over_public != null)) ?? null;
  const fdRow = oddsRows.find((o) => o.book_id === FD_BOOK_ID && (o.ml_home_public != null || o.spread_home_public != null || o.total_over_public != null)) ?? null;

  // Determine primary vs fallback
  const hasPrimary = dkRow !== null;
  const hasComparison = fdRow !== null;

  // Build primary splits from DK row (if available), otherwise FD becomes the fallback primary
  let primarySplits: BettingSplitsEntry[] = [];
  let comparisonSplits: BettingSplitsEntry[] = [];

  if (hasPrimary) {
    primarySplits = buildSplitsFromOddsRow(
      dkRow!, sport, "action-network-dk", "primary",
      matchup, awayAbbr, homeAbbr, snapshotAt, gameDate, gameId,
    );
  }

  if (hasComparison) {
    const role: BettingSplitsSourceRole = hasPrimary ? "comparison" : "fallback";
    comparisonSplits = buildSplitsFromOddsRow(
      fdRow!, sport, "action-network-fd", role,
      matchup, awayAbbr, homeAbbr, snapshotAt, gameDate, gameId,
    );
  }

  // If no primary but has comparison, promote comparison to fallback primary
  const effectivePrimary = hasPrimary ? primarySplits : comparisonSplits;
  const allSplits = [...primarySplits, ...comparisonSplits];

  const mlPrimary = effectivePrimary.filter((s) => s.marketType === "moneyline");
  const spreadPrimary = effectivePrimary.filter((s) => s.marketType === "spread");
  const totalPrimary = effectivePrimary.filter((s) => s.marketType === "total");

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
    splits: allSplits,
    primarySplits,
    comparisonSplits,
    mlSplitsAvailable: mlPrimary.length > 0,
    spreadSplitsAvailable: spreadPrimary.length > 0,
    totalSplitsAvailable: totalPrimary.length > 0,
    comparisonAvailable: hasComparison,
    effectiveSource: hasPrimary ? "action-network-dk" : (hasComparison ? "action-network-fd" : "action-network-dk"),
    usingPrimary: hasPrimary,
  };
}

// ── Public fetch API ──────────────────────────────────────────────────────────

/**
 * Fetch betting splits board for one sport from Action Network.
 * Fetches both DK (primary) and FD (comparison) in a single request by including both bookIds.
 *
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
    // Fetch DK + FD in one call
    const url = `https://api.actionnetwork.com/web/v1/scoreboard/${sportKey}?bookIds=${DK_BOOK_ID},${FD_BOOK_ID}&date=${normalized}`;
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
        gamesWithPrimarySource: 0,
        gamesOnFallback: 0,
        primarySource: "action-network-dk",
        comparisonSource: "action-network-fd",
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
    const gamesWithPrimarySource = games.filter((g) => g.usingPrimary).length;
    const gamesOnFallback = games.filter((g) => !g.usingPrimary && g.comparisonAvailable).length;

    return {
      sport,
      gameDate,
      snapshotAt,
      games,
      gamesWithSplits,
      gamesWithPrimarySource,
      gamesOnFallback,
      primarySource: "action-network-dk",
      comparisonSource: "action-network-fd",
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
      gamesWithPrimarySource: 0,
      gamesOnFallback: 0,
      primarySource: "action-network-dk",
      comparisonSource: "action-network-fd",
      available: false,
      error: err instanceof Error ? err.message : "Unknown fetch error",
    };
  }
}

/**
 * Fetch betting splits for all covered sports at once.
 * Covered: NBA, NHL, MLB, NFL. PGA excluded — no meaningful splits source.
 * Each sport result includes both DK (primary) and FD (comparison) splits.
 *
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

// ── Lookup helpers ────────────────────────────────────────────────────────────

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
 * Prefers primary source entries; falls back to comparison/fallback if primary is missing.
 * Returns { side1: entry, side2: entry } for the resolved source.
 */
export function getMarketSplits(
  snapshot: BettingSplitsSnapshot,
  marketType: BettingSplitsMarketType,
  preferSource?: BettingSplitsSource,
): {
  side1: BettingSplitsEntry | null;
  side2: BettingSplitsEntry | null;
  resolvedSource: BettingSplitsSource | null;
} {
  // Prefer specified source, then primary, then any
  const ranked = preferSource
    ? [preferSource, snapshot.effectiveSource]
    : [snapshot.effectiveSource];

  const seen = new Set<BettingSplitsSource>();
  const order: BettingSplitsSource[] = [];
  for (const s of [...ranked, "action-network-dk" as BettingSplitsSource, "action-network-fd" as BettingSplitsSource]) {
    if (!seen.has(s)) { seen.add(s); order.push(s); }
  }
  for (const src of order) {
    const relevant = snapshot.splits.filter((s) => s.marketType === marketType && s.source === src);
    if (relevant.length === 0) continue;
    if (marketType === "total") {
      return {
        side1: relevant.find((s) => s.side === "over") ?? null,
        side2: relevant.find((s) => s.side === "under") ?? null,
        resolvedSource: src,
      };
    }
    return {
      side1: relevant.find((s) => s.side === "home") ?? null,
      side2: relevant.find((s) => s.side === "away") ?? null,
      resolvedSource: src,
    };
  }
  return { side1: null, side2: null, resolvedSource: null };
}

/**
 * Compute source agreement for a game/market.
 * Returns agreement as absolute percentage difference between DK and FD bets%.
 * Null if either source is missing data.
 */
export function computeSourceAgreement(
  snapshot: BettingSplitsSnapshot,
  marketType: BettingSplitsMarketType,
): {
  dkHomeBets: number | null;
  fdHomeBets: number | null;
  betsPercentDelta: number | null;
  dkHomeHandle: number | null;
  fdHomeHandle: number | null;
  handlePercentDelta: number | null;
  sourcesAgree: boolean | null;
} {
  const side = marketType === "total" ? "over" : "home";
  const dkEntry = snapshot.splits.find((s) => s.source === "action-network-dk" && s.marketType === marketType && s.side === side) ?? null;
  const fdEntry = snapshot.splits.find((s) => s.source === "action-network-fd" && s.marketType === marketType && s.side === side) ?? null;

  const dkBets = dkEntry?.betsPercent ?? null;
  const fdBets = fdEntry?.betsPercent ?? null;
  const dkHandle = dkEntry?.handlePercent ?? null;
  const fdHandle = fdEntry?.handlePercent ?? null;

  const betsDelta = dkBets !== null && fdBets !== null ? Math.abs(dkBets - fdBets) : null;
  const handleDelta = dkHandle !== null && fdHandle !== null ? Math.abs(dkHandle - fdHandle) : null;

  // Sources "agree" if bets% are within 10pp of each other
  const sourcesAgree = betsDelta !== null ? betsDelta <= 10 : null;

  return {
    dkHomeBets: dkBets,
    fdHomeBets: fdBets,
    betsPercentDelta: betsDelta,
    dkHomeHandle: dkHandle,
    fdHomeHandle: fdHandle,
    handlePercentDelta: handleDelta,
    sourcesAgree,
  };
}

// ── NBA Handle adapter ────────────────────────────────────────────────────────
//
// nba-handle.ts remains the authoritative NBA system qualifier module.
// This adapter allows the normalized splits rail to back NBA handle lookups
// as an alternative data path, reducing duplicate fetches.

export type NormalizedHandleView = {
  awayAbbr: string;
  homeAbbr: string;
  mlHomeMoneyPct: number | null;
  mlAwayMoneyPct: number | null;
  mlHomeTicketPct: number | null;
  mlAwayTicketPct: number | null;
  spreadHomeMoneyPct: number | null;
  spreadAwayMoneyPct: number | null;
  spreadHomeTicketPct: number | null;
  spreadAwayTicketPct: number | null;
  homeML: number | null;
  spreadAway: number | null;
  total: number | null;
  splitsAvailable: boolean;
  source: BettingSplitsSource;
  snapshotAt: string;
};

/**
 * Extract a handle-compatible view from a normalized BettingSplitsSnapshot.
 * Prefers the primary (DK) source; falls back to comparison (FD).
 */
export function toHandleView(snapshot: BettingSplitsSnapshot): NormalizedHandleView {
  const src = snapshot.effectiveSource;
  const byMarket = (mt: BettingSplitsMarketType, side: BettingSplitsSide) =>
    snapshot.splits.find((s) => s.source === src && s.marketType === mt && s.side === side) ?? null;

  const mlHome = byMarket("moneyline", "home");
  const mlAway = byMarket("moneyline", "away");
  const spreadHome = byMarket("spread", "home");
  const spreadAway = byMarket("spread", "away");
  const totalOver = byMarket("total", "over");

  return {
    awayAbbr: snapshot.awayTeam,
    homeAbbr: snapshot.homeTeam,
    mlHomeMoneyPct: mlHome?.handlePercent ?? null,
    mlAwayMoneyPct: mlAway?.handlePercent ?? null,
    mlHomeTicketPct: mlHome?.betsPercent ?? null,
    mlAwayTicketPct: mlAway?.betsPercent ?? null,
    spreadHomeMoneyPct: spreadHome?.handlePercent ?? null,
    spreadAwayMoneyPct: spreadAway?.handlePercent ?? null,
    spreadHomeTicketPct: spreadHome?.betsPercent ?? null,
    spreadAwayTicketPct: spreadAway?.betsPercent ?? null,
    homeML: null, // ML odds are not stored in splits entries
    spreadAway: spreadAway?.line ?? null,
    total: totalOver?.line ?? null,
    splitsAvailable: snapshot.mlSplitsAvailable || snapshot.spreadSplitsAvailable,
    source: src,
    snapshotAt: snapshot.snapshotAt,
  };
}
