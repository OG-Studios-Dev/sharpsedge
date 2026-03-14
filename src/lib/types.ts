export type League = "All" | "NHL" | "NBA" | "NFL" | "MLB" | "Serie A" | "EPL" | "WNBA" | "NCAAB" | "NCAAF" | "AFL";

export type LeagueCategory = {
  name: string;
  leagues: League[];
};

export type TrendSplit = {
  label: string;
  hitRate: number;
  hits: number;
  total: number;
  type?: "last_n" | "vs_opponent" | "home_away" | "without_player";
};

export type TrendIndicator = {
  type: "hot" | "vs_opponent" | "home_away" | "without_player";
  active: boolean;
};

export type PlayerProp = {
  id: string;
  playerName: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway: boolean;
  propType: string;
  line: number;
  overUnder: "Over" | "Under";
  odds: number;
  book?: string;
  impliedProb?: number;
  hitRate?: number;
  edge?: number;
  score?: number;
  splits: TrendSplit[];
  indicators?: TrendIndicator[];
  league: League;
  recommendation?: string;
  direction?: "Over" | "Under";
  confidence?: number;
  confidenceBreakdown?: {
    recentForm: number;
    matchup: number;
    situational: number;
  };
  rollingAverages?: {
    last5: number | null;
    last10: number | null;
  };
  isBackToBack?: boolean;
  recentGames?: number[];
  reasoning?: string;
  summary?: string;
  matchup?: string;
  saved?: boolean;
  savedAt?: string;
  playerId?: number;
  projection?: number | null;
  fairOdds?: number | null;
  fairProbability?: number | null;
  edgePct?: number | null;
  statsSource?: "live-nhl" | "live-nba" | "seed";
  gameId?: string;
};

export type TeamTrend = {
  id: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway: boolean;
  betType: string;
  line: string;
  gameId?: string;
  odds: number;
  book?: string;
  impliedProb?: number;
  hitRate?: number;
  edge?: number;
  splits: TrendSplit[];
  indicators?: TrendIndicator[];
  league: League;
};

export type ParlayLeg = {
  playerName: string;
  team: string;
  teamColor: string;
  propType: string;
  line: number;
  overUnder: "Over" | "Under";
  odds: number;
  book?: string;
};

export type Parlay = {
  id: string;
  category: string;
  legs: ParlayLeg[];
  splits: TrendSplit[];
  league: League;
};

export type SGP = {
  id: string;
  matchup: string;
  legs: ParlayLeg[];
  splits: TrendSplit[];
  indicators?: TrendIndicator[];
  league: League;
};

export type NHLGame = {
  id: number;
  startTimeUTC: string;
  gameState: string;
  oddsEventId?: string;
  awayTeam: {
    abbrev: string;
    name?: string;
    score?: number;
    logo?: string;
  };
  homeTeam: {
    abbrev: string;
    name?: string;
    score?: number;
    logo?: string;
  };
  bestMoneyline?: {
    home?: { odds: number; book: string } | null;
    away?: { odds: number; book: string } | null;
  };
};

export type ScheduleResponse = {
  games: NHLGame[];
  date: string;
};

export type OddsMarket = {
  key: string;
  outcomes: {
    name: string;
    price: number;
    point?: number;
    description?: string;
  }[];
};

export type OddsEvent = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: {
    key: string;
    title: string;
    markets: OddsMarket[];
  }[];
};

export type AIPick = {
  id: string;
  date: string;
  type: "player" | "team";
  playerName?: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway: boolean;
  propType?: string;
  line?: number;
  direction?: "Over" | "Under";
  betType?: string;
  pickLabel: string;
  edge: number;
  hitRate: number;
  confidence: number;
  reasoning: string;
  result: "pending" | "win" | "loss" | "push";
  units: 1;
  gameId?: string;
  odds: number;
  book?: string;
  league?: string; // "NHL", "NBA", etc.
};
