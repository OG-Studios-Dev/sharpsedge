import { OddsEvent } from "./types";
import { findTeamAliases } from "./nhl-mappings";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;

export async function getNHLOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.timestamp < CACHE_TTL) {
    return oddsCache.data;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return [];
  }

  try {
    const url = `${ODDS_BASE}/sports/icehockey_nhl/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,player_points,player_shots_on_goal,player_assists&oddsFormat=american`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Odds API error: ${res.status}`);
    const data: OddsEvent[] = await res.json();
    oddsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return [];
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
