import { BookOdds, OddsEvent } from "./types";
import { findTeamAliases } from "./nhl-mappings";
import { getAggregatedOddsEvents, isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";
import { isFuzzyNameMatch } from "@/lib/name-match";
import { getDailyPlayerPropOddsEvent } from "@/lib/props-cache";

const CACHE_TTL = 15 * 60 * 1000;

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;

export type PlayerPropOdds = BookOdds;

function matchesPlayerName(targetName: string, outcomeName?: string) {
  return isFuzzyNameMatch(targetName, outcomeName || "");
}

export async function getNHLOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.timestamp < CACHE_TTL) {
    return oddsCache.data;
  }

  try {
    const data = await getAggregatedOddsEvents("NHL");
    oddsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return [];
  }
}

export async function getNHLEventOdds(eventId?: string): Promise<OddsEvent | null> {
  if (!eventId) return null;
  if (isSyntheticAggregatedEventId(eventId)) return null;
  return getDailyPlayerPropOddsEvent("NHL", eventId);
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
  const best = getAllOdds(event, market, outcome, point)[0];
  if (!best) return null;

  return { odds: best.odds, book: best.book };
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
  return getAllPlayerPropOdds(event, market, playerName, direction);
}

export function getAllOdds(
  event: OddsEvent | null | undefined,
  market: string,
  outcome: string,
  point?: number,
): BookOdds[] {
  if (!event) return [];

  const matches: BookOdds[] = [];

  for (const bookmaker of event.bookmakers || []) {
    const marketEntry = bookmaker.markets.find((entry) => entry.key === market);
    if (!marketEntry) continue;

    for (const marketOutcome of marketEntry.outcomes || []) {
      if (marketOutcome.name !== outcome) continue;
      if (point !== undefined && marketOutcome.point !== point) continue;

      matches.push({
        odds: marketOutcome.price,
        book: bookmaker.title,
        line: typeof marketOutcome.point === "number" && Number.isFinite(marketOutcome.point)
          ? marketOutcome.point
          : point ?? 0,
        impliedProbability: americanOddsToImpliedProbability(marketOutcome.price),
      });
    }
  }

  return matches.sort((left, right) => (
    right.odds - left.odds
    || left.impliedProbability - right.impliedProbability
    || left.book.localeCompare(right.book)
  ));
}

export function getAllPlayerPropOdds(
  event: OddsEvent | null | undefined,
  market: string,
  playerName: string,
  direction: "Over" | "Under" = "Over",
): BookOdds[] {
  if (!event) return [];

  const matches: BookOdds[] = [];

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

  return matches.sort((left, right) => (
    right.odds - left.odds
    || left.impliedProbability - right.impliedProbability
    || left.book.localeCompare(right.book)
  ));
}
