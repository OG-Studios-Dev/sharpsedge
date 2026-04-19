import { OddsEvent } from "@/lib/types";
import { findMLBTeamAbbreviationByName, findMLBTeamAliases, normalizeMLBTeamAbbrev } from "@/lib/mlb-mappings";
import { getAggregatedOddsEvents, isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";
import { fetchWithOddsApiKeys } from "@/lib/odds-api-pool";

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

  try {
    const result = await fetchWithOddsApiKeys(
      (apiKey) => `${ODDS_BASE}/sports/baseball_mlb/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${MLB_PLAYER_PROP_MARKETS}&oddsFormat=american`,
      { next: { revalidate: 900 } },
    );
    if (!result?.response.ok) {
      eventOddsCache.set(eventId, { data: null, timestamp: Date.now() });
      return null;
    }
    const data: OddsEvent = await result.response.json();
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
  const normalizedHome = normalizeMLBTeamAbbrev(homeTeam);
  const normalizedAway = normalizeMLBTeamAbbrev(awayTeam);
  const homeAliases = findMLBTeamAliases(normalizedHome);
  const awayAliases = findMLBTeamAliases(normalizedAway);

  return events.find((event) => {
    const eventHomeAbbrev = normalizeMLBTeamAbbrev(findMLBTeamAbbreviationByName(event.home_team));
    const eventAwayAbbrev = normalizeMLBTeamAbbrev(findMLBTeamAbbreviationByName(event.away_team));

    if (eventHomeAbbrev === normalizedHome && eventAwayAbbrev === normalizedAway) {
      return true;
    }

    const homeHaystack = String(event.home_team || "").toLowerCase();
    const awayHaystack = String(event.away_team || "").toLowerCase();
    const homeMatch = homeAliases.some((alias) => homeHaystack.includes(alias.toLowerCase()) || alias.toLowerCase().includes(homeHaystack));
    const awayMatch = awayAliases.some((alias) => awayHaystack.includes(alias.toLowerCase()) || alias.toLowerCase().includes(awayHaystack));
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
