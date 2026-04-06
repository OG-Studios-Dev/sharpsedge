/**
 * PGA Fallback Odds Scraper
 *
 * This module provides backup odds capture for PGA pre-tournament markets
 * when the primary Bovada scraper fails or returns partial data.
 *
 * SOURCES (in priority order):
 * 1. The Odds API (ODDS_API_KEY_2) — real outright winner lines from
 *    BetRivers, BetMGM, BetOnline, etc. for major tournaments.
 *    Coverage: winner (outrights) only; no Top 5/10/20 via this API.
 *
 * 2. BettingPros — JS-rendered site; cannot be auto-scraped without a
 *    headless browser. Included as a stub that always returns [] with a
 *    logged limitation note. Activate manually or via Playwright if needed.
 *
 * PROVENANCE: every line includes player, market, odds, source, source_url,
 * captured_at, tournament, book. No fabrication — zero lines returned if
 * a source is unavailable.
 *
 * INTENDED USE: called only when primary Bovada scraper returns <10 winner
 * lines or empty markets for a given market type.
 */

export type FallbackMarket =
  | "winner"
  | "top5"
  | "top10"
  | "top20"
  | "top40"
  | "make_cut"
  | "miss_cut"
  | "h2h";

export interface FallbackOddsLine {
  player: string;
  market: FallbackMarket;
  odds: number; // American format
  source: string;
  source_url: string | null;
  captured_at: string; // ISO timestamp
  tournament: string;
  book: string | null;
  event_id: string | null;
  is_fallback: true;
}

