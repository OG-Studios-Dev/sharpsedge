import { AIPick, League, PlayerProp, TrendIndicator, TrendSplit } from "@/lib/types";

export type SupportedTrendLeague = Extract<League, "NHL" | "NBA" | "MLB">;

export type PlayerTrendGame = {
  gameId: string;
  date: string;
  teamAbbrev?: string;
  opponent: string;
  opponentAbbrev: string;
  isHome: boolean;
  result: "W" | "L" | null;
  score: string;
  goals?: number;
  assists?: number;
  points?: number;
  shots?: number;
  rebounds?: number;
  threePointersMade?: number;
  steals?: number;
  blocks?: number;
  minutes?: string;
  minutesPlayed?: number;
  hits?: number;
  totalBases?: number;
  homeRuns?: number;
  rbis?: number;
  runs?: number;
  stolenBases?: number;
  strikeOuts?: number;
  inningsPitched?: number;
  earnedRuns?: number;
  hitsAllowed?: number;
};

type SplitReadyGame = {
  opponentAbbrev?: string;
  isHome: boolean;
};

type PlayerTrendLinkInput = {
  book?: string;
  gameId?: string;
  isAway?: boolean;
  league?: string;
  line?: number;
  odds?: number;
  oddsEventId?: string;
  opponent?: string;
  overUnder?: "Over" | "Under";
  playerId?: number;
  playerName?: string;
  propType?: string;
  team?: string;
  teamColor?: string;
};

export function slugifyPlayerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
}

function resolveTrendLeague(league?: string): SupportedTrendLeague {
  if (league === "NBA") return "NBA";
  if (league === "MLB") return "MLB";
  return "NHL";
}

function resolveTrendRouteId(input: PlayerTrendLinkInput): string {
  const league = resolveTrendLeague(input.league);
  if (league === "NHL" && input.playerId) {
    return String(input.playerId);
  }

  return slugifyPlayerName(input.playerName || "player");
}

function setIfDefined(params: URLSearchParams, key: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === null || value === "") return;
  params.set(key, String(value));
}

export function buildPlayerTrendHref(input: PlayerTrendLinkInput): string {
  const params = new URLSearchParams();
  const league = resolveTrendLeague(input.league);

  setIfDefined(params, "league", league);
  setIfDefined(params, "playerName", input.playerName);
  setIfDefined(params, "team", input.team);
  setIfDefined(params, "teamColor", input.teamColor);
  setIfDefined(params, "opponent", input.opponent);
  setIfDefined(params, "propType", input.propType);
  setIfDefined(params, "line", input.line);
  setIfDefined(params, "overUnder", input.overUnder);
  setIfDefined(params, "odds", input.odds);
  setIfDefined(params, "book", input.book);
  setIfDefined(params, "isAway", input.isAway);
  setIfDefined(params, "gameId", input.gameId);
  setIfDefined(params, "oddsEventId", input.oddsEventId);
  setIfDefined(params, "playerId", input.playerId);

  const query = params.toString();
  return `/player/${resolveTrendRouteId(input)}/trend${query ? `?${query}` : ""}`;
}

export function getPlayerTrendHrefFromProp(prop: PlayerProp): string {
  return buildPlayerTrendHref({
    book: prop.book,
    gameId: prop.gameId,
    isAway: prop.isAway,
    league: prop.league,
    line: prop.line,
    odds: prop.odds,
    oddsEventId: prop.oddsEventId,
    opponent: prop.opponent,
    overUnder: prop.direction || prop.overUnder,
    playerId: prop.playerId,
    playerName: prop.playerName,
    propType: prop.propType,
    team: prop.team,
    teamColor: prop.teamColor,
  });
}

export function getPlayerTrendHrefFromPick(pick: AIPick): string | null {
  if (pick.type !== "player" || !pick.playerName || !pick.propType || typeof pick.line !== "number") {
    return null;
  }
  if (resolveTrendLeague(pick.league) === "NHL" && !pick.playerId) {
    return null;
  }

  return buildPlayerTrendHref({
    book: pick.book,
    gameId: pick.gameId,
    isAway: pick.isAway,
    league: pick.league,
    line: pick.line,
    odds: pick.odds,
    oddsEventId: pick.oddsEventId,
    opponent: pick.opponent,
    overUnder: pick.direction,
    playerId: pick.playerId,
    playerName: pick.playerName,
    propType: pick.propType,
    team: pick.team,
    teamColor: pick.teamColor,
  });
}

