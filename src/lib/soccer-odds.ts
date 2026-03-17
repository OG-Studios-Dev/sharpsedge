import { getDateKeyWithOffset } from "@/lib/date-utils";
import { americanOddsToImpliedProbability } from "@/lib/odds-api";
import type { OddsEvent, OddsMarket } from "@/lib/types";
import type { SoccerLeague, SoccerMatch } from "@/lib/soccer-api";

const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

const LEAGUE_CONFIG: Record<SoccerLeague, {
  espnKey: string;
  oddsApiKey: string;
}> = {
  EPL: {
    espnKey: "eng.1",
    oddsApiKey: "soccer_epl",
  },
  SERIE_A: {
    espnKey: "ita.1",
    oddsApiKey: "soccer_italy_serie_a",
  },
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toDateStamp(offset = 0) {
  return getDateKeyWithOffset(offset).replace(/-/g, "");
}

async function cachedFetch<T>(url: string, ttl = CACHE_TTL): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.timestamp < ttl) {
    return hit.data as T;
  }

  const response = await fetch(url, { next: { revalidate: Math.round(ttl / 1000) } });
  if (!response.ok) {
    throw new Error(`Soccer odds error ${response.status}: ${url}`);
  }

  const data = await response.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function parseTotalOdds(oddsData: any) {
  const line = typeof oddsData?.overUnder === "number" ? oddsData.overUnder : null;
  if (line === null) return null;

  const overOdds = typeof oddsData?.overOdds === "number" ? oddsData.overOdds
    : typeof oddsData?.over?.odds === "number" ? oddsData.over.odds
    : null;
  const underOdds = typeof oddsData?.underOdds === "number" ? oddsData.underOdds
    : typeof oddsData?.under?.odds === "number" ? oddsData.under.odds
    : null;

  if (overOdds === null && underOdds === null) return null;

  return {
    key: "totals",
    outcomes: [
      ...(typeof overOdds === "number" ? [{ name: "Over", price: overOdds, point: line }] : []),
      ...(typeof underOdds === "number" ? [{ name: "Under", price: underOdds, point: line }] : []),
    ],
  } satisfies OddsMarket;
}

function parseESPNEventOdds(event: any): OddsEvent | null {
  const competition = event?.competitions?.[0];
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const home = competitors.find((entry: any) => entry?.homeAway === "home") ?? competitors[0];
  const away = competitors.find((entry: any) => entry?.homeAway === "away") ?? competitors[1];
  const oddsData = competition?.odds?.[0];

  if (!home?.team?.displayName || !away?.team?.displayName || !oddsData) {
    return null;
  }

  const homeName = String(home.team.displayName).trim();
  const awayName = String(away.team.displayName).trim();
  const homePrice = typeof oddsData?.homeTeamOdds?.moneyLine === "number" ? oddsData.homeTeamOdds.moneyLine : null;
  const awayPrice = typeof oddsData?.awayTeamOdds?.moneyLine === "number" ? oddsData.awayTeamOdds.moneyLine : null;
  const drawPrice = typeof oddsData?.drawOdds?.moneyLine === "number" ? oddsData.drawOdds.moneyLine
    : typeof oddsData?.drawOdds === "number" ? oddsData.drawOdds
    : typeof oddsData?.draw?.odds === "number" ? oddsData.draw.odds
    : null;

  const markets: OddsMarket[] = [];

  if (homePrice !== null || awayPrice !== null || drawPrice !== null) {
    markets.push({
      key: "h2h",
      outcomes: [
        ...(typeof homePrice === "number" ? [{ name: homeName, price: homePrice }] : []),
        ...(typeof drawPrice === "number" ? [{ name: "Draw", price: drawPrice }] : []),
        ...(typeof awayPrice === "number" ? [{ name: awayName, price: awayPrice }] : []),
      ],
    });
  }

  const totalMarket = parseTotalOdds(oddsData);
  if (totalMarket) markets.push(totalMarket);

  if (!markets.length) return null;

  return {
    id: String(event?.id ?? `${awayName}@${homeName}`),
    home_team: homeName,
    away_team: awayName,
    commence_time: String(event?.date ?? competition?.date ?? ""),
    bookmakers: [
      {
        key: normalize(String(oddsData?.provider?.name || "DraftKings")),
        title: String(oddsData?.provider?.name || "DraftKings"),
        markets,
      },
    ],
  };
}

async function getESPNOdds(league: SoccerLeague): Promise<OddsEvent[]> {
  const config = LEAGUE_CONFIG[league];
  const payloads = await Promise.all(
    [0, 1, 2].map((offset) => (
      cachedFetch<any>(`${ESPN_SITE_BASE}/${config.espnKey}/scoreboard?dates=${toDateStamp(offset)}`)
    )),
  );

  return payloads
    .flatMap((payload) => Array.isArray(payload?.events) ? payload.events : [])
    .map(parseESPNEventOdds)
    .filter((event): event is OddsEvent => Boolean(event));
}