export interface FallbackCaptureResult {
  source: string;
  tournament: string;
  lines: FallbackOddsLine[];
  marketsFound: FallbackMarket[];
  error: string | null;
  limitation: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEnv(key: string): string {
  return (process.env[key] ?? "").replace(/^"|"$/g, "").trim();
}

// Golf sport keys for The Odds API (major tournaments only)
const ODDS_API_GOLF_SPORT_KEYS = [
  "golf_masters_tournament_winner",
  "golf_pga_championship_winner",
  "golf_us_open_winner",
  "golf_the_open_championship_winner",
];

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

// ─── Source 1: The Odds API (key 2) ──────────────────────────────────────────

interface OddsApiOutcome {
  name?: string;
  price?: number;
}

interface OddsApiMarket {
  key?: string;
  outcomes?: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  title?: string;
  markets?: OddsApiMarket[];
}

interface OddsApiEvent {
  id?: string;
  sport_title?: string;
  commence_time?: string;
  bookmakers?: OddsApiBookmaker[];
}

async function fetchOddsApiGolfOutrights(
  sportKey: string,
  apiKey: string,
): Promise<OddsApiEvent[]> {
  const url = `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american`;
  try {
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    return (await res.json()) as OddsApiEvent[];
  } catch {
    return [];
  }
}

export async function captureFromOddsApi(): Promise<FallbackCaptureResult[]> {
  // Use rotating key pool instead of hardcoded key 2
  const keyPool = [
    normalizeEnv("ODDS_API_KEY"),
    normalizeEnv("ODDS_API_KEY_2"),
    normalizeEnv("ODDS_API_KEY_3"),
  ].filter((k) => k && k !== "your_key_here");
  const apiKey = keyPool[0];
  if (!apiKey) {
    return [];
  }

  const results: FallbackCaptureResult[] = [];
  const now = new Date().toISOString();

  for (const sportKey of ODDS_API_GOLF_SPORT_KEYS) {
    const events = await fetchOddsApiGolfOutrights(sportKey, apiKey);
    if (events.length === 0) continue;

    const event = events[0]; // One event per sport key
    const tournament = event.sport_title ?? sportKey.replace(/_/g, " ");
    const eventId = event.id ?? sportKey;
    const sourceUrl = `${ODDS_API_BASE}/sports/${sportKey}/odds`;

    const lines: FallbackOddsLine[] = [];

    // Collect best odds per player across all bookmakers
    const bestOdds = new Map<string, { odds: number; book: string }>();

    for (const bookmaker of event.bookmakers ?? []) {
      const book = bookmaker.title?.trim() ?? "unknown";
      for (const market of bookmaker.markets ?? []) {
        if (market.key !== "outrights") continue;
        for (const outcome of market.outcomes ?? []) {
          const player = outcome.name?.trim();
          const odds = outcome.price;
          if (!player || typeof odds !== "number") continue;

          const existing = bestOdds.get(player);
          // Keep best (highest) odds for the player
          if (!existing || odds > existing.odds) {
            bestOdds.set(player, { odds, book });
          }
        }
      }
    }

    for (const [player, { odds, book }] of Array.from(bestOdds)) {
      lines.push({
        player,
        market: "winner",
        odds,
        source: "theoddsapi",
        source_url: sourceUrl,
        captured_at: now,
        tournament,
        book,
        event_id: eventId,
        is_fallback: true,
      });
    }

    results.push({
      source: "theoddsapi",
      tournament,
      lines,
      marketsFound: lines.length > 0 ? ["winner"] : [],
      error: null,
      limitation:
        "The Odds API covers outrights (tournament winner) only for golf. " +
        "Top 5/10/20 and make-cut props are not available via this API. " +
        "For those markets, the primary Bovada scraper must succeed.",
    });
  }

  return results;
}

// ─── Source 2: BettingPros stub ───────────────────────────────────────────────

/**
 * BettingPros scraper stub.
 *
 * BettingPros (bettingpros.com) does carry PGA Top 5/10/20/winner/make-cut
 * odds from multiple books on pages like:
 *   /golf/odds/player-props/top-5/
 *   /golf/odds/player-props/top-10/
 *   /golf/odds/player-props/tournament-winner/
 *   /golf/odds/player-props/make-cut/
 *
 * LIMITATION: The site renders all odds client-side via JavaScript.
 * A plain fetch() returns the page shell only — no odds data.
 * Auto-capture requires a headless browser (Playwright/Puppeteer) which
 * is not feasible in a Vercel serverless environment.
 *
 * This stub always returns [] with the limitation documented.
 * To use BettingPros as a live source:
 *   1. Run a Playwright script locally or on a headless-capable server
 *   2. POST the captured lines to /api/admin/pga-fallback-capture
 *   3. The route stores them with provenance intact
 */
export async function captureFromBettingPros(): Promise<FallbackCaptureResult[]> {
  const BETTINGPROS_GOLF_URLS: Record<FallbackMarket, string> = {
    winner:
      "https://www.bettingpros.com/golf/odds/player-props/tournament-winner/",
    top5: "https://www.bettingpros.com/golf/odds/player-props/top-5/",
    top10: "https://www.bettingpros.com/golf/odds/player-props/top-10/",
    top20: "https://www.bettingpros.com/golf/odds/player-props/top-20/",
    top40: "https://www.bettingpros.com/golf/odds/player-props/top-40/",
    make_cut: "https://www.bettingpros.com/golf/odds/player-props/make-cut/",
    miss_cut: "https://www.bettingpros.com/golf/odds/player-props/miss-cut/",
    h2h: "https://www.bettingpros.com/golf/matchups/",
  };

  return [
    {
      source: "bettingpros",
      tournament: "unknown",
      lines: [],
      marketsFound: [],
      error: null,
      limitation:
        "BettingPros renders odds client-side via JavaScript. " +
        "Auto-capture is not possible in a serverless environment. " +
        "To use BettingPros as a live source: run a Playwright script " +
        "and POST results to /api/admin/pga-fallback-capture. " +
        "Relevant BettingPros URLs: " +
        Object.entries(BETTINGPROS_GOLF_URLS)
          .map(([m, u]) => `${m}: ${u}`)
          .join(", "),
    },
  ];
}

// ─── Primary fallback coordinator ─────────────────────────────────────────────

/**
 * Run all fallback capture sources in parallel.
 * Returns all lines collected, with full provenance.
 * Never fabricates. If a source fails, it logs a limitation and returns [].
 */
export async function runFallbackCapture(): Promise<{
  allLines: FallbackOddsLine[];
  results: FallbackCaptureResult[];
  summary: {
    totalLines: number;
    byMarket: Record<string, number>;
    bySource: Record<string, number>;
    tournamentsFound: string[];
    limitations: string[];
  };
}> {
  const [oddsApiResults, bettingProsResults] = await Promise.all([
    captureFromOddsApi(),
    captureFromBettingPros(),
  ]);

  const results = [...oddsApiResults, ...bettingProsResults];
  const allLines = results.flatMap((r) => r.lines);

  const byMarket: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const tournamentsSet = new Set<string>();
  const limitations: string[] = [];

  for (const r of results) {
    if (r.limitation) limitations.push(r.limitation);
    bySource[r.source] = (bySource[r.source] ?? 0) + r.lines.length;
    if (r.tournament && r.tournament !== "unknown") tournamentsSet.add(r.tournament);
  }
  for (const line of allLines) {
    byMarket[line.market] = (byMarket[line.market] ?? 0) + 1;
  }

  return {
    allLines,
    results,
    summary: {
      totalLines: allLines.length,
      byMarket,
      bySource,
      tournamentsFound: Array.from(tournamentsSet),
      limitations,
    },
  };
}