function toHitRate(hits: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((hits / total) * 100).toFixed(1));
}

function buildSplit(label: string, games: number[], type: TrendSplit["type"]): TrendSplit {
  const hits = games.filter((value) => value === 1).length;
  const total = games.length;
  return {
    label,
    hitRate: toHitRate(hits, total),
    hits,
    total,
    type,
  };
}

export function buildPlayerSplits<T extends SplitReadyGame>(params: {
  games: T[];
  didHit: (game: T) => boolean;
  isAway: boolean;
  opponent?: string;
  lastN?: number;
}): TrendSplit[] {
  const lastN = params.lastN ?? 10;
  const opponent = (params.opponent || "").toUpperCase();
  const venueLabel = params.isAway ? "Away" : "Home";

  const lastNGames = params.games.slice(0, lastN).map((game) => (params.didHit(game) ? 1 : 0));
  const opponentGames = params.games
    .filter((game) => (game.opponentAbbrev || "").toUpperCase() === opponent)
    .map((game) => (params.didHit(game) ? 1 : 0));
  const venueGames = params.games
    .filter((game) => game.isHome !== params.isAway)
    .map((game) => (params.didHit(game) ? 1 : 0));

  return [
    buildSplit(`L${Math.min(lastN, params.games.length)}`, lastNGames, "last_n"),
    buildSplit(`vs ${opponent || "OPP"}`, opponentGames, "vs_opponent"),
    buildSplit(venueLabel, venueGames, "home_away"),
    {
      label: "Coming soon",
      hitRate: 0,
      hits: 0,
      total: 0,
      type: "without_player",
    },
  ];
}

export function getSplitByType(splits: TrendSplit[] | undefined, type: NonNullable<TrendSplit["type"]>) {
  return splits?.find((split) => split.type === type);
}

export function hasIndicator(indicators: TrendIndicator[] | undefined, type: TrendIndicator["type"]) {
  return indicators?.some((indicator) => indicator.type === type && indicator.active) ?? false;
}

export function formatTrendOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function parseTrendBoolean(value: string | null | undefined) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function getTrendGameStatValue(game: PlayerTrendGame, propType: string, league: SupportedTrendLeague): number {
  if (league === "NBA") {
    if (propType === "Points") return game.points ?? 0;
    if (propType === "Rebounds") return game.rebounds ?? 0;
    if (propType === "Assists") return game.assists ?? 0;
    if (propType === "Steals") return game.steals ?? 0;
    if (propType === "Blocks") return game.blocks ?? 0;
    if (propType === "PTS+REB+AST" || propType === "Points+Rebounds+Assists" || propType === "PRA") {
      return (game.points ?? 0) + (game.rebounds ?? 0) + (game.assists ?? 0);
    }
    if (propType === "3-Pointers Made" || propType === "3PM") return game.threePointersMade ?? 0;
    return game.points ?? 0;
  }

  if (league === "MLB") {
    if (propType === "Hits") return game.hits ?? 0;
    if (propType === "Total Bases") return game.totalBases ?? 0;
    if (propType === "Home Runs" || propType === "HRs") return game.homeRuns ?? 0;
    if (propType === "RBIs") return game.rbis ?? 0;
    if (propType === "Runs Scored" || propType === "Runs") return game.runs ?? 0;
    if (propType === "Stolen Bases" || propType === "SBs") return game.stolenBases ?? 0;
    if (propType === "Strikeouts" || propType === "Strikeouts (K)" || propType === "K") return game.strikeOuts ?? 0;
    if (propType === "Earned Runs") return game.earnedRuns ?? 0;
    if (propType === "Innings Pitched") return game.inningsPitched ?? 0;
    if (propType === "Hits Allowed") return game.hitsAllowed ?? 0;
    return game.hits ?? 0;
  }

  if (propType === "Goals") return game.goals ?? 0;
  if (propType === "Assists") return game.assists ?? 0;
  if (propType === "Shots on Goal" || propType === "Shots") return game.shots ?? 0;
  return game.points ?? 0;
}
