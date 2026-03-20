export type League = "All" | "NHL" | "NBA" | "NFL" | "MLB" | "PGA" | "LIV" | "Serie A" | "EPL" | "WNBA" | "NCAAB" | "NCAAF" | "AFL";

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
  type: "hot" | "vs_opponent" | "home_away" | "without_player" | "goose_lean" | "money" | "lock" | "streak";
  active: boolean;
};

export type BookOdds = {
  book: string;
  odds: number;
  line: number;
  impliedProbability: number;
};

export type BookOddsBySide = {
  home?: BookOdds[] | null;
  away?: BookOdds[] | null;
};

export type BookOddsByTotal = {
  over?: BookOdds[] | null;
  under?: BookOdds[] | null;
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
  bookOdds?: BookOdds[];
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
  gameDate?: string;
  projection?: number | null;
  fairOdds?: number | null;
  fairProbability?: number | null;
  edgePct?: number | null;
  statsSource?: "live-nhl" | "live-nba" | "seed";
  gameId?: string;
  oddsEventId?: string;
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
  gameDate?: string;
  odds: number;
  book?: string;
  bookOdds?: BookOdds[];
  impliedProb?: number;
  hitRate?: number;
  edge?: number;
  splits: TrendSplit[];
  indicators?: TrendIndicator[];
  league: League;
  oddsEventId?: string;
};

export type ParlayLeg = {
  playerName: string;
  team: string;
  teamColor: string;
  opponent?: string;
  propType: string;
  line: number;
  overUnder: "Over" | "Under";
  odds: number;
  book?: string;
  hitRate?: number;
  hits?: number;
  total?: number;
  league?: League;
  gameId?: string;
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
  gameId?: string;
  combinedHitRate?: number;
  legCount?: number;
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
  moneylineBookOdds?: BookOddsBySide;
};

export type MLBProbablePitcher = {
  id: string;
  name: string;
  hand?: string;
  era?: number | null;
  wins?: number;
  losses?: number;
};

export type MLBGameOddsSide = {
  odds: number;
  book: string;
  line?: number;
};

export type MLBGameTotalOdds = {
  line: number;
  over?: MLBGameOddsSide | null;
  under?: MLBGameOddsSide | null;
};

export type MLBGame = {
  id: string;
  date: string;
  startTimeUTC: string;
  status: string;
  statusDetail: string;
  inning?: string;
  oddsEventId?: string;
  awayTeam: {
    id: string;
    abbreviation: string;
    fullName: string;
    record: string;
    logo?: string;
    probablePitcher?: MLBProbablePitcher | null;
  };
  homeTeam: {
    id: string;
    abbreviation: string;
    fullName: string;
    record: string;
    logo?: string;
    probablePitcher?: MLBProbablePitcher | null;
  };
  awayScore: number | null;
  homeScore: number | null;
  bestMoneyline?: {
    home?: MLBGameOddsSide | null;
    away?: MLBGameOddsSide | null;
  };
  moneylineBookOdds?: BookOddsBySide;
  bestRunLine?: {
    home?: MLBGameOddsSide | null;
    away?: MLBGameOddsSide | null;
  };
  runLineBookOdds?: BookOddsBySide;
  bestTotal?: MLBGameTotalOdds | null;
  totalBookOdds?: BookOddsByTotal | null;
};

export type GolfTournamentStatus = "upcoming" | "in-progress" | "completed";

export type GolfPlayerSeasonStats = {
  scoringAverage: number | null;
  drivingAccuracy: number | null;
  gir: number | null;
  puttingAverage: number | null;
};

export type GolfPlayerHistoryResult = {
  tournamentId: string;
  tournamentName: string;
  course: string;
  date: string;
  finish: string;
  score: string;
  roundScores?: number[];
  madeCut?: boolean;
};

export type GolfPlayerHitRates = {
  top5: number;
  top10: number;
  top20: number;
  madeCut: number;
  firstRoundLeader: number;
  under70_5: number;
};

export type GolfTournament = {
  id: string;
  name: string;
  dates: string;
  course: string;
  purse: string;
  status: GolfTournamentStatus;
  tour?: "PGA" | "LIV";
  startDate?: string;
  endDate?: string;
  location?: string;
  coursePar?: number | null;
  courseYardage?: number | null;
  round?: number | null;
  statusDetail?: string;
  current?: boolean;
  cutLine?: string | null;
};

