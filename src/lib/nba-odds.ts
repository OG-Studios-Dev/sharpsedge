import { OddsEvent } from "./types";
import { findNBATeamAliases } from "./nba-mappings";
import { getAggregatedOddsEvents, isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";
import { getDailyPlayerPropOddsEvent } from "@/lib/props-cache";

const CACHE_TTL = 15 * 60 * 1000;

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;

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
  return getDailyPlayerPropOddsEvent("NBA", eventId);
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
