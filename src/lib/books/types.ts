export type AggregatedSport = "NHL" | "NBA" | "MLB" | "NFL" | "PGA" | "EPL" | "SERIE_A";

export const SUPPORTED_AGGREGATION_SPORTS: AggregatedSport[] = ["NHL", "NBA", "MLB", "NFL", "PGA", "EPL", "SERIE_A"];

export type AggregatedBookOdds = {
  book: string;
  homeML: number | null;
  awayML: number | null;
  spread: number | null;
  spreadOdds: number | null;
  homeSpread: number | null;
  homeSpreadOdds: number | null;
  awaySpread: number | null;
  awaySpreadOdds: number | null;
  total: number | null;
  overOdds: number | null;
  underOdds: number | null;
  lastUpdated: string;
};

export type AggregatedSidePrice = {
  odds: number;
  book: string;
};

export type AggregatedTotalPrice = {
  odds: number;
  line: number;
  book: string;
};

export type AggregatedSpreadPrice = {
  odds: number;
  line: number;
  book: string;
};

export type AggregatedOdds = {
  gameId: string;
  oddsApiEventId?: string | null;
  sport: AggregatedSport;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string;
  awayAbbrev: string;
  commenceTime: string | null;
  books: AggregatedBookOdds[];
  bestHome: AggregatedSidePrice | null;
  bestAway: AggregatedSidePrice | null;
  bestHomeSpread: AggregatedSpreadPrice | null;
  bestAwaySpread: AggregatedSpreadPrice | null;
  bestOver: AggregatedTotalPrice | null;
  bestUnder: AggregatedTotalPrice | null;
};

export type BookEventOdds = {
  gameId: string;
  sourceEventId: string;
  sport: AggregatedSport;
  book: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev: string;
  awayAbbrev: string;
  commenceTime: string | null;
  oddsApiEventId?: string | null;
  odds: AggregatedBookOdds;
};
