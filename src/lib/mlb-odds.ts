import { OddsEvent } from "@/lib/types";
import { findMLBTeamAliases } from "@/lib/mlb-mappings";
import { getAggregatedOddsEvents, isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;
const MLB_PLAYER_PROP_MARKETS = [
  "pitcher_strikeouts",
  "batter_hits",
  "batter_total_bases",
  "batter_home_runs",
].join(",");

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;
const eventOddsCache = new Map<string, { data: OddsEvent | null; timestamp: number }>();

export async function getMLBOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.timestamp < CACHE_TTL) {
    return oddsCache.data;
  }

  try {
    const data = await getAggregatedOddsEvents("MLB");
    oddsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return [];
  }
}

export async function getMLBEventOdds(eventId?: string): Promise<OddsEvent | null> {
  if (!eventId) return null;
  if (isSyntheticAggregatedEventId(eventId)) return null;

  const cached = eventOddsCache.get(eventId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return null;
  }

  try {
    const url = `${ODDS_BASE}/sports/baseball_mlb/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${MLB_PLAYER_PROP_MARKETS}&oddsFormat=american`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Odds API error: ${res.status}`);
    const data: OddsEvent = await res.json();
    eventOddsCache.set(eventId, { data, timestamp: Date.now() });
    return data;
  } catch {
    eventOddsCache.set(eventId, { data: null, timestamp: Date.now() });
    return null;
  }
}

export function findMLBOddsForGame(
  events: OddsEvent[],
  homeTeam: string,
  awayTeam: string,
): OddsEvent | undefined {
  const homeAliases = findMLBTeamAliases(homeTeam);
  const awayAliases = findMLBTeamAliases(awayTeam);

  return events.find((event) => {
    const haystack = `${event.home_team} ${event.away_team}`.toLowerCase();
    const homeMatch = homeAliases.some((alias) => haystack.includes(alias.toLowerCase()));
    const awayMatch = awayAliases.some((alias) => haystack.includes(alias.toLowerCase()));
    return homeMatch && awayMatch;
  });
}

export function getBestSpreadForTeam(
  event: OddsEvent,
  teamName: string,
): { odds: number; book: string; line: number } | null {
  let best: { odds: number; book: string; line: number } | null = null;

  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find((entry) => entry.key === "spreads");
    if (!market) continue;

    for (const outcome of market.outcomes) {
      if (outcome.name !== teamName) continue;
      if (typeof outcome.point !== "number" || !Number.isFinite(outcome.point)) continue;
      if (!best || outcome.price > best.odds) {
        best = { odds: outcome.price, book: bookmaker.title, line: outcome.point };
      }
    }
  }

  return best;
}

export function getBestTotalForEvent(event: OddsEvent) {
  let bestLine: number | null = null;
  let over: { odds: number; book: string } | null = null;
  let under: { odds: number; book: string } | null = null;

  for (const bookmaker of event.bookmakers) {
    const market = bookmaker.markets.find((entry) => entry.key === "totals");
    if (!market) continue;

    const marketLine = market.outcomes.find((outcome) => outcome.name === "Over" && typeof outcome.point === "number")?.point;
    if (typeof marketLine === "number" && bestLine === null) {
      bestLine = marketLine;
    }

    for (const outcome of market.outcomes) {
      if (typeof outcome.point !== "number" || !Number.isFinite(outcome.point)) continue;
      if (bestLine !== null && outcome.point !== bestLine) continue;
      if (outcome.name === "Over" && (!over || outcome.price > over.odds)) {
        over = { odds: outcome.price, book: bookmaker.title };
      }
      if (outcome.name === "Under" && (!under || outcome.price > under.odds)) {
        under = { odds: outcome.price, book: bookmaker.title };
      }
    }
  }

  if (bestLine === null) return null;
  return { line: bestLine, over, under };
}
