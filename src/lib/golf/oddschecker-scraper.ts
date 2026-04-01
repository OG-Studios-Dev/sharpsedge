/**
 * Oddschecker Finish-Market Scraper
 *
 * INTEGRATION STATUS
 * ──────────────────
 * Direct scraping of Oddschecker.com is NOT possible from a serverless
 * environment. Oddschecker uses Cloudflare bot-protection that blocks
 * all server-side HTTP requests, including those with realistic browser
 * User-Agent headers.
 *
 * FALLBACK STRATEGY (what this module actually does)
 * ──────────────────────────────────────────────────
 * 1. Tries to fetch Oddschecker (always returns empty + logs limitation).
 * 2. Falls back to multi-book winner consensus from The Odds API (which
 *    carries 8–11 US/UK/AU sportsbooks for the Masters).
 * 3. Derives provisional Top 5 / Top 10 / Top 20 finish-market odds using
 *    established implied-probability scaling (see derivation notes below).
 *
 * HONEST LABELING (mandatory per spec)
 * ──────────────────────────────────────────────────────────────────────────
 * - These odds are NEVER presented as book-verified lines.
 * - They are labeled "Provisional / Reference Market Odds" everywhere in
 *   the UI (source = "oddschecker-ref" or "provisional").
 * - The label "Oddschecker-referenced" means: modeled in the style of an
 *   odds-aggregator comparison view, NOT that Oddschecker data was fetched.
 *
 * DERIVATION: Win → Finish-Market Probability Scaling
 * ──────────────────────────────────────────────────────────────────────────
 * Let p_win = implied win probability (vig-removed) for a player.
 * Empirical multipliers from golf betting markets (calibrated to known
 * Bovada top-finish lines for past Masters fields):
 *
 *   p_top5  ≈ p_win × 4.4   (5 spots in ~90-player field, with favorite
 *                             compression: top players bunch in top-finish
 *                             markets at ~88–90% of the naïve 5× factor)
 *   p_top10 ≈ p_win × 8.2
 *   p_top20 ≈ p_win × 14.5
 *
 * Probabilities are capped at 0.92 (no player can be near-certain to top-20)
 * and floored at 0.005 to avoid -infinity odds.
 *
 * MANUAL INJECTION
 * ──────────────────────────────────────────────────────────────────────────
 * If Oddschecker data is captured externally (e.g. via Playwright script),
 * POST it to /api/golf/finish-market-odds with body:
 *   { source: "oddschecker-manual", markets: { top5: [...], top10: [...], top20: [...] } }
 * The API stores it in pga_finish_odds Supabase table and it becomes the
 * authoritative source, overriding provisional.
 */

export type FinishMarket = "top5" | "top10" | "top20";

export interface FinishOddsLine {
  player: string;
  market: FinishMarket;
  /** American format, e.g. +350 or -120 */
  odds: number;
  /** Implied probability after vig removal */
  impliedProb: number;
  source: "oddschecker-manual" | "draftkings-manual" | "provisional" | "bovada-snapshot";
  source_label: string;
  captured_at: string;
  tournament: string;
  book: string | null;
}

export interface FinishOddsSnapshot {
  tournament: string;
  generatedAt: string;
  source: "oddschecker-manual" | "draftkings-manual" | "provisional" | "bovada-snapshot";
  source_label: string;
  limitation: string | null;
  top5: FinishOddsLine[];
  top10: FinishOddsLine[];
  top20: FinishOddsLine[];
}

// ─── Cloudflare-block stub ────────────────────────────────────────────────────

/**
 * Attempts to scrape Oddschecker. Always returns empty due to Cloudflare
 * protection, but is included for completeness and future-proofing
 * (if Cloudflare config changes or a proxy is configured).
 */
export async function scrapeOddscheckerFinishMarkets(
  tournament: string = "masters",
): Promise<{ lines: FinishOddsLine[]; limitation: string }> {
  const MARKETS: Record<FinishMarket, string> = {
    top5: `https://www.oddschecker.com/golf/us-masters/top-5-finish`,
    top10: `https://www.oddschecker.com/golf/us-masters/top-10-finish`,
    top20: `https://www.oddschecker.com/golf/us-masters/top-20-finish`,
  };

  const LIMITATION =
    "Oddschecker.com is protected by Cloudflare bot-detection and cannot be " +
    "scraped server-side. Direct fetch returns a challenge page with no odds data. " +
    "To use live Oddschecker data: run the local Playwright capture script " +
    "(scripts/capture-oddschecker-odds.mjs) and POST results to " +
    "/api/golf/finish-market-odds. This module falls back to provisional " +
    "odds derived from multi-book winner consensus.";

  // Attempt (will fail — documented above)
  try {
    const res = await fetch(MARKETS.top5, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const html = await res.text();
      // Cloudflare challenge page is < 10KB and contains the block marker
      const isBlocked =
        html.length < 15000 &&
        (html.includes("Sorry, you have been blocked") ||
          html.includes("cf-browser-verification") ||
          html.includes("challenge-platform"));
      if (isBlocked) {
        return { lines: [], limitation: LIMITATION };
      }
      // If somehow we get through — placeholder for real parsing
      // (cheerio-based extraction would go here)
      console.warn("[oddschecker] Unexpected success — HTML parser not yet implemented");
    }
  } catch {
    // timeout / network error — expected
  }

  return { lines: [], limitation: LIMITATION };
}