export type GolfPlayer = {
  id: string;
  name: string;
  position: string;
  score: string;
  todayScore: string;
  thru: string;
  teeTime: string;
  status?: string;
  roundScores?: number[];
  recentForm?: GolfPlayerHistoryResult[];
  courseHistory?: GolfPlayerHistoryResult[];
  seasonStats?: GolfPlayerSeasonStats | null;
  hitRates?: GolfPlayerHitRates;
  image?: string;
  outrightOdds?: number | null;
  outrightBook?: string | null;
  compositeScore?: number | null;
  formScore?: number | null;
  courseHistoryScore?: number | null;
  courseFitScore?: number | null;
  combinedScore?: number | null;
  modelProb?: number | null;
  bookProb?: number | null;
  edge?: number | null;
  top5Prob?: number | null;
  top10Prob?: number | null;
  top20Prob?: number | null;
  dgRank?: number | null;
  dgWinProb?: number | null;
  dgTop5Prob?: number | null;
  dgTop10Prob?: number | null;
  dgTop20Prob?: number | null;
  dgCourseFit?: number | null;
  sgTotal?: number | null;
  sgT2G?: number | null;
};

export type GolfLeaderboard = {
  tournament: GolfTournament;
  players: GolfPlayer[];
  cutLine?: string | null;
  lastUpdated?: string | null;
  statusBadge?: string;
};

export type GolfOutrightOdds = {
  playerName: string;
  odds: number;
  book: string;
};

export type GolfHeadToHeadOdds = {
  matchup: string;
  playerA: string;
  playerB: string;
  playerAOdds: number;
  playerBOdds: number;
  book: string;
};

export type GolfOddsBoard = {
  sportKey: string;
  tournament: string;
  commenceTime?: string;
  outrights: GolfOutrightOdds[];
  h2h: GolfHeadToHeadOdds[];
};

export type GolfPredictionMarket = "Tournament Winner" | "Top 5 Finish" | "Top 10 Finish" | "Top 20 Finish";

export type GolfPrediction = GolfPlayer & {
  formScore: number;
  courseHistoryScore: number;
  courseFitScore: number;
  combinedScore: number;
  modelProb: number;
  bookProb: number | null;
  edge: number | null;
  bookOdds: number | null;
  top5Prob: number;
  top10Prob: number;
  top20Prob: number;
};

export type GolfValuePlay = {
  market: GolfPredictionMarket;
  modelProb: number;
  bookProb: number | null;
  edge: number | null;
  player: GolfPrediction;
};

export type GolfHeadToHeadPrediction = {
  matchup: string;
  playerA: string;
  playerB: string;
  playerAOdds: number;
  playerBOdds: number;
  book: string;
  bookProbA: number;
  bookProbB: number;
  modelProbA: number;
  modelProbB: number;
  modelPick: string | null;
  bookFavorite: string | null;
  valueSide: string | null;
  disagreement: boolean;
};

export type GolfDGCacheSummary = {
  available: boolean;
  populated: boolean;
  fresh: boolean;
  ready: boolean;
  lastScrape: string | null;
  tournament: string | null;
  rankingsCount: number;
  predictionsCount: number;
  courseFitCount: number;
  fieldCount: number;
  matchedPlayers: number;
  totalPlayers: number;
  reason: string;
};

export type GolfPredictionModelSource = "pending-field" | "espn-form" | "datagolf-hybrid";

export type GolfPredictionBoard = {
  tournament: GolfTournament | null;
  generatedAt: string;
  players: GolfPrediction[];
  bestValuePicks: GolfValuePlay[];
  h2hMatchups: GolfHeadToHeadPrediction[];
  dataSources?: {
    model: GolfPredictionModelSource;
    odds: "live-odds" | "model-only";
    datagolf: GolfDGCacheSummary;
  };
};

export type GolfDashboardData = {
  leaderboard: GolfLeaderboard | null;
  schedule: GolfTournament[];
  playerInsights: GolfPlayer[];
  odds: GolfOddsBoard | null;
  predictions: GolfPredictionBoard | null;
  meta: {
    league: "PGA" | "LIV";
    oddsConnected: boolean;
    scheduleCount: number;
    playersCount: number;
    tournamentStatus: GolfTournamentStatus | "none";
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
  playerId?: number;
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
  oddsEventId?: string;
  odds: number;
  book?: string;
  bookOdds?: BookOdds[];
  league?: string; // "NHL", "NBA", etc.
};
