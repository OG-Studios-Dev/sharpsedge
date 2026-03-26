/**
 * Bovada Golf Odds Scraper
 * Scrapes winner, top 5/10/20, make cut, and H2H matchup markets
 * for all upcoming PGA Tour events as early as they're posted.
 */

const BOVADA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.bovada.lv/",
};

export interface PlayerOdds {
  player: string;
  odds: number; // American format (e.g. +1200, -110)
}

export interface GolfMarkets {
  winner: PlayerOdds[];
  top5: PlayerOdds[];
  top10: PlayerOdds[];
  top20: PlayerOdds[];
  makeCut: PlayerOdds[];
  matchups: MatchupOdds[];
}

export interface MatchupOdds {
  market: string; // e.g. "1st Round Match-Ups - Scheffler vs McIlroy"
  player1: string;
  player1Odds: number;
  player2: string;
  player2Odds: number;
  round?: string; // "1st Round", "Tournament", etc.
}

export interface TournamentOddsSnapshot {
  tournament: string;
  bovadaEventId: string;
  startDate: string;
  scrapedAt: string;
  source: "bovada";
  markets: GolfMarkets;
}

function parseAmericanOdds(raw: string | number | undefined): number | null {
  if (!raw) return null;
  const str = String(raw).replace(/[^0-9+\-]/g, "");
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function categorizeMarket(description: string): keyof GolfMarkets | null {
  const d = description.toLowerCase();
  if (d.includes("top 5") || d.includes("top five") || d.includes("top5"))
    return "top5";
  if (d.includes("top 10") || d.includes("top ten") || d.includes("top10"))
    return "top10";
  if (d.includes("top 20") || d.includes("top twenty") || d.includes("top20"))
    return "top20";
  if (d.includes("make cut") || d.includes("cut")) return "makeCut";
  if (d.includes("winner") || d.includes("tournament winner")) return "winner";
  if (
    d.includes("match-up") ||
    d.includes("matchup") ||
    d.includes("3-ball") ||
    d.includes("3 ball")
  )
    return "matchups";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMatchup(market: any): MatchupOdds | null {
  const outcomes = market.outcomes || [];
  if (outcomes.length < 2) return null;

  const p1 = outcomes[0];
  const p2 = outcomes[1];

  const p1Odds = parseAmericanOdds(p1.price?.american);
  const p2Odds = parseAmericanOdds(p2.price?.american);

  if (!p1Odds || !p2Odds) return null;

  const roundMatch = market.description.match(/^(1st Round|2nd Round|Tournament)/i);

  return {
    market: market.description,
    player1: p1.description,
    player1Odds: p1Odds,
    player2: p2.description,
    player2Odds: p2Odds,
    round: roundMatch ? roundMatch[1] : undefined,
  };
}

export async function scrapeBovadaGolfOdds(): Promise<TournamentOddsSnapshot[]> {
  const url =
    "https://www.bovada.lv/services/sports/event/coupon/events/A/description/golf?lang=en&eventsLimit=50&marketFilterId=def";

  let data: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const res = await fetch(url, { headers: BOVADA_HEADERS });
    data = await res.json();
    if (!Array.isArray(data)) return [];
  } catch {
    return [];
  }

  const snapshots: TournamentOddsSnapshot[] = [];
  const now = new Date().toISOString();

  for (const item of data) {
    for (const ev of item.events || []) {
      // Only PGA Tour events (skip LIV, DP World, team events, Presidents Cup, etc.)
      const name: string = ev.description || "";
      if (!name || ev.path?.some((p: any) => p.description === "PGA Tour") === false) {
        // Check path for PGA Tour
        const isPGA = (ev.path || []).some(
          (p: any) =>
            p.description === "PGA Tour" || p.link?.includes("pga-tour")
        );
        if (!isPGA) continue;
      }

      // Skip events already in progress (live markets only = started)
      // We still want live winner markets for tracking, but flag them
      const startTime = ev.startTime ? new Date(ev.startTime) : null;

      const markets: GolfMarkets = {
        winner: [],
        top5: [],
        top10: [],
        top20: [],
        makeCut: [],
        matchups: [],
      };

      for (const dg of ev.displayGroups || []) {
        for (const mkt of dg.markets || []) {
          const cat = categorizeMarket(mkt.description);
          if (!cat) continue;

          if (cat === "matchups") {
            const matchup = extractMatchup(mkt);
            if (matchup) markets.matchups.push(matchup);
          } else {
            for (const outcome of mkt.outcomes || []) {
              const odds = parseAmericanOdds(outcome.price?.american);
              if (!odds || !outcome.description) continue;
              markets[cat].push({ player: outcome.description, odds });
            }
          }
        }
      }

      // Only include if we have at least winner odds
      if (markets.winner.length === 0) continue;

      snapshots.push({
        tournament: name,
        bovadaEventId: String(ev.id),
        startDate: startTime ? startTime.toISOString().slice(0, 10) : "",
        scrapedAt: now,
        source: "bovada",
        markets,
      });
    }
  }

  return snapshots;
}

export { slugify };
