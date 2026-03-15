import { buildPlayerTrendHref, getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import { buildNHLStatsPropFeed, getGameLog } from "@/lib/nhl-stats-engine";
import {
  NHL_TEAM_COLORS,
  getGameGoalies,
  getNHLGameLanding,
  getTeamStandings,
  type GoalieStarter,
  type TeamStandingRow,
} from "@/lib/nhl-api";
import { findOddsForGame, getNHLOdds } from "@/lib/odds-api";
import type { NHLGame } from "@/lib/types";
import type {
  MatchupComparisonView,
  MatchupInsight,
  MatchupLineup,
  MatchupPageData,
  MatchupPlayerCard,
  MatchupPropCard,
  MatchupStarter,
  MatchupStatus,
  MatchupTeamSummary,
} from "@/lib/matchup-types";

type NHLStatKey = "goals" | "assists" | "shots" | "hits" | "blocks" | "ppPct" | "points";
type SkaterPositionGroup = "F" | "D";

type RankedStat = { avg: number; rank: number };
type TeamRankMap = Record<string, Record<NHLStatKey, RankedStat>>;
type DvpRankMap = Record<string, Record<SkaterPositionGroup, Record<NHLStatKey, RankedStat>>>;

type TeamAccumulator = {
  games: number;
  stats: Record<NHLStatKey, number>;
};

type DvpAccumulator = Record<SkaterPositionGroup, TeamAccumulator>;

type LeagueDataset = {
  standings: TeamStandingRow[];
  offense: TeamRankMap;
  defense: TeamRankMap;
  dvp: DvpRankMap;
};

const NHL_BASE = "https://api-web.nhle.com/v1";
const SEASON = "20252026";
const CACHE_TTL = 15 * 60 * 1000;
const TEAM_SAMPLE = 8;

const NHL_MATCHUP_STATS: Array<{ key: NHLStatKey; label: string; shortLabel: string }> = [
  { key: "goals", label: "Goals", shortLabel: "G" },
  { key: "assists", label: "Assists", shortLabel: "A" },
  { key: "shots", label: "Shots", shortLabel: "SOG" },
  { key: "hits", label: "Hits", shortLabel: "HIT" },
  { key: "blocks", label: "Blocks", shortLabel: "BLK" },
  { key: "ppPct", label: "PP%", shortLabel: "PP%" },
];

let leagueCache: { expiresAt: number; data: LeagueDataset | null } = {
  expiresAt: 0,
  data: null,
};

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { next: { revalidate: 900 } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function getClubSchedule(teamAbbrev: string) {
  const data = await fetchJSON<{ games?: any[] }>(`${NHL_BASE}/club-schedule-season/${teamAbbrev}/${SEASON}`);
  return Array.isArray(data?.games) ? data.games : [];
}

async function getGameBoxscore(gameId: string | number) {
  return fetchJSON<any>(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
}

function createTeamAccumulator(): TeamAccumulator {
  return {
    games: 0,
    stats: {
      goals: 0,
      assists: 0,
      shots: 0,
      hits: 0,
      blocks: 0,
      ppPct: 0,
      points: 0,
    },
  };
}

function createDvpAccumulator(): DvpAccumulator {
  return {
    F: createTeamAccumulator(),
    D: createTeamAccumulator(),
  };
}

function normalizePositionGroup(positionCode: string): SkaterPositionGroup {
  return String(positionCode || "").toUpperCase() === "D" ? "D" : "F";
}

function teamName(team: any) {
  const place = team?.placeName?.default || team?.placeName || "";
  const common = team?.commonName?.default || team?.commonName || "";
  return [place, common].filter(Boolean).join(" ").trim() || team?.name?.default || team?.abbrev || "";
}

function ordinal(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  const mod10 = rank % 10;
  if (mod10 === 1) return `${rank}st`;
  if (mod10 === 2) return `${rank}nd`;
  if (mod10 === 3) return `${rank}rd`;
  return `${rank}th`;
}

function statLabel(statKey: NHLStatKey) {
  return NHL_MATCHUP_STATS.find((stat) => stat.key === statKey)?.label || statKey;
}

function propTypeToStatKey(propType?: string, positionCode?: string): NHLStatKey {
  if (propType === "Goals") return "goals";
  if (propType === "Assists") return "assists";
  if (propType === "Shots on Goal") return "shots";
  if (propType === "Points") return "points";
  return normalizePositionGroup(positionCode || "") === "D" ? "shots" : "points";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseToi(toi: string) {
  const [minutes, seconds] = String(toi || "0:00").split(":").map(Number);
  return (minutes || 0) + ((seconds || 0) / 60);
}

function parsePowerPlayPct(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw <= 1 ? Number((raw * 100).toFixed(1)) : Number(raw.toFixed(1));
  }

  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (value.includes("/")) {
    const [goals, chances] = value.split("/").map((item) => parseFloat(item));
    if (Number.isFinite(goals) && Number.isFinite(chances) && chances > 0) {
      return Number(((goals / chances) * 100).toFixed(1));
    }
  }

  const numeric = parseFloat(value.replace("%", ""));
  return Number.isFinite(numeric) ? Number(numeric.toFixed(1)) : null;
}

function readStatLabel(row: any) {
  return String(
    row?.category ||
      row?.key ||
      row?.label ||
      row?.name ||
      row?.title ||
      row?.stat ||
      ""
  ).toLowerCase();
}

function readSideValue(row: any, side: "home" | "away") {
  const direct = side === "home"
    ? row?.homeValue ?? row?.homeTeamValue ?? row?.home ?? row?.value?.home
    : row?.awayValue ?? row?.awayTeamValue ?? row?.away ?? row?.value?.away;
  if (direct !== undefined) return direct;

  if (side === "home" && Array.isArray(row?.values)) return row.values[0];
  if (side === "away" && Array.isArray(row?.values)) return row.values[1];

  return side === "home" ? row?.value : row?.value;
}

function collectRows(node: any, rows: any[] = [], depth = 0): any[] {
  if (depth > 4 || node == null) return rows;
  if (Array.isArray(node)) {
    for (const item of node) collectRows(item, rows, depth + 1);
    return rows;
  }
  if (typeof node !== "object") return rows;

  const hasLabel = ["category", "key", "label", "name", "title", "stat"].some((key) => key in node);
  const hasValue = ["homeValue", "awayValue", "homeTeamValue", "awayTeamValue", "value", "values", "home", "away"].some((key) => key in node);
  if (hasLabel && hasValue) rows.push(node);

  for (const value of Object.values(node)) {
    collectRows(value, rows, depth + 1);
  }
  return rows;
}

function extractPowerPlayPct(boxscore: any, side: "home" | "away") {
  const directCandidates = [
    side === "home" ? boxscore?.homeTeam?.powerPlayPct : boxscore?.awayTeam?.powerPlayPct,
    side === "home" ? boxscore?.summary?.homeTeam?.powerPlayPct : boxscore?.summary?.awayTeam?.powerPlayPct,
    side === "home" ? boxscore?.summary?.powerPlay?.home : boxscore?.summary?.powerPlay?.away,
  ];

  for (const candidate of directCandidates) {
    const parsed = parsePowerPlayPct(candidate);
    if (parsed !== null) return parsed;
  }

  const rows = collectRows(boxscore?.summary || boxscore?.teamGameStats || []);
  for (const row of rows) {
    const label = readStatLabel(row);
    if (!label.includes("power")) continue;
    const parsed = parsePowerPlayPct(readSideValue(row, side));
    if (parsed !== null) return parsed;
  }

  return 0;
}

function getSkatersForSide(boxscore: any, side: "homeTeam" | "awayTeam") {
  const teamStats = boxscore?.playerByGameStats?.[side] || {};
  return [
    ...(teamStats.forwards || []),
    ...(teamStats.defense || []),
  ];
}

function sumSkaterStats(skaters: any[], ppPct: number): Record<NHLStatKey, number> {
  return skaters.reduce<Record<NHLStatKey, number>>((totals, skater) => {
    const goals = toNumber(skater.goals);
    const assists = toNumber(skater.assists);
    totals.goals += goals;
    totals.assists += assists;
    totals.points += goals + assists;
    totals.shots += toNumber(skater.shots ?? skater.sog);
    totals.hits += toNumber(skater.hits);
    totals.blocks += toNumber(skater.blockedShots ?? skater.blocks);
    return totals;
  }, {
    goals: 0,
    assists: 0,
    shots: 0,
    hits: 0,
    blocks: 0,
    ppPct,
    points: 0,
  });
}

function sumByPosition(skaters: any[]): Record<SkaterPositionGroup, Record<NHLStatKey, number>> {
  const totals: Record<SkaterPositionGroup, Record<NHLStatKey, number>> = {
    F: { goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, ppPct: 0, points: 0 },
    D: { goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, ppPct: 0, points: 0 },
  };

  for (const skater of skaters) {
    const position = normalizePositionGroup(skater.positionCode || skater.position || "");
    const goals = toNumber(skater.goals);
    const assists = toNumber(skater.assists);
    totals[position].goals += goals;
    totals[position].assists += assists;
    totals[position].points += goals + assists;
    totals[position].shots += toNumber(skater.shots ?? skater.sog);
    totals[position].hits += toNumber(skater.hits);
    totals[position].blocks += toNumber(skater.blockedShots ?? skater.blocks);
  }

  return totals;
}

function upsertTeamAccumulator(store: Map<string, TeamAccumulator>, team: string) {
  const existing = store.get(team);
  if (existing) return existing;
  const next = createTeamAccumulator();
  store.set(team, next);
  return next;
}

function upsertDvpAccumulator(store: Map<string, DvpAccumulator>, team: string) {
  const existing = store.get(team);
  if (existing) return existing;
  const next = createDvpAccumulator();
  store.set(team, next);
  return next;
}

function buildRankMap(source: Map<string, TeamAccumulator>, descending: boolean): TeamRankMap {
  const teams = Array.from(source.keys());
  const output: TeamRankMap = {};

  for (const team of teams) {
    output[team] = {
      goals: { avg: 0, rank: teams.length || 32 },
      assists: { avg: 0, rank: teams.length || 32 },
      shots: { avg: 0, rank: teams.length || 32 },
      hits: { avg: 0, rank: teams.length || 32 },
      blocks: { avg: 0, rank: teams.length || 32 },
      ppPct: { avg: 0, rank: teams.length || 32 },
      points: { avg: 0, rank: teams.length || 32 },
    };
  }

  for (const stat of [
    { key: "goals" as const },
    { key: "assists" as const },
    { key: "shots" as const },
    { key: "hits" as const },
    { key: "blocks" as const },
    { key: "ppPct" as const },
    { key: "points" as const },
  ]) {
    const ranked = teams
      .map((team) => {
        const entry = source.get(team);
        const avg = entry && entry.games > 0 ? entry.stats[stat.key] / entry.games : 0;
        return { team, avg };
      })
      .sort((a, b) => descending ? b.avg - a.avg : a.avg - b.avg);

    ranked.forEach((entry, index) => {
      output[entry.team][stat.key] = {
        avg: Number(entry.avg.toFixed(1)),
        rank: index + 1,
      };
    });
  }

  return output;
}

function buildDvpRankMap(source: Map<string, DvpAccumulator>): DvpRankMap {
  const teams = Array.from(source.keys());
  const output: DvpRankMap = {};

  for (const team of teams) {
    output[team] = {
      F: {
        goals: { avg: 0, rank: teams.length || 32 },
        assists: { avg: 0, rank: teams.length || 32 },
        shots: { avg: 0, rank: teams.length || 32 },
        hits: { avg: 0, rank: teams.length || 32 },
        blocks: { avg: 0, rank: teams.length || 32 },
        ppPct: { avg: 0, rank: teams.length || 32 },
        points: { avg: 0, rank: teams.length || 32 },
      },
      D: {
        goals: { avg: 0, rank: teams.length || 32 },
        assists: { avg: 0, rank: teams.length || 32 },
        shots: { avg: 0, rank: teams.length || 32 },
        hits: { avg: 0, rank: teams.length || 32 },
        blocks: { avg: 0, rank: teams.length || 32 },
        ppPct: { avg: 0, rank: teams.length || 32 },
        points: { avg: 0, rank: teams.length || 32 },
      },
    };
  }

  for (const group of ["F", "D"] as SkaterPositionGroup[]) {
    for (const stat of ["goals", "assists", "shots", "hits", "blocks", "points"] as NHLStatKey[]) {
      const ranked = teams
        .map((team) => {
          const entry = source.get(team)?.[group];
          const avg = entry && entry.games > 0 ? entry.stats[stat] / entry.games : 0;
          return { team, avg };
        })
        .sort((a, b) => b.avg - a.avg);

      ranked.forEach((entry, index) => {
        output[entry.team][group][stat] = {
          avg: Number(entry.avg.toFixed(1)),
          rank: index + 1,
        };
      });
    }
  }

  return output;
}

async function getLeagueDataset(): Promise<LeagueDataset> {
  if (leagueCache.data && Date.now() < leagueCache.expiresAt) {
    return leagueCache.data;
  }

  const standings = await getTeamStandings();
  const schedules = await Promise.all(standings.map((standing) => getClubSchedule(standing.teamAbbrev)));
  const teamGameIds = new Map<string, string[]>();
  const uniqueGameIds = new Set<string>();

  standings.forEach((standing, index) => {
    const completedGames = schedules[index]
      .filter((game) => game?.gameState === "OFF")
      .slice(-TEAM_SAMPLE)
      .reverse()
      .map((game) => String(game.id));
    teamGameIds.set(standing.teamAbbrev, completedGames);
    completedGames.forEach((gameId) => uniqueGameIds.add(gameId));
  });

  const boxscoreCache = new Map<string, any>();
  const allGameIds = Array.from(uniqueGameIds);
  const BATCH = 10;

  for (let index = 0; index < allGameIds.length; index += BATCH) {
    const batch = allGameIds.slice(index, index + BATCH);
    await Promise.all(
      batch.map(async (gameId) => {
        const boxscore = await getGameBoxscore(gameId);
        if (boxscore) boxscoreCache.set(gameId, boxscore);
      })
    );
  }

  const offenseTotals = new Map<string, TeamAccumulator>();
  const defenseTotals = new Map<string, TeamAccumulator>();
  const dvpTotals = new Map<string, DvpAccumulator>();

  for (const standing of standings) {
    const gameIds = teamGameIds.get(standing.teamAbbrev) || [];
    for (const gameId of gameIds) {
      const boxscore = boxscoreCache.get(gameId);
      if (!boxscore) continue;

      const isHome = boxscore?.homeTeam?.abbrev === standing.teamAbbrev;
      const side = isHome ? "homeTeam" : "awayTeam";
      const opponentSide = isHome ? "awayTeam" : "homeTeam";

      const teamSkaters = getSkatersForSide(boxscore, side);
      const opponentSkaters = getSkatersForSide(boxscore, opponentSide);
      const offense = upsertTeamAccumulator(offenseTotals, standing.teamAbbrev);
      const defense = upsertTeamAccumulator(defenseTotals, standing.teamAbbrev);

      offense.games += 1;
      defense.games += 1;

      const ownStats = sumSkaterStats(teamSkaters, extractPowerPlayPct(boxscore, isHome ? "home" : "away"));
      const opponentStats = sumSkaterStats(opponentSkaters, extractPowerPlayPct(boxscore, isHome ? "away" : "home"));

      for (const stat of ["goals", "assists", "shots", "hits", "blocks", "ppPct", "points"] as NHLStatKey[]) {
        offense.stats[stat] += ownStats[stat];
        defense.stats[stat] += opponentStats[stat];
      }

      const dvp = upsertDvpAccumulator(dvpTotals, standing.teamAbbrev);
      const byPosition = sumByPosition(opponentSkaters);
      for (const group of ["F", "D"] as SkaterPositionGroup[]) {
        dvp[group].games += 1;
        for (const stat of ["goals", "assists", "shots", "hits", "blocks", "points"] as NHLStatKey[]) {
          dvp[group].stats[stat] += byPosition[group][stat];
        }
      }
    }
  }

  const data: LeagueDataset = {
    standings,
    offense: buildRankMap(offenseTotals, true),
    defense: buildRankMap(defenseTotals, false),
    dvp: buildDvpRankMap(dvpTotals),
  };

  leagueCache = {
    data,
    expiresAt: Date.now() + CACHE_TTL,
  };

  return data;
}

function formatET(date: string) {
  if (!date) return "TBD";
  return `${new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  })} · ${new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  })} ET`;
}

function buildStatus(landing: any): MatchupStatus {
  const state = String(landing?.gameState || "");
  if (state === "OFF" || state === "FINAL") {
    return {
      code: "FINAL",
      label: "FINAL",
      detail: "Final",
    };
  }

  if (state === "LIVE" || state === "CRIT") {
    const period = landing?.periodDescriptor?.number ? `P${landing.periodDescriptor.number}` : "LIVE";
    const clock = landing?.clock?.timeRemaining || landing?.clock?.timeRemainingInPeriod || "";
    return {
      code: "LIVE",
      label: "LIVE",
      detail: clock ? `${period} · ${clock}` : period,
    };
  }

  return {
    code: "FUT",
    label: "FUT",
    detail: formatET(landing?.startTimeUTC || ""),
  };
}

function buildInsights(awayStanding: TeamStandingRow | null, homeStanding: TeamStandingRow | null): MatchupInsight[] {
  const insights: MatchupInsight[] = [];

  if (awayStanding) {
    insights.push({
      label: `${awayStanding.teamAbbrev} road`,
      value: `${awayStanding.roadWins}-${awayStanding.roadLosses}-${awayStanding.roadOtLosses}`,
      tone: awayStanding.roadWins >= awayStanding.roadLosses ? "positive" : "neutral",
    });
    insights.push({
      label: `${awayStanding.teamAbbrev} streak`,
      value: awayStanding.streakCode || "—",
      tone: awayStanding.streakCode.startsWith("W") ? "positive" : "neutral",
    });
  }

  if (homeStanding) {
    insights.push({
      label: `${homeStanding.teamAbbrev} home`,
      value: `${homeStanding.homeWins}-${homeStanding.homeLosses}-${homeStanding.homeOtLosses}`,
      tone: homeStanding.homeWins >= homeStanding.homeLosses ? "positive" : "neutral",
    });
    insights.push({
      label: `${homeStanding.teamAbbrev} points`,
      value: `${homeStanding.points} pts`,
      tone: homeStanding.points >= (awayStanding?.points ?? 0) ? "positive" : "neutral",
    });
  }

  return insights;
}

function compareRanks(offenseRank: number, defenseRank: number) {
  if (offenseRank + 4 < defenseRank) return "offense" as const;
  if (defenseRank + 4 < offenseRank) return "defense" as const;
  return "even" as const;
}

function buildComparisonViews(awayAbbrev: string, homeAbbrev: string, dataset: LeagueDataset): MatchupComparisonView[] {
  const buildView = (offenseTeam: string, defenseTeam: string): MatchupComparisonView => ({
    id: `${offenseTeam.toLowerCase()}-offense`,
    label: `${offenseTeam} offense vs ${defenseTeam} defense`,
    offenseTeam,
    defenseTeam,
    stats: NHL_MATCHUP_STATS.map((stat) => {
      const offense = dataset.offense[offenseTeam]?.[stat.key] || { avg: 0, rank: 32 };
      const defense = dataset.defense[defenseTeam]?.[stat.key] || { avg: 0, rank: 32 };
      return {
        key: stat.key,
        label: stat.label,
        offenseRank: offense.rank,
        offenseValue: offense.avg,
        defenseRank: defense.rank,
        defenseValue: defense.avg,
        advantage: compareRanks(offense.rank, defense.rank),
      };
    }),
  });

  return [
    buildView(awayAbbrev, homeAbbrev),
    buildView(homeAbbrev, awayAbbrev),
  ];
}

function buildDvpText(opponent: string, positionCode: string, statKey: NHLStatKey, dataset: LeagueDataset) {
  const position = normalizePositionGroup(positionCode);
  const matchup = dataset.dvp[opponent]?.[position]?.[statKey];
  if (!matchup) return `vs ${opponent} (DVP building)`;
  return `vs ${opponent} (${ordinal(matchup.rank)}-most ${statLabel(statKey)} to ${position})`;
}

async function findRecentDiscoveryPlayers(teamAbbrev: string, currentGameId: string) {
  const currentBoxscore = await getGameBoxscore(currentGameId);
  const currentPlayers = currentBoxscore
    ? getSkatersForSide(currentBoxscore, currentBoxscore.homeTeam?.abbrev === teamAbbrev ? "homeTeam" : "awayTeam")
    : [];

  if (currentPlayers.length >= 5) {
    return currentPlayers;
  }

  const schedule = await getClubSchedule(teamAbbrev);
  const recentCompleted = schedule
    .filter((game) => game?.gameState === "OFF")
    .slice(-1)
    .map((game) => String(game.id))[0];

  if (!recentCompleted) return currentPlayers;

  const fallbackBoxscore = await getGameBoxscore(recentCompleted);
  if (!fallbackBoxscore) return currentPlayers;

  return getSkatersForSide(
    fallbackBoxscore,
    fallbackBoxscore.homeTeam?.abbrev === teamAbbrev ? "homeTeam" : "awayTeam"
  );
}

function goalieStatusLabel(goalie: GoalieStarter) {
  if (goalie.status === "confirmed") return "Confirmed";
  if (goalie.status === "probable") return "Probable";
  return "TBD";
}

function goalieSubtitle(goalie: GoalieStarter) {
  return `SV% ${goalie.savePct.toFixed(3)} · GAA ${goalie.gaa.toFixed(2)} · ${goalie.wins}-${goalie.losses}-${goalie.otLosses}`;
}

async function buildTeamPlayers(params: {
  teamAbbrev: string;
  opponentAbbrev: string;
  isAway: boolean;
  gameId: string;
  bestPropByPlayer: Map<string, any>;
  dataset: LeagueDataset;
}): Promise<MatchupPlayerCard[]> {
  const { teamAbbrev, opponentAbbrev, isAway, gameId, bestPropByPlayer, dataset } = params;
  const discoveryPlayers = await findRecentDiscoveryPlayers(teamAbbrev, gameId);

  const candidates = discoveryPlayers
    .sort((a, b) => parseToi(b.toi || b.timeOnIce || "0:00") - parseToi(a.toi || a.timeOnIce || "0:00") || toNumber(b.points) - toNumber(a.points))
    .slice(0, 8);

  const playerCards: MatchupPlayerCard[] = [];

  for (const player of candidates) {
    const playerId = Number(player.playerId || player.id || 0);
    if (!playerId) continue;

    const logs = await getGameLog(playerId);
    const recentLogs = logs.slice(0, 10);
    if (recentLogs.length < 3) continue;

    const avgToi = recentLogs.reduce((sum, log) => sum + parseToi(log.toi), 0) / recentLogs.length;
    const avgPoints = recentLogs.reduce((sum, log) => sum + log.points, 0) / recentLogs.length;
    const avgGoals = recentLogs.reduce((sum, log) => sum + log.goals, 0) / recentLogs.length;
    const avgAssists = recentLogs.reduce((sum, log) => sum + log.assists, 0) / recentLogs.length;
    const avgShots = recentLogs.reduce((sum, log) => sum + log.shots, 0) / recentLogs.length;

    const positionCode = player.positionCode || player.position || "F";
    const bestProp = bestPropByPlayer.get(String(player.name?.default || `${player.firstName?.default || ""} ${player.lastName?.default || ""}` || "").toLowerCase());
    const propType = bestProp?.propType || (normalizePositionGroup(positionCode) === "D" ? "Shots on Goal" : "Points");
    const statKey = propTypeToStatKey(propType, positionCode);
    const name = player.name?.default || [player.firstName?.default, player.lastName?.default].filter(Boolean).join(" ").trim() || "Player";

    playerCards.push({
      id: `${teamAbbrev}-${playerId}`,
      playerId,
      name,
      team: teamAbbrev,
      opponent: opponentAbbrev,
      position: positionCode,
      sortValue: avgToi * 10 + avgPoints,
      avgMinutes: Number(avgToi.toFixed(1)),
      seasonStats: [
        { label: "PTS", value: Number(avgPoints.toFixed(1)) },
        { label: "G", value: Number(avgGoals.toFixed(1)) },
        { label: "A", value: Number(avgAssists.toFixed(1)) },
        { label: "SOG", value: Number(avgShots.toFixed(1)) },
        { label: "TOI", value: Number(avgToi.toFixed(1)) },
      ],
      dvp: buildDvpText(opponentAbbrev, positionCode, statKey, dataset),
      trendHref: buildPlayerTrendHref({
        league: "NHL",
        playerId,
        playerName: name,
        team: teamAbbrev,
        opponent: opponentAbbrev,
        propType,
        line: bestProp?.line,
        overUnder: bestProp?.overUnder || "Over",
        odds: bestProp?.odds,
        book: bestProp?.book,
        oddsEventId: bestProp?.oddsEventId,
        isAway,
        gameId,
        teamColor: NHL_TEAM_COLORS[teamAbbrev] || "#4a9eff",
      }),
    });
  }

  return playerCards
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 5);
}

function normalizeProps(props: any[]): MatchupPropCard[] {
  return props.map((prop) => ({
    id: prop.id,
    playerName: prop.playerName,
    team: prop.team,
    opponent: prop.opponent,
    propType: prop.propType,
    overUnder: prop.overUnder,
    line: prop.line,
    odds: prop.odds,
    book: prop.book,
    hitRate: typeof prop.hitRate === "number" ? prop.hitRate : null,
    edgePct: typeof prop.edgePct === "number"
      ? prop.edgePct
      : typeof prop.edge === "number"
        ? prop.edge
        : null,
    trendHref: getPlayerTrendHrefFromProp(prop),
  }));
}

export async function getNHLMatchupData(gameId: string): Promise<MatchupPageData | null> {
  const numericGameId = parseInt(gameId, 10);
  if (!Number.isFinite(numericGameId)) return null;

  const [landing, dataset, odds, goalies] = await Promise.all([
    getNHLGameLanding(numericGameId),
    getLeagueDataset(),
    getNHLOdds(),
    getGameGoalies(numericGameId),
  ]);

  if (!landing) return null;

  const awayAbbrev = landing.awayTeam?.abbrev || "";
  const homeAbbrev = landing.homeTeam?.abbrev || "";
  const standingMap = new Map(dataset.standings.map((standing) => [standing.teamAbbrev, standing]));
  const awayStanding = standingMap.get(awayAbbrev) || null;
  const homeStanding = standingMap.get(homeAbbrev) || null;
  const status = buildStatus(landing);

  const game: NHLGame = {
    id: numericGameId,
    startTimeUTC: landing.startTimeUTC || "",
    gameState: landing.gameState || "",
    awayTeam: {
      abbrev: awayAbbrev,
      name: teamName(landing.awayTeam),
      score: landing.awayTeam?.score,
      logo: landing.awayTeam?.logo,
    },
    homeTeam: {
      abbrev: homeAbbrev,
      name: teamName(landing.homeTeam),
      score: landing.homeTeam?.score,
      logo: landing.homeTeam?.logo,
    },
  };

  const oddsEvent = findOddsForGame(odds, homeAbbrev, awayAbbrev);
  const props = await buildNHLStatsPropFeed(
    [{ ...game, oddsEventId: oddsEvent?.id }],
    { maxGames: 1, maxForwards: 8, maxDefense: 4 }
  );
  const propsForGame = normalizeProps(props);

  const bestPropByPlayer = new Map<string, any>();
  for (const prop of props) {
    const key = prop.playerName.toLowerCase();
    const current = bestPropByPlayer.get(key);
    const currentEdge = typeof current?.edgePct === "number" ? current.edgePct : current?.edge ?? -Infinity;
    const nextEdge = typeof prop.edgePct === "number" ? prop.edgePct : prop.edge ?? -Infinity;
    if (!current || nextEdge > currentEdge) {
      bestPropByPlayer.set(key, prop);
    }
  }

  const [awayPlayers, homePlayers] = await Promise.all([
    buildTeamPlayers({
      teamAbbrev: awayAbbrev,
      opponentAbbrev: homeAbbrev,
      isAway: true,
      gameId,
      bestPropByPlayer,
      dataset,
    }),
    buildTeamPlayers({
      teamAbbrev: homeAbbrev,
      opponentAbbrev: awayAbbrev,
      isAway: false,
      gameId,
      bestPropByPlayer,
      dataset,
    }),
  ]);

  const lineup: MatchupLineup = {
    title: "Starting Goalies",
    note: "Goalie status is pulled from gamecenter matchup and live boxscore data.",
    away: goalies.away ? [{
      id: `goalie-${goalies.away.playerId}`,
      name: goalies.away.name,
      subtitle: goalieSubtitle(goalies.away),
      badge: goalieStatusLabel(goalies.away),
    }] : [],
    home: goalies.home ? [{
      id: `goalie-${goalies.home.playerId}`,
      name: goalies.home.name,
      subtitle: goalieSubtitle(goalies.home),
      badge: goalieStatusLabel(goalies.home),
    }] : [],
  };

  const awaySummary: MatchupTeamSummary = {
    abbrev: awayAbbrev,
    name: awayAbbrev,
    fullName: teamName(landing.awayTeam),
    logo: landing.awayTeam?.logo,
    color: NHL_TEAM_COLORS[awayAbbrev] || "#334155",
    record: awayStanding
      ? `${awayStanding.wins}-${awayStanding.losses}-${awayStanding.otLosses}`
      : "0-0-0",
    score: typeof landing.awayTeam?.score === "number" ? landing.awayTeam.score : null,
  };

  const homeSummary: MatchupTeamSummary = {
    abbrev: homeAbbrev,
    name: homeAbbrev,
    fullName: teamName(landing.homeTeam),
    logo: landing.homeTeam?.logo,
    color: NHL_TEAM_COLORS[homeAbbrev] || "#334155",
    record: homeStanding
      ? `${homeStanding.wins}-${homeStanding.losses}-${homeStanding.otLosses}`
      : "0-0-0",
    score: typeof landing.homeTeam?.score === "number" ? landing.homeTeam.score : null,
  };

  return {
    league: "NHL",
    gameId,
    header: {
      away: awaySummary,
      home: homeSummary,
      status,
    },
    insights: buildInsights(awayStanding, homeStanding),
    comparisonViews: buildComparisonViews(awayAbbrev, homeAbbrev, dataset),
    players: {
      away: awayPlayers,
      home: homePlayers,
    },
    lineup,
    props: propsForGame.sort((a, b) => (b.edgePct || 0) - (a.edgePct || 0)),
    propFilters: Array.from(new Set(propsForGame.map((prop) => prop.propType))).sort(),
  };
}