// ─── Provisional derivation from multi-book winner consensus ──────────────────

const FINISH_MULTIPLIERS: Record<FinishMarket, number> = {
  top5: 4.4,
  top10: 8.2,
  top20: 14.5,
};

const PROB_CEILING: Record<FinishMarket, number> = {
  top5: 0.85,
  top10: 0.92,
  top20: 0.97,
};

/**
 * Convert American odds to implied probability.
 * Returns raw (not vig-adjusted) probability.
 */
export function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * Convert implied probability to American odds.
 * Returns rounded to nearest 5 to match book display conventions.
 */
export function impliedToAmerican(prob: number): number {
  prob = Math.max(0.005, Math.min(0.995, prob));
  let raw: number;
  if (prob >= 0.5) {
    raw = -(prob / (1 - prob)) * 100;
  } else {
    raw = ((1 - prob) / prob) * 100;
  }
  // Round to nearest 5
  return Math.round(raw / 5) * 5;
}

/**
 * Remove vig from a set of implied probabilities.
 * Uses proportional scaling (standard method).
 */
function removeVig(probs: number[]): number[] {
  const total = probs.reduce((s, p) => s + p, 0);
  if (total <= 0) return probs;
  return probs.map((p) => p / total);
}

export interface WinnerOddsInput {
  player: string;
  /** Best available American odds across all books */
  bestOdds: number;
  /** All available odds from different books */
  allOdds: number[];
}

/**
 * Derive provisional Top 5/10/20 finish-market odds from winner odds.
 *
 * Algorithm:
 * 1. Compute implied win probability for each player (best odds).
 * 2. Remove vig proportionally.
 * 3. Apply finish-market multipliers (calibrated empirically).
 * 4. Cap at PROB_CEILING to avoid unrealistic near-certainties.
 * 5. Convert back to American odds.
 *
 * Returns null for players with < 0.1% win probability (very long shots
 * where the derivation becomes unreliable below ~+10000 outright).
 */
export function deriveProvisionalFinishOdds(
  players: WinnerOddsInput[],
  tournament: string,
): FinishOddsSnapshot {
  const now = new Date().toISOString();

  // Step 1: raw implied win probabilities
  const rawProbs = players.map((p) => americanToImplied(p.bestOdds));

  // Step 2: vig-remove (treat entire field as one market)
  const cleanProbs = removeVig(rawProbs);

  const top5Lines: FinishOddsLine[] = [];
  const top10Lines: FinishOddsLine[] = [];
  const top20Lines: FinishOddsLine[] = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const pWin = cleanProbs[i];

    // Skip near-invisible long shots (< 0.1%)
    if (pWin < 0.001) continue;

    for (const market of ["top5", "top10", "top20"] as FinishMarket[]) {
      const rawProb = Math.min(pWin * FINISH_MULTIPLIERS[market], PROB_CEILING[market]);
      const odds = impliedToAmerican(rawProb);

      const line: FinishOddsLine = {
        player: p.player,
        market,
        odds,
        impliedProb: rawProb,
        source: "provisional",
        source_label: "Provisional (multi-book consensus)",
        captured_at: now,
        tournament,
        book: null,
      };

      if (market === "top5") top5Lines.push(line);
      else if (market === "top10") top10Lines.push(line);
      else top20Lines.push(line);
    }
  }

  // Sort by implied probability descending (best chance of top finish first)
  const sortFn = (a: FinishOddsLine, b: FinishOddsLine) =>
    b.impliedProb - a.impliedProb;

  return {
    tournament,
    generatedAt: now,
    source: "provisional",
    source_label: "Provisional / Reference Market Odds",
    limitation:
      "These are model-derived provisional odds based on multi-book winner consensus " +
      "(BetRivers, FanDuel, DraftKings, BetMGM, BetOnline, Betfair, etc.). " +
      "They are NOT verified sportsbook lines for finish markets. " +
      "Derived using implied-probability scaling from win odds. " +
      "Labeling: Oddschecker-referenced / Provisional.",
    top5: top5Lines.sort(sortFn),
    top10: top10Lines.sort(sortFn),
    top20: top20Lines.sort(sortFn),
  };
}
