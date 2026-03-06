export interface Team {
  id: string;
  name: string;
  city: string;
  abbrev: string;
  logo: string; // emoji for now
  record: { wins: number; losses: number; otl: number };
  homeRecord: { wins: number; losses: number; otl: number };
  awayRecord: { wins: number; losses: number; otl: number };
  last10: { wins: number; losses: number; otl: number };
  goalsFor: number;
  goalsAgainst: number;
  gamesPlayed: number;
}

export interface GameOdds {
  homeML: number;
  awayML: number;
  puckLineHome: number;
  puckLineAway: number;
  puckLineHomeSpread: number; // always -1.5 or +1.5
  puckLineAwaySpread: number;
  overUnder: number;
  overOdds: number;
  underOdds: number;
}

export interface Game {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  time: string;
  date: string;
  odds: GameOdds;
  venue: string;
  status: "upcoming" | "live" | "final";
  homeScore?: number;
  awayScore?: number;
}

export interface Trend {
  id: string;
  description: string;
  teamId?: string;
  type: "home_away" | "over_under" | "h2h" | "recent_form" | "situational";
  sampleSize: number;
  hits: number;
  hitRate: number;
  avgOdds: number;
  theoreticalROI: number;
  confidence: number; // 1-5
  relatedGameId?: string;
}

export interface Bet {
  id: string;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  betType: "moneyline" | "puck_line" | "over_under";
  pick: string; // e.g. "BOS ML", "Over 6.5"
  odds: number;
  amount: number;
  potentialPayout: number;
  status: "pending" | "won" | "lost";
  placedAt: string;
  resolvedAt?: string;
}

export interface BankrollState {
  balance: number;
  initialBalance: number;
  bets: Bet[];
}
