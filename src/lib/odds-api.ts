import { OddsEvent } from "./types";
import { findTeamAliases } from "./nhl-mappings";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;
const NHL_FEATURED_MARKETS = "h2h,spreads";
const NHL_PLAYER_PROP_MARKETS = "player_points,player_shots_on_goal,player_assists,player_goals";

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;
const eventOddsCache = new Map<string, { data: OddsEvent | null; timestamp: number }>();

export type PlayerPropOdds = {
  odds: number;
  book: string;
  line: number;
  impliedProbability: number;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function matchesPlayerName(targetName: string, outcomeName?: string) {
  const normalizedTarget = normalizeName(targetName);
  const normalizedOutcome = normalizeName(outcomeName || "");
  if (!normalizedTarget || !normalizedOutcome) return false;
  if (normalizedTarget === normalizedOutcome) return true;

  const targetParts = normalizedTarget.split(" ").filter(Boolean);
  const outcomeParts = normalizedOutcome.split(" ").filter(Boolean);
  const targetLast = targetParts[targetParts.length - 1];
  const outcomeLast = outcomeParts[outcomeParts.length - 1];
  if (!targetLast || !outcomeLast || targetLast !== outcomeLast) return false;

  const targetFirst = targetParts[0] || "";
  const outcomeFirst = outcomeParts[0] || "";
  return targetFirst === outcomeFirst || targetFirst.startsWith(outcomeFirst) || outcomeFirst.startsWith(targetFirst);
}

export async function getNHLOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.timestamp < CACHE_TTL) {
    return oddsCache.data;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return [];
  }

  try {
    const url = `${ODDS_BASE}/sports/icehockey_nhl/odds?apiKey=${apiKey}&regions=us&markets=${NHL_FEATURED_MARKETS}&oddsFormat=american`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Odds API error: ${res.status}`);
    const data: OddsEvent[] = await res.json();
    oddsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return [];
  }
}

export async function getNHLEventOdds(eventId?: string): Promise<OddsEvent | null> {
  if (!eventId) return null;

  const cached = eventOddsCache.get(eventId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return null;
  }

  try {
    const url = `${ODDS_BASE}/sports/icehockey_nhl/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${NHL_PLAYER_PROP_MARKETS}&oddsFormat=american`;
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

export function findOddsForGame(
  events: OddsEvent[],
  homeTeam: string,
  awayTeam: string
): OddsEvent | undefined {
  const homeAliases = findTeamAliases(homeTeam);
  const awayAliases = findTeamAliases(awayTeam);

  return events.find((e) => {
    const haystack = `${e.home_team} ${e.away_team}`.toLowerCase();
    const homeMatch = homeAliases.some((alias) => haystack.includes(alias.toLowerCase()));
    const awayMatch = awayAliases.some((alias) => haystack.includes(alias.toLowerCase()));
    return homeMatch && awayMatch;
  });
}

export function getBestOdds(
  event: OddsEvent,
  market: string,
  outcome: string,
  point?: number
): { odds: number; book: string } | null {
  let best: { odds: number; book: string } | null = null;

  for (const bm of event.bookmakers) {
    const mkt = bm.markets.find((m) => m.key === market);
    if (!mkt) continue;
    for (const o of mkt.outcomes) {
      if (o.name !== outcome) continue;
      if (point !== undefined && o.point !== point) continue;
      if (!best || o.price > best.odds) {
        best = { odds: o.price, book: bm.title };
      }
    }
  }

  return best;
}

export function americanOddsToImpliedProbability(odds?: number | null): number {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return 0;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  }

  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export function getPlayerPropOdds(
  event: OddsEvent | null | undefined,
  market: string,
  playerName: string,
  direction: "Over" | "Under" = "Over"
): PlayerPropOdds[] {
  if (!event) return [];

  const matches: PlayerPropOdds[] = [];

  for (const bookmaker of event.bookmakers || []) {
    const marketEntry = bookmaker.markets.find((entry) => entry.key === market);
    if (!marketEntry) continue;

    for (const outcome of marketEntry.outcomes || []) {
      const outcomeDirection = outcome.name === "Under" ? "Under" : outcome.name === "Over" ? "Over" : null;
      if (!outcomeDirection || outcomeDirection !== direction) continue;
      if (!matchesPlayerName(playerName, outcome.description)) continue;
      if (typeof outcome.point !== "number" || !Number.isFinite(outcome.point)) continue;

      matches.push({
        odds: outcome.price,
        book: bookmaker.title,
        line: outcome.point,
        impliedProbability: americanOddsToImpliedProbability(outcome.price),
      });
    }
  }

  return matches;
}