async function getOddsApiOdds(league: SoccerLeague): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") return [];

  const config = LEAGUE_CONFIG[league];

  try {
    const payload = await cachedFetch<OddsEvent[]>(
      `${ODDS_API_BASE}/sports/${config.oddsApiKey}/odds?apiKey=${apiKey}&regions=us,uk&markets=h2h,totals&oddsFormat=american`,
    );

    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

export async function getSoccerOdds(league: SoccerLeague): Promise<OddsEvent[]> {
  const cacheKey = `soccer-odds:${league}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data as OddsEvent[];
  }

  // Import aggregator dynamically to avoid circular deps
  const { getAggregatedOddsEvents } = await import("@/lib/odds-aggregator");
  const aggSport = league === "EPL" ? "EPL" as const : "SERIE_A" as const;

  const [espnOdds, oddsApiOdds, aggregatorOdds] = await Promise.allSettled([
    getESPNOdds(league),
    getOddsApiOdds(league),
    getAggregatedOddsEvents(aggSport),
  ]);

  const merged = [
    // Aggregator first (primary source with 8 books)
    ...(aggregatorOdds.status === "fulfilled" ? aggregatorOdds.value : []),
    ...(espnOdds.status === "fulfilled" ? espnOdds.value : []),
    ...(oddsApiOdds.status === "fulfilled" ? oddsApiOdds.value : []),
  ];

  const deduped = new Map<string, OddsEvent>();
  for (const event of merged) {
    const key = `${normalize(event.away_team)}@${normalize(event.home_team)}`;
    if (!deduped.has(key)) {
      deduped.set(key, event);
      continue;
    }

    const existing = deduped.get(key)!;
    deduped.set(key, {
      ...existing,
      bookmakers: [...existing.bookmakers, ...event.bookmakers],
    });
  }

  const data = Array.from(deduped.values());
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

function teamTokens(team: Pick<SoccerMatch["homeTeam"], "name" | "shortName" | "abbreviation">) {
  return [team.name, team.shortName, team.abbreviation]
    .map((value) => normalize(String(value || "")))
    .filter(Boolean);
}

export function findSoccerOddsForMatch(events: OddsEvent[], match: SoccerMatch): OddsEvent | undefined {
  const homeTokens = teamTokens(match.homeTeam);
  const awayTokens = teamTokens(match.awayTeam);

  return events.find((event) => {
    const eventHome = normalize(event.home_team);
    const eventAway = normalize(event.away_team);
    const homeMatch = homeTokens.some((token) => eventHome.includes(token) || token.includes(eventHome));
    const awayMatch = awayTokens.some((token) => eventAway.includes(token) || token.includes(eventAway));
    return homeMatch && awayMatch;
  });
}

function getMarket(event: OddsEvent, key: string) {
  return event.bookmakers.flatMap((book) => (
    book.markets
      .filter((market) => market.key === key)
      .map((market) => ({ book: book.title, market }))
  ));
}

export function getBestSoccerThreeWay(event: OddsEvent) {
  let home: { odds: number; book: string } | null = null;
  let draw: { odds: number; book: string } | null = null;
  let away: { odds: number; book: string } | null = null;

  for (const { book, market } of getMarket(event, "h2h")) {
    for (const outcome of market.outcomes) {
      if (outcome.name === event.home_team && (!home || outcome.price > home.odds)) {
        home = { odds: outcome.price, book };
      }
      if (normalize(outcome.name) === "draw" && (!draw || outcome.price > draw.odds)) {
        draw = { odds: outcome.price, book };
      }
      if (outcome.name === event.away_team && (!away || outcome.price > away.odds)) {
        away = { odds: outcome.price, book };
      }
    }
  }

  return { home, draw, away };
}

export function getSoccerThreeWayBookOdds(event: OddsEvent) {
  const home: Array<{ book: string; odds: number; line: number; impliedProbability: number }> = [];
  const draw: Array<{ book: string; odds: number; line: number; impliedProbability: number }> = [];
  const away: Array<{ book: string; odds: number; line: number; impliedProbability: number }> = [];

  for (const { book, market } of getMarket(event, "h2h")) {
    for (const outcome of market.outcomes) {
      const item = {
        book,
        odds: outcome.price,
        line: 0,
        impliedProbability: americanOddsToImpliedProbability(outcome.price),
      };

      if (outcome.name === event.home_team) home.push(item);
      if (normalize(outcome.name) === "draw") draw.push(item);
      if (outcome.name === event.away_team) away.push(item);
    }
  }

  const sortByBest = (items: typeof home) => items.sort((left, right) => right.odds - left.odds || left.book.localeCompare(right.book));
  return {
    home: sortByBest(home),
    draw: sortByBest(draw),
    away: sortByBest(away),
  };
}

export function getBestSoccerTotal(event: OddsEvent, preferredLines = [2.5, 1.5, 3.5]) {
  const totals = getMarket(event, "totals");
  let best: {
    line: number;
    over?: { odds: number; book: string } | null;
    under?: { odds: number; book: string } | null;
  } | null = null;

  for (const preferredLine of preferredLines) {
    let over: { odds: number; book: string } | null = null;
    let under: { odds: number; book: string } | null = null;

    for (const { book, market } of totals) {
      for (const outcome of market.outcomes) {
        if (typeof outcome.point !== "number" || outcome.point !== preferredLine) continue;
        if (outcome.name === "Over" && (!over || outcome.price > over.odds)) {
          over = { odds: outcome.price, book };
        }
        if (outcome.name === "Under" && (!under || outcome.price > under.odds)) {
          under = { odds: outcome.price, book };
        }
      }
    }

    if (over || under) {
      best = { line: preferredLine, over, under };
      break;
    }
  }

  if (best) return best;

  for (const { book, market } of totals) {
    for (const outcome of market.outcomes) {
      if (typeof outcome.point !== "number") continue;
      if (!best) {
        best = { line: outcome.point, over: null, under: null };
      }
      if (best.line !== outcome.point) continue;
      if (outcome.name === "Over" && (!best.over || outcome.price > best.over.odds)) {
        best.over = { odds: outcome.price, book };
      }
      if (outcome.name === "Under" && (!best.under || outcome.price > best.under.odds)) {
        best.under = { odds: outcome.price, book };
      }
    }
  }

  return best;
}
