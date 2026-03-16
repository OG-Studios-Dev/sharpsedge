export type MatchupLeague = "NHL" | "NBA";

export type MatchupStatusCode = "FUT" | "LIVE" | "FINAL";

export type MatchupTeamSummary = {
  abbrev: string;
  name: string;
  fullName?: string;
  logo?: string;
  color: string;
  record: string;
  score: number | null;
};

export type MatchupStatus = {
  code: MatchupStatusCode;
  label: string;
  detail: string;
};

export type MatchupInsight = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
};

export type MatchupComparisonMetric = {
  key: string;
  label: string;
  offenseRank: number;
  offenseValue: number;
  defenseRank: number;
  defenseValue: number;
  advantage: "offense" | "defense" | "even";
};

export type MatchupComparisonView = {
  id: string;
  label: string;
  offenseTeam: string;
  defenseTeam: string;
  stats: MatchupComparisonMetric[];
};

export type MatchupPlayerStat = {
  label: string;
  value: number;
  decimals?: number;
};

export type MatchupPlayerCard = {
  id: string;
  playerId?: number;
  name: string;
  team: string;
  opponent: string;
  position: string;
  sortValue: number;
  avgMinutes?: number | null;
  seasonStats: MatchupPlayerStat[];
  dvp: string;
  trendHref: string;
};

export type MatchupStarter = {
  id: string;
  name: string;
  subtitle: string;
  badge?: string;
  trendHref?: string;
};

export type MatchupLineup = {
  title: string;
  note?: string;
  away: MatchupStarter[];
  home: MatchupStarter[];
};

export type MatchupBettingSummary = {
  moneyline: string | null;
  spread: string | null;
  total: string | null;
};

export type MatchupTeamStatBlock = {
  row1: string;
  row2: string;
};

export type MatchupPropCard = {
  id: string;
  playerName: string;
  team: string;
  opponent: string;
  propType: string;
  overUnder: "Over" | "Under";
  line: number;
  odds: number;
  book?: string;
  hitRate?: number | null;
  edgePct?: number | null;
  trendHref: string;
};

export type MatchupPageData = {
  league: MatchupLeague;
  gameId: string;
  header: {
    away: MatchupTeamSummary;
    home: MatchupTeamSummary;
    status: MatchupStatus;
    compact: {
      away: string;
      home: string;
      betting: MatchupBettingSummary;
    };
  };
  teamStats: {
    away: MatchupTeamStatBlock;
    home: MatchupTeamStatBlock;
    seriesNote?: string | null;
  };
  insights: MatchupInsight[];
  comparisonViews: MatchupComparisonView[];
  players: {
    away: MatchupPlayerCard[];
    home: MatchupPlayerCard[];
  };
  lineup: MatchupLineup | null;
  props: MatchupPropCard[];
  propFilters: string[];
};
