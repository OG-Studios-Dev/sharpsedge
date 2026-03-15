import { OddsEvent } from "./types";
import { findNBATeamAliases } from "./nba-mappings";
import { getAggregatedOddsEvents, isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";

const NBA_ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;
const NBA_PLAYER_PROP_MARKETS = "player_points,player_rebounds,player_assists,player_threes";

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;
const eventOddsCache = new Map<string, { data: OddsEvent | null; timestamp: number }>();

export async function getNBAOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.timestamp < CACHE_TTL) {
    return oddsCache.data;
  }

  try {
    const data = await getAggregatedOddsEvents("NBA");
    oddsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return [];
  }
}

export async function getNBAEventOdds(eventId?: string): Promise<OddsEvent | null> {
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
    const url = `${NBA_ODDS_BASE}/sports/basketball_nba/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${NBA_PLAYER_PROP_MARKETS}&oddsFormat=american`;
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

export function findNBAOddsForGame(
  events: OddsEvent[],
  homeTeam: string,
  awayTeam: string
): OddsEvent | undefined {
  const homeAliases = findNBATeamAliases(homeTeam);
  const awayAliases = findNBATeamAliases(awayTeam);

  return events.find((e) => {
    const haystack = `${e.home_team} ${e.away_team}`.toLowerCase();
    const homeMatch = homeAliases.some((alias) => haystack.includes(alias.toLowerCase()));
    const awayMatch = awayAliases.some((alias) => haystack.includes(alias.toLowerCase()));
    return homeMatch && awayMatch;
  });
}
