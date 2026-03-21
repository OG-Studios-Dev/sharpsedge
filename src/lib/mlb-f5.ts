import { getAllOdds, getBestOdds } from "@/lib/odds-api";
import { type MLBGame } from "@/lib/mlb-api";
import { type OddsEvent } from "@/lib/types";

export type MLBF5MarketSide = {
  line: number | null;
  odds: number | null;
  book: string | null;
};

export type MLBF5Moneyline = {
  home: MLBF5MarketSide | null;
  away: MLBF5MarketSide | null;
};

export type MLBF5Total = {
  line: number | null;
  overOdds: number | null;
  overBook: string | null;
  underOdds: number | null;
  underBook: string | null;
};

export type MLBF5MarketSnapshot = {
  available: boolean;
  completeness: "none" | "partial" | "full";
  supportedMarkets: string[];
  moneyline: MLBF5Moneyline | null;
  total: MLBF5Total | null;
  source: {
    feed: "aggregated-odds-event";
    eventId: string | null;
    fetchedAt: string;
    staleAfter: string;
    notes: string[];
  };
};

function addMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function firstMarket(event: OddsEvent, marketKey: string) {
  const outcomes = event.bookmakers.flatMap((bookmaker) => {
    const market = bookmaker.markets.find((entry) => entry.key === marketKey);
    if (!market) return [];
    return market.outcomes.map((outcome) => ({ ...outcome, book: bookmaker.title }));
  });
  return outcomes;
}

function bestF5Total(event: OddsEvent): MLBF5Total | null {
  const totals = firstMarket(event, "totals_1st_5_innings");
  if (!totals.length) return null;
  const candidateLine = totals.find((outcome) => outcome.name === "Over" && typeof outcome.point === "number")?.point ?? null;
  const over = candidateLine == null ? null : getBestOdds(event, "totals_1st_5_innings", "Over", candidateLine);
  const under = candidateLine == null ? null : getBestOdds(event, "totals_1st_5_innings", "Under", candidateLine);
  return {
    line: candidateLine,
    overOdds: over?.odds ?? null,
    overBook: over?.book ?? null,
    underOdds: under?.odds ?? null,
    underBook: under?.book ?? null,
  };
}

function bestF5Moneyline(event: OddsEvent, game: MLBGame): MLBF5Moneyline | null {
  const home = getBestOdds(event, "h2h_1st_5_innings", event.home_team);
  const away = getBestOdds(event, "h2h_1st_5_innings", event.away_team);
  if (!home && !away) return null;
  return {
    home: {
      line: null,
      odds: home?.odds ?? null,
      book: home?.book ?? null,
    },
    away: {
      line: null,
      odds: away?.odds ?? null,
      book: away?.book ?? null,
    },
  };
}

export function buildMLBF5MarketSnapshot(game: MLBGame, event: OddsEvent | null | undefined): MLBF5MarketSnapshot {
  const fetchedAt = new Date().toISOString();
  const notes = [
    "F5 markets are surfaced only when books/feed entries explicitly expose first-five keys.",
    "No synthetic F5 pricing is inferred from full-game lines.",
  ];

  if (!event) {
    return {
      available: false,
      completeness: "none",
      supportedMarkets: [],
      moneyline: null,
      total: null,
      source: {
        feed: "aggregated-odds-event",
        eventId: game.oddsEventId ?? null,
        fetchedAt,
        staleAfter: addMinutes(fetchedAt, 15),
        notes: [...notes, "No matched odds event was available for this game."],
      },
    };
  }

  const moneyline = bestF5Moneyline(event, game);
  const total = bestF5Total(event);
  const supportedMarkets = [
    ...(moneyline ? ["moneyline"] : []),
    ...(total ? ["total"] : []),
  ];
  const completeness = supportedMarkets.length === 0 ? "none" : supportedMarkets.length === 2 ? "full" : "partial";

  return {
    available: supportedMarkets.length > 0,
    completeness,
    supportedMarkets,
    moneyline,
    total,
    source: {
      feed: "aggregated-odds-event",
      eventId: event.id,
      fetchedAt,
      staleAfter: addMinutes(fetchedAt, 15),
      notes,
    },
  };
}
