import { BookOdds } from "@/lib/types";
import { PlayerTrendGame, SupportedTrendLeague, getTrendGameStatValue } from "@/lib/player-trend";

export type PlayerResearchStatOption = {
  key: string;
  label: string;
  shortLabel: string;
};

export type PlayerNextGame = {
  gameId?: string;
  opponent: string;
  team: string;
  isAway: boolean;
  startTimeUTC?: string;
  display: string;
};

export type PlayerIdentity = {
  playerId?: string | number | null;
  position: string;
  positionLabel: string;
  jerseyNumber?: string | number | null;
  injuryStatus?: string | null;
};

export type DefenseRankingCell = {
  label: string;
  rank: number;
  sampleSize: number;
  value: number;
};

export type DefenseGrid = {
  opponent: string;
  position: string;
  overall: DefenseRankingCell[];
  vsPosition: DefenseRankingCell[];
  teamCount: number;
};

export type PlayerResearchResponse = {
  league: SupportedTrendLeague;
  playerId?: number;
  playerName?: string;
  team?: string;
  teamColor?: string;
  headshot?: string | null;
  oddsComparison?: BookOdds[];
  games: PlayerTrendGame[];
  previousSeasonGames?: PlayerTrendGame[];
  availableStats: PlayerResearchStatOption[];
  nextGame?: PlayerNextGame | null;
  player: PlayerIdentity;
  defenseGrid?: DefenseGrid | null;
};

export type PlayerGameFilters = {
  opponent?: string;
  venue?: "all" | "home" | "away";
  minMinutes?: number;
  maxMinutes?: number;
};

export const NBA_PLAYER_RESEARCH_STATS: PlayerResearchStatOption[] = [
  { key: "Points", label: "Points", shortLabel: "PTS" },
  { key: "Rebounds", label: "Rebounds", shortLabel: "REB" },
  { key: "Assists", label: "Assists", shortLabel: "AST" },
  { key: "PTS+REB+AST", label: "PTS+REB+AST", shortLabel: "PRA" },
  { key: "3PM", label: "3PM", shortLabel: "3PM" },
];

export const NHL_PLAYER_RESEARCH_STATS: PlayerResearchStatOption[] = [
  { key: "Goals", label: "Goals", shortLabel: "G" },
  { key: "Assists", label: "Assists", shortLabel: "A" },
  { key: "Points", label: "Points", shortLabel: "PTS" },
  { key: "Shots", label: "Shots", shortLabel: "SOG" },
];

export function getPlayerResearchStats(league: SupportedTrendLeague): PlayerResearchStatOption[] {
  return league === "NBA" ? NBA_PLAYER_RESEARCH_STATS : NHL_PLAYER_RESEARCH_STATS;
}

export function getDefaultPlayerResearchStat(league: SupportedTrendLeague) {
  return getPlayerResearchStats(league)[0]?.key ?? "Points";
}

export function normalizePlayerResearchStat(league: SupportedTrendLeague, value?: string | null) {
  const stats = getPlayerResearchStats(league);
  const match = stats.find((option) => option.key === value || option.label === value || option.shortLabel === value);
  return match?.key ?? getDefaultPlayerResearchStat(league);
}

export function didResearchStatHit(value: number, line: number, direction: "Over" | "Under") {
  return direction === "Under" ? value < line : value > line;
}

export function parseClockMinutes(value?: string | null) {
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) || 0;
  const [minutes, seconds] = value.split(":").map(Number);
  if (!Number.isFinite(minutes)) return 0;
  return minutes + ((Number.isFinite(seconds) ? seconds : 0) / 60);
}

export function getGameMinutesPlayed(game: PlayerTrendGame) {
  if (typeof game.minutesPlayed === "number" && Number.isFinite(game.minutesPlayed)) {
    return game.minutesPlayed;
  }
  return parseClockMinutes(game.minutes);
}

export function filterPlayerResearchGames(games: PlayerTrendGame[], filters: PlayerGameFilters) {
  return games.filter((game) => {
    const opponent = (filters.opponent || "").toUpperCase();
    if (opponent && game.opponentAbbrev.toUpperCase() !== opponent) return false;

    if (filters.venue === "home" && !game.isHome) return false;
    if (filters.venue === "away" && game.isHome) return false;

    const minutes = getGameMinutesPlayed(game);
    if (typeof filters.minMinutes === "number" && minutes < filters.minMinutes) return false;
    if (typeof filters.maxMinutes === "number" && minutes > filters.maxMinutes) return false;

    return true;
  });
}

export function getPlayerResearchHitRate(
  games: PlayerTrendGame[],
  league: SupportedTrendLeague,
  statKey: string,
  line: number,
  direction: "Over" | "Under"
) {
  if (!games.length) return null;
  const hits = games.filter((game) => didResearchStatHit(getTrendGameStatValue(game, statKey, league), line, direction)).length;
  return Number(((hits / games.length) * 100).toFixed(1));
}

export function formatNextGameDisplay(team: string, opponent: string, isAway: boolean, startTimeUTC?: string) {
  if (!team || !opponent) return "Game TBD";
  const matchup = `${team} ${isAway ? "@" : "vs"} ${opponent}`;
  if (!startTimeUTC) return matchup;
  const start = new Date(startTimeUTC);
  const day = start.toLocaleDateString("en-US", { weekday: "short" });
  const time = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
  return `${matchup} ${day} ${time}`;
}

export function getDefenseRankTone(rank: number, teamCount = 30) {
  if (rank <= 10) return "good";
  if (rank <= Math.min(20, Math.max(10, teamCount - 10))) return "neutral";
  return "bad";
}

export function rankToEdgeScore(rank: number, teamCount = 30) {
  if (rank <= 0 || teamCount <= 1) return 50;
  const clampedRank = Math.min(Math.max(rank, 1), teamCount);
  return Math.round(((teamCount - clampedRank) / (teamCount - 1)) * 100);
}

export function getDvpLabel(rank: number, teamCount = 30) {
  const score = rankToEdgeScore(rank, teamCount);
  if (score >= 68) return "MISMATCH";
  if (score <= 34) return "TOUGH";
  return "NEUTRAL";
}

export function ordinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

export function getOpponentOptions(games: PlayerTrendGame[]) {
  return Array.from(new Set(games.map((game) => game.opponentAbbrev).filter(Boolean)));
}
