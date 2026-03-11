import { OddsEvent } from "./types";
import { findNBATeamAliases } from "./nba-mappings";

const NBA_ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;

let oddsCache: { data: OddsEvent[]; timestamp: number } | null = null;

export async function getNBAOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.timestamp < CACHE_TTL) {
    return oddsCache.data;
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return [];
  }

  try {
    const url = `${NBA_ODDS_BASE}/sports/basketball_nba/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,player_points,player_rebounds,player_assists,player_threes&oddsFormat=american`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Odds API error: ${res.status}`);
    const data: OddsEvent[] = await res.json();
    oddsCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    return [];
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
