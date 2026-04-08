/**
 * UFC / MMA data via API-Sports MMA v1
 * Base: https://v1.mma.api-sports.io
 * Free plan: 100 req/day, 3-day rolling window for fights
 */

const MMA_BASE = "https://v1.mma.api-sports.io";
const API_KEY = process.env.API_SPORTS_KEY ?? "";

export interface MMAFighter {
  id: number;
  name: string;
  logo: string | null;
  winner?: boolean;
  record?: string | null;  // e.g. "29-3-0" from UFCStats
  weightClass?: string | null;
}

export interface MMAFight {
  id: number;
  date: string;
  slug: string; // event name
  is_main: boolean;
  category: string; // weight class
  status: { long: string; short: string };
  fighters: { first: MMAFighter; second: MMAFighter };
}

export interface MMAbookmakerOdds {
  bookmaker: string;
  fighter1Odds: number; // American odds
  fighter2Odds: number;
}

export interface MMAFightWithOdds extends MMAFight {
  odds: MMAbookmakerOdds[];
  bestFighter1Odds: number | null;
  bestFighter2Odds: number | null;
}

// Convert decimal odds to American
function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

async function mmaFetch<T>(path: string): Promise<T | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${MMA_BASE}${path}`, {
      headers: { "x-apisports-key": API_KEY },
      next: { revalidate: 1800 }, // 30 min cache
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) return null;
    return json as T;
  } catch {
    return null;
  }
}

/** Normalize a raw API fight response — maps photo → logo for fighters */
function normalizeFight(raw: Record<string, unknown>): MMAFight {
  const fighters = raw.fighters as { first: Record<string, unknown>; second: Record<string, unknown> } | undefined;
  return {
    ...(raw as unknown as MMAFight),
    fighters: {
      first: {
        ...(fighters?.first ?? {}),
        logo: (fighters?.first?.photo as string | null) ?? (fighters?.first?.logo as string | null) ?? null,
      } as MMAFighter,
      second: {
        ...(fighters?.second ?? {}),
        logo: (fighters?.second?.photo as string | null) ?? (fighters?.second?.logo as string | null) ?? null,
      } as MMAFighter,
    },
  };
}

/** Get all fights for a given date (YYYY-MM-DD) */
export async function getUFCFights(date: string): Promise<MMAFight[]> {
  const data = await mmaFetch<{ response: Record<string, unknown>[] }>(`/fights?date=${date}`);
  return (data?.response ?? []).map(normalizeFight);
}

/** Get fights for the next event within the 3-day rolling window */
export async function getUpcomingUFCCard(): Promise<{ date: string; event: string; fights: MMAFight[] } | null> {
  const today = new Date();
  for (let i = 0; i <= 2; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const fights = await getUFCFights(dateStr);
    if (fights.length > 0) {
      return {
        date: dateStr,
        event: fights[0]?.slug ?? "UFC Event",
        fights,
      };
    }
  }
  return null;
}

/** Get most recent completed UFC event (look back up to 3 days) */
export async function getRecentUFCCard(): Promise<{ date: string; event: string; fights: MMAFight[] } | null> {
  const today = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const fights = await getUFCFights(dateStr);
    if (fights.length > 0) {
      const finished = fights.filter((f) => f.status.short === "FT" || f.status.long === "Finished");
      if (finished.length > 0) {
        return { date: dateStr, event: fights[0].slug, fights };
      }
    }
  }
  return null;
}

/** Get odds for a specific fight */
export async function getUFCFightOdds(fightId: number): Promise<MMAbookmakerOdds[]> {
  const data = await mmaFetch<{
    response: Array<{
      fight: { id: number };
      bookmakers: Array<{
        id: number;
        name: string;
        bets: Array<{
          id: number;
          name: string;
          values: Array<{ value: string; odd: string }>;
        }>;
      }>;
    }>;
  }>(`/odds?fight=${fightId}`);

  if (!data?.response?.[0]) return [];

  const result: MMAbookmakerOdds[] = [];
  for (const bm of data.response[0].bookmakers) {
    const homeAwayBet = bm.bets.find((b) => b.name === "Home/Away");
    if (!homeAwayBet) continue;
    const awayVal = homeAwayBet.values.find((v) => v.value === "Away");
    const homeVal = homeAwayBet.values.find((v) => v.value === "Home");
    if (!awayVal || !homeVal) continue;
    result.push({
      bookmaker: bm.name,
      fighter1Odds: decimalToAmerican(parseFloat(awayVal.odd)), // fighter1 = away
      fighter2Odds: decimalToAmerican(parseFloat(homeVal.odd)), // fighter2 = home
    });
  }
  return result;
}

/** Enrich fights with best available odds */
export async function enrichFightsWithOdds(fights: MMAFight[]): Promise<MMAFightWithOdds[]> {
  const enriched: MMAFightWithOdds[] = [];
  for (const fight of fights) {
    const odds = await getUFCFightOdds(fight.id);
    let bestF1: number | null = null;
    let bestF2: number | null = null;
    for (const o of odds) {
      if (bestF1 === null || o.fighter1Odds > bestF1) bestF1 = o.fighter1Odds;
      if (bestF2 === null || o.fighter2Odds > bestF2) bestF2 = o.fighter2Odds;
    }
    enriched.push({ ...fight, odds, bestFighter1Odds: bestF1, bestFighter2Odds: bestF2 });
  }
  return enriched;
}

/** Search fighter by name */
export async function searchUFCFighter(name: string): Promise<{ id: number; name: string; category: string } | null> {
  const data = await mmaFetch<{
    response: Array<{ id: number; name: string; category: string }>;
  }>(`/fighters?search=${encodeURIComponent(name)}`);
  return data?.response?.[0] ?? null;
}
