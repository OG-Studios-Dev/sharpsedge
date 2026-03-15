import * as bovada from "@/lib/books/bovada";
import * as espnDraftKings from "@/lib/books/espn-dk";
import * as kambi from "@/lib/books/kambi";
import * as pinnacle from "@/lib/books/pinnacle";
import * as pointsbet from "@/lib/books/pointsbet";
import { buildAggregatedGameId, getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import {
  type AggregatedBookOdds,
  type AggregatedOdds,
  type AggregatedSidePrice,
  type AggregatedSport,
  type AggregatedSpreadPrice,
  type AggregatedTotalPrice,
  type BookEventOdds,
  SUPPORTED_AGGREGATION_SPORTS,
} from "@/lib/books/types";
import { isoNow, makeEmptyBookOdds } from "@/lib/books/utils";
import type { OddsEvent } from "@/lib/types";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;
const AGGREGATED_EVENT_ID_PREFIX = "agg:";

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const sportCache = new Map<AggregatedSport, CacheEntry<AggregatedOdds[]>>();
const boardCache = new Map<string, CacheEntry<Record<AggregatedSport, AggregatedOdds[]>>>();

const ODDS_API_SPORT_KEYS: Partial<Record<AggregatedSport, string>> = {
  NHL: "icehockey_nhl",
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NFL: "americanfootball_nfl",
};

function normalizeBookKey(book: string) {
  return book.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function shouldUseCached<T>(entry?: CacheEntry<T>) {
  return Boolean(entry && Date.now() - entry.timestamp < CACHE_TTL);
}

function pickBestSide(
  books: AggregatedBookOdds[],
  selector: (book: AggregatedBookOdds) => number | null,
): AggregatedSidePrice | null {
  let best: AggregatedSidePrice | null = null;
  for (const book of books) {
    const odds = selector(book);
    if (typeof odds !== "number" || !Number.isFinite(odds)) continue;
    if (!best || odds > best.odds) {
      best = { odds, book: book.book };
    }
  }
  return best;
}

function pickBestSpread(
  books: AggregatedBookOdds[],
  oddsSelector: (book: AggregatedBookOdds) => number | null,
  lineSelector: (book: AggregatedBookOdds) => number | null,
): AggregatedSpreadPrice | null {
  let best: AggregatedSpreadPrice | null = null;
  for (const book of books) {
    const odds = oddsSelector(book);
    const line = lineSelector(book);
    if (typeof odds !== "number" || !Number.isFinite(odds)) continue;
    if (typeof line !== "number" || !Number.isFinite(line)) continue;
    if (!best || odds > best.odds) {
      best = { odds, line, book: book.book };
    }
  }
  return best;
}

function pickBestTotal(
  books: AggregatedBookOdds[],
  oddsSelector: (book: AggregatedBookOdds) => number | null,
): AggregatedTotalPrice | null {
  let best: AggregatedTotalPrice | null = null;
  for (const book of books) {
    const odds = oddsSelector(book);
    if (typeof odds !== "number" || !Number.isFinite(odds)) continue;
    if (typeof book.total !== "number" || !Number.isFinite(book.total)) continue;
    if (!best || odds > best.odds) {
      best = {
        odds,
        line: book.total,
        book: book.book,
      };
    }
  }
  return best;
}

function mergeBookOdds(primary: AggregatedBookOdds, secondary: AggregatedBookOdds): AggregatedBookOdds {
  return {
    ...primary,
    homeML: primary.homeML ?? secondary.homeML,
    awayML: primary.awayML ?? secondary.awayML,
    spread: primary.spread ?? secondary.spread,
    spreadOdds: primary.spreadOdds ?? secondary.spreadOdds,
    homeSpread: primary.homeSpread ?? secondary.homeSpread,
    homeSpreadOdds: primary.homeSpreadOdds ?? secondary.homeSpreadOdds,
    awaySpread: primary.awaySpread ?? secondary.awaySpread,
    awaySpreadOdds: primary.awaySpreadOdds ?? secondary.awaySpreadOdds,
    total: primary.total ?? secondary.total,
    overOdds: primary.overOdds ?? secondary.overOdds,
    underOdds: primary.underOdds ?? secondary.underOdds,
    lastUpdated: primary.lastUpdated || secondary.lastUpdated || isoNow(),
  };
}

function aggregateEntries(sport: AggregatedSport, entries: BookEventOdds[]): AggregatedOdds[] {
  const grouped = new Map<string, AggregatedOdds>();

  for (const entry of entries) {
    const gameId = entry.gameId || buildAggregatedGameId(sport, entry.homeAbbrev, entry.awayAbbrev, entry.commenceTime);
    const existing = grouped.get(gameId);

    if (!existing) {
      grouped.set(gameId, {
        gameId,
        oddsApiEventId: entry.oddsApiEventId ?? null,
        sport,
        homeTeam: entry.homeTeam,
        awayTeam: entry.awayTeam,
        homeAbbrev: entry.homeAbbrev,
        awayAbbrev: entry.awayAbbrev,
        commenceTime: entry.commenceTime,
        books: [entry.odds],
        bestHome: null,
        bestAway: null,
        bestHomeSpread: null,
        bestAwaySpread: null,
        bestOver: null,
        bestUnder: null,
      });
      continue;
    }

    existing.oddsApiEventId = existing.oddsApiEventId ?? entry.oddsApiEventId ?? null;
    existing.commenceTime = existing.commenceTime || entry.commenceTime;
    const existingIndex = existing.books.findIndex((book) => normalizeBookKey(book.book) === normalizeBookKey(entry.odds.book));
    if (existingIndex >= 0) {
      existing.books[existingIndex] = mergeBookOdds(existing.books[existingIndex], entry.odds);
    } else {
      existing.books.push(entry.odds);
    }
  }

  const aggregated = Array.from(grouped.values()).map((event) => {
    const books = [...event.books].sort((left, right) => left.book.localeCompare(right.book));
    return {
      ...event,
      books,
      bestHome: pickBestSide(books, (book) => book.homeML),
      bestAway: pickBestSide(books, (book) => book.awayML),
      bestHomeSpread: pickBestSpread(books, (book) => book.homeSpreadOdds, (book) => book.homeSpread),
      bestAwaySpread: pickBestSpread(books, (book) => book.awaySpreadOdds, (book) => book.awaySpread),
      bestOver: pickBestTotal(books, (book) => book.overOdds),
      bestUnder: pickBestTotal(books, (book) => book.underOdds),
    };
  });

  return aggregated.sort((left, right) => {
    const leftTime = left.commenceTime ? new Date(left.commenceTime).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.commenceTime ? new Date(right.commenceTime).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.awayTeam.localeCompare(right.awayTeam) || left.homeTeam.localeCompare(right.homeTeam);
  });
}

function outcomePrice(event: OddsEvent, marketKey: string, outcomeName: string) {
  for (const bookmaker of event.bookmakers || []) {
    const market = bookmaker.markets.find((entry) => entry.key === marketKey);
    const outcome = market?.outcomes.find((entry) => entry.name === outcomeName);
    if (outcome) return outcome.price;
  }
  return null;
}

function outcomeLine(event: OddsEvent, marketKey: string, outcomeName: string) {
  for (const bookmaker of event.bookmakers || []) {
    const market = bookmaker.markets.find((entry) => entry.key === marketKey);
    const outcome = market?.outcomes.find((entry) => entry.name === outcomeName);
    if (typeof outcome?.point === "number" && Number.isFinite(outcome.point)) return outcome.point;
  }
  return null;
}

function normalizeOddsApiEvents(sport: AggregatedSport, events: OddsEvent[]): BookEventOdds[] {
  const entries: BookEventOdds[] = [];

  for (const event of events) {
    const homeAbbrev = normalizeTeamName(event.home_team, sport);
    const awayAbbrev = normalizeTeamName(event.away_team, sport);
    if (!isKnownSportTeam(homeAbbrev, sport) || !isKnownSportTeam(awayAbbrev, sport)) continue;

    for (const bookmaker of event.bookmakers || []) {
      const moneylineMarket = bookmaker.markets.find((market) => market.key === "h2h");
      const spreadMarket = bookmaker.markets.find((market) => market.key === "spreads");
      const totalMarket = bookmaker.markets.find((market) => market.key === "totals");
      if (!moneylineMarket && !spreadMarket && !totalMarket) continue;

      const odds = {
        ...makeEmptyBookOdds(bookmaker.title, isoNow()),
        homeML: moneylineMarket?.outcomes.find((outcome) => outcome.name === event.home_team)?.price ?? null,
        awayML: moneylineMarket?.outcomes.find((outcome) => outcome.name === event.away_team)?.price ?? null,
        spread: spreadMarket?.outcomes.find((outcome) => outcome.name === event.home_team)?.point ?? null,
        spreadOdds: spreadMarket?.outcomes.find((outcome) => outcome.name === event.home_team)?.price ?? null,
        homeSpread: spreadMarket?.outcomes.find((outcome) => outcome.name === event.home_team)?.point ?? null,
        homeSpreadOdds: spreadMarket?.outcomes.find((outcome) => outcome.name === event.home_team)?.price ?? null,
        awaySpread: spreadMarket?.outcomes.find((outcome) => outcome.name === event.away_team)?.point ?? null,
        awaySpreadOdds: spreadMarket?.outcomes.find((outcome) => outcome.name === event.away_team)?.price ?? null,
        total: totalMarket?.outcomes.find((outcome) => outcome.name === "Over")?.point ?? null,
        overOdds: totalMarket?.outcomes.find((outcome) => outcome.name === "Over")?.price ?? null,
        underOdds: totalMarket?.outcomes.find((outcome) => outcome.name === "Under")?.price ?? null,
      };

      entries.push({
        gameId: buildAggregatedGameId(sport, homeAbbrev, awayAbbrev, event.commence_time),
        sourceEventId: `${event.id}:${normalizeBookKey(bookmaker.title)}`,
        sport,
        book: bookmaker.title,
        homeTeam: getCanonicalTeamName(homeAbbrev, sport),
        awayTeam: getCanonicalTeamName(awayAbbrev, sport),
        homeAbbrev,
        awayAbbrev,
        commenceTime: event.commence_time || null,
        oddsApiEventId: event.id,
        odds,
      });
    }
  }

  return entries;
}

async function fetchOddsApiSource(sport: AggregatedSport): Promise<BookEventOdds[]> {
  const sportKey = ODDS_API_SPORT_KEYS[sport];
  const apiKey = process.env.ODDS_API_KEY;
  if (!sportKey || !apiKey || apiKey === "your_key_here") return [];

  try {
    const res = await fetch(
      `${ODDS_API_BASE}/sports/${sportKey}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
      { next: { revalidate: 900 } },
    );
    if (!res.ok) return [];
    const events = await res.json() as OddsEvent[];
    return normalizeOddsApiEvents(sport, Array.isArray(events) ? events : []);
  } catch {
    return [];
  }
}

function getSportFetchers(sport: AggregatedSport) {
  return [
    bovada.fetchOdds(sport),
    kambi.fetchOdds(sport),
    pointsbet.fetchOdds(sport),
    pinnacle.fetchOdds(sport),
    espnDraftKings.fetchOdds(sport),
    fetchOddsApiSource(sport),
  ];
}

export async function getAggregatedOddsForSport(sport: AggregatedSport): Promise<AggregatedOdds[]> {
  const cached = sportCache.get(sport);
  if (shouldUseCached(cached)) {
    return cached!.data;
  }

  const sourceResults = await Promise.allSettled(getSportFetchers(sport));
  const entries = sourceResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const aggregated = aggregateEntries(sport, entries);
  sportCache.set(sport, { data: aggregated, timestamp: Date.now() });
  return aggregated;
}

export async function getAggregatedOddsBoard(
  sports: AggregatedSport[] = SUPPORTED_AGGREGATION_SPORTS,
): Promise<Record<AggregatedSport, AggregatedOdds[]>> {
  const key = sports.slice().sort().join(",");
  const cached = boardCache.get(key);
  if (shouldUseCached(cached)) {
    return cached!.data;
  }

  const pairs = await Promise.all(
    sports.map(async (sport) => [sport, await getAggregatedOddsForSport(sport)] as const),
  );

  const board = Object.fromEntries(
    SUPPORTED_AGGREGATION_SPORTS.map((sport) => [sport, [] as AggregatedOdds[]]),
  ) as Record<AggregatedSport, AggregatedOdds[]>;

  for (const [sport, odds] of pairs) {
    board[sport] = odds;
  }

  boardCache.set(key, { data: board, timestamp: Date.now() });
  return board;
}

export function aggregatedOddsToOddsEvent(event: AggregatedOdds): OddsEvent {
  const id = event.oddsApiEventId || `${AGGREGATED_EVENT_ID_PREFIX}${event.gameId}`;

  return {
    id,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    commence_time: event.commenceTime || "",
    bookmakers: event.books.map((book) => {
      const markets = [];

      if (book.homeML !== null || book.awayML !== null) {
        markets.push({
          key: "h2h",
          outcomes: [
            ...(typeof book.homeML === "number" ? [{ name: event.homeTeam, price: book.homeML }] : []),
            ...(typeof book.awayML === "number" ? [{ name: event.awayTeam, price: book.awayML }] : []),
          ],
        });
      }

      if (
        (typeof book.homeSpread === "number" && typeof book.homeSpreadOdds === "number")
        || (typeof book.awaySpread === "number" && typeof book.awaySpreadOdds === "number")
      ) {
        markets.push({
          key: "spreads",
          outcomes: [
            ...(typeof book.homeSpread === "number" && typeof book.homeSpreadOdds === "number"
              ? [{ name: event.homeTeam, price: book.homeSpreadOdds, point: book.homeSpread }]
              : []),
            ...(typeof book.awaySpread === "number" && typeof book.awaySpreadOdds === "number"
              ? [{ name: event.awayTeam, price: book.awaySpreadOdds, point: book.awaySpread }]
              : []),
          ],
        });
      }

      if (
        typeof book.total === "number"
        && ((typeof book.overOdds === "number") || (typeof book.underOdds === "number"))
      ) {
        markets.push({
          key: "totals",
          outcomes: [
            ...(typeof book.overOdds === "number" ? [{ name: "Over", price: book.overOdds, point: book.total }] : []),
            ...(typeof book.underOdds === "number" ? [{ name: "Under", price: book.underOdds, point: book.total }] : []),
          ],
        });
      }

      return {
        key: normalizeBookKey(book.book),
        title: book.book,
        markets,
      };
    }),
  };
}

export async function getAggregatedOddsEvents(sport: AggregatedSport): Promise<OddsEvent[]> {
  const aggregated = await getAggregatedOddsForSport(sport);
  return aggregated.map(aggregatedOddsToOddsEvent);
}

export function isSyntheticAggregatedEventId(eventId?: string | null) {
  return String(eventId || "").startsWith(AGGREGATED_EVENT_ID_PREFIX);
}

export function filterAggregatedOddsToToday(events: AggregatedOdds[]) {
  const today = new Date().toISOString().slice(0, 10);
  return events.filter((event) => {
    if (!event.commenceTime) return true;
    const parsed = new Date(event.commenceTime);
    if (Number.isNaN(parsed.getTime())) return true;
    return parsed.toISOString().slice(0, 10) === today;
  });
}

export function getAggregatedOddsSummary(event: AggregatedOdds) {
  return {
    eventId: event.oddsApiEventId || `${AGGREGATED_EVENT_ID_PREFIX}${event.gameId}`,
    moneyline: {
      home: outcomePrice(aggregatedOddsToOddsEvent(event), "h2h", event.homeTeam),
      away: outcomePrice(aggregatedOddsToOddsEvent(event), "h2h", event.awayTeam),
    },
    spread: {
      home: outcomeLine(aggregatedOddsToOddsEvent(event), "spreads", event.homeTeam),
      away: outcomeLine(aggregatedOddsToOddsEvent(event), "spreads", event.awayTeam),
    },
    total: {
      over: outcomeLine(aggregatedOddsToOddsEvent(event), "totals", "Over"),
      under: outcomeLine(aggregatedOddsToOddsEvent(event), "totals", "Under"),
    },
  };
}
