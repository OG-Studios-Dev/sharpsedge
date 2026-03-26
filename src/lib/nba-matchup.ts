import { buildPlayerTrendHref, getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import { buildNBAStatsPropFeed } from "@/lib/nba-stats-engine";
import {
  NBA_TEAM_COLORS,
  type NBAGame,
  type NBABoxscorePlayer,
  type NBATeamStanding,
  getNBABoxscore,
  getNBAGameSummary,
  getNBAStandings,
  getRecentNBAGames,
  parseNBARecord,
} from "@/lib/nba-api";
import { findNBAOddsForGame, getNBAOdds } from "@/lib/nba-odds";
import { getBestOdds } from "@/lib/odds-api";
import type { OddsEvent } from "@/lib/types";
import type {
  MatchupComparisonMetric,
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

type NBAStatKey = "points" | "rebounds" | "assists" | "threes" | "blocks" | "steals";
type PositionGroup = "G" | "F" | "C";

type RankedStat = { avg: number; rank: number };
type TeamRankMap = Record<string, Record<NBAStatKey, RankedStat>>;
type DvpRankMap = Record<string, Record<PositionGroup, Record<NBAStatKey, RankedStat>>>;

type TeamAccumulator = {
  games: number;
  stats: Record<NBAStatKey, number>;
};

type DvpAccumulator = Record<PositionGroup, TeamAccumulator>;

type LeagueDataset = {
  recentGames: NBAGame[];
  standings: NBATeamStanding[];
  offense: TeamRankMap;
  defense: TeamRankMap;
  dvp: DvpRankMap;
};

const CACHE_TTL = 15 * 60 * 1000;
const TEAM_SAMPLE = 10;
const RECENT_DAY_WINDOW = 21;

const NBA_MATCHUP_STATS: Array<{ key: NBAStatKey; label: string; shortLabel: string }> = [
  { key: "points", label: "Points", shortLabel: "PTS" },
  { key: "rebounds", label: "Rebounds", shortLabel: "REB" },
  { key: "assists", label: "Assists", shortLabel: "AST" },
  { key: "threes", label: "3PM", shortLabel: "3PM" },
  { key: "blocks", label: "Blocks", shortLabel: "BLK" },
  { key: "steals", label: "Steals", shortLabel: "STL" },
];

let leagueCache: { expiresAt: number; data: LeagueDataset | null } = {
  expiresAt: 0,
  data: null,
};

function createTeamAccumulator(): TeamAccumulator {
  return {
    games: 0,
    stats: {
      points: 0,
      rebounds: 0,
      assists: 0,
      threes: 0,
      blocks: 0,
      steals: 0,
    },
  };
}

function createDvpAccumulator(): DvpAccumulator {
  return {
    G: createTeamAccumulator(),
    F: createTeamAccumulator(),
    C: createTeamAccumulator(),
  };
}

function normalizePositionGroup(position: string): PositionGroup {
  const upper = String(position || "").toUpperCase();
  if (upper.includes("C")) return "C";
  if (upper.includes("F")) return "F";
  return "G";
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

function statLabel(statKey: NBAStatKey): string {
  return NBA_MATCHUP_STATS.find((stat) => stat.key === statKey)?.shortLabel || statKey.toUpperCase();
}

function propTypeToStatKey(propType?: string, position?: string): NBAStatKey {
  if (propType === "Rebounds") return "rebounds";
  if (propType === "Assists") return "assists";
  if (propType === "3-Pointers Made") return "threes";
  if (propType === "Blocks") return "blocks";
  if (propType === "Steals") return "steals";
  const group = normalizePositionGroup(position || "");
  return group === "C" ? "rebounds" : "points";
}

function formatET(date: string) {
  if (!date) return "TBD";
  return `${new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  })} · ${new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })} ET`;
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatOddsValue(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return "—";
  return formatOdds(odds);
}

function buildSeriesRecord(games: NBAGame[], teamAbbrev: string, opponentAbbrev: string) {
  const seriesGames = games.filter((game) => (
    (game.homeTeam.abbreviation === teamAbbrev && game.awayTeam.abbreviation === opponentAbbrev)
    || (game.homeTeam.abbreviation === opponentAbbrev && game.awayTeam.abbreviation === teamAbbrev)
  ));

  if (seriesGames.length === 0) return null;

  let wins = 0;
  for (const game of seriesGames) {
    const isHome = game.homeTeam.abbreviation === teamAbbrev;
    const scoreFor = isHome ? game.homeScore : game.awayScore;
    const scoreAgainst = isHome ? game.awayScore : game.homeScore;
    if ((scoreFor ?? -1) > (scoreAgainst ?? -1)) wins += 1;
  }

  return `${wins}-${seriesGames.length - wins}`;
}

function getBestSpreadForTeam(event: OddsEvent | undefined, teamName: string) {
  if (!event) return null;

  let best: { odds: number; book: string; line: number } | null = null;

  for (const bookmaker of event.bookmakers || []) {
    const market = bookmaker.markets.find((entry) => entry.key === "spreads");
    if (!market) continue;

    for (const outcome of market.outcomes || []) {
      if (outcome.name !== teamName) continue;
      if (typeof outcome.point !== "number" || !Number.isFinite(outcome.point)) continue;
      if (!best || outcome.price > best.odds) {
        best = { odds: outcome.price, book: bookmaker.title, line: outcome.point };
      }
    }
  }

  return best;
}

function getBestTotalForEvent(event: OddsEvent | undefined) {
  if (!event) return null;

  let bestLine: number | null = null;

  for (const bookmaker of event.bookmakers || []) {
    const market = bookmaker.markets.find((entry) => entry.key === "totals");
    if (!market) continue;

    const marketLine = market.outcomes.find((outcome) => outcome.name === "Over" && typeof outcome.point === "number")?.point;
    if (typeof marketLine === "number" && bestLine === null) {
      bestLine = marketLine;
    }
  }

  if (bestLine === null) return null;
  return { line: bestLine };
}

function buildBettingSummary(
  event: OddsEvent | undefined,
  awayAbbrev: string,
  homeAbbrev: string,
  fallback?: { awayML?: number; homeML?: number; spread?: string; overUnder?: number }
) {
  const awayMoneyline = event ? getBestOdds(event, "h2h", event.away_team) : null;
  const homeMoneyline = event ? getBestOdds(event, "h2h", event.home_team) : null;
  const awaySpread = event ? getBestSpreadForTeam(event, event.away_team) : null;
  const homeSpread = event ? getBestSpreadForTeam(event, event.home_team) : null;
  const total = getBestTotalForEvent(event);

  const favorite = homeSpread && homeSpread.line < 0
    ? `${homeAbbrev} ${homeSpread.line}`
    : awaySpread && awaySpread.line < 0
      ? `${awayAbbrev} ${awaySpread.line}`
      : fallback?.spread ?? null;

  return {
    moneyline: awayMoneyline?.odds != null || homeMoneyline?.odds != null
      ? `${awayAbbrev} ${formatOddsValue(awayMoneyline?.odds)} | ${homeAbbrev} ${formatOddsValue(homeMoneyline?.odds)}`
      : typeof fallback?.awayML === "number" || typeof fallback?.homeML === "number"
        ? `${awayAbbrev} ${typeof fallback?.awayML === "number" ? formatOdds(fallback.awayML) : "—"} | ${homeAbbrev} ${typeof fallback?.homeML === "number" ? formatOdds(fallback.homeML) : "—"}`
        : null,
    spread: favorite,
    total: total ? `O/U ${total.line}` : typeof fallback?.overUnder === "number" ? `O/U ${fallback.overUnder}` : null,
  };
}

function buildStatus(date: string, statusType: any): MatchupStatus {
  if (statusType?.completed) {
    return {
      code: "FINAL",
      label: "FINAL",
      detail: statusType?.shortDetail || "Final",
    };
  }

  if (statusType?.state === "in") {
    return {
      code: "LIVE",
      label: "LIVE",
      detail: statusType?.shortDetail || "Live",
    };
  }

  return {
    code: "FUT",
    label: "FUT",
    detail: formatET(date),
  };
}

function getTeamLogo(competitor: any) {
  return competitor?.team?.logo || competitor?.team?.logos?.[0]?.href || "";
}

function matchPlayer(players: NBABoxscorePlayer[], targetName: string) {
  const target = targetName.toLowerCase().trim();
  const parts = target.split(" ").filter(Boolean);
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  return players.find((player) => {
    const name = player.name.toLowerCase();
    return name.includes(first) && name.includes(last);
  }) || null;
}

function teamTotals(players: NBABoxscorePlayer[]): Record<NBAStatKey, number> {
  return players.reduce<Record<NBAStatKey, number>>((totals, player) => {
    totals.points += player.points || 0;
    totals.rebounds += player.rebounds || 0;
    totals.assists += player.assists || 0;
    totals.blocks += player.blocks || 0;
    totals.steals += player.steals || 0;
    totals.threes += parseInt(String(player.threePointers || "0").split("-")[0], 10) || 0;
    return totals;
  }, {
    points: 0,
    rebounds: 0,
    assists: 0,
    threes: 0,
    blocks: 0,
    steals: 0,
  });
}

function positionTotals(players: NBABoxscorePlayer[]): Record<PositionGroup, Record<NBAStatKey, number>> {
  const totals: Record<PositionGroup, Record<NBAStatKey, number>> = {
    G: { points: 0, rebounds: 0, assists: 0, threes: 0, blocks: 0, steals: 0 },
    F: { points: 0, rebounds: 0, assists: 0, threes: 0, blocks: 0, steals: 0 },
    C: { points: 0, rebounds: 0, assists: 0, threes: 0, blocks: 0, steals: 0 },
  };

  for (const player of players) {
    const minutes = parseFloat(player.minutes) || 0;
    if (minutes < 8) continue;

    const group = normalizePositionGroup(player.position);
    totals[group].points += player.points || 0;
    totals[group].rebounds += player.rebounds || 0;
    totals[group].assists += player.assists || 0;
    totals[group].blocks += player.blocks || 0;
    totals[group].steals += player.steals || 0;
    totals[group].threes += parseInt(String(player.threePointers || "0").split("-")[0], 10) || 0;
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

function buildRankMap(
  source: Map<string, TeamAccumulator>,
  descending: boolean
): TeamRankMap {
  const teams = Array.from(source.keys());
  const output: TeamRankMap = {};

  for (const team of teams) {
    output[team] = {
      points: { avg: 0, rank: teams.length || 30 },
      rebounds: { avg: 0, rank: teams.length || 30 },
      assists: { avg: 0, rank: teams.length || 30 },
      threes: { avg: 0, rank: teams.length || 30 },
      blocks: { avg: 0, rank: teams.length || 30 },
      steals: { avg: 0, rank: teams.length || 30 },
    };
  }

  for (const stat of NBA_MATCHUP_STATS) {
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
      G: {
        points: { avg: 0, rank: teams.length || 30 },
        rebounds: { avg: 0, rank: teams.length || 30 },
        assists: { avg: 0, rank: teams.length || 30 },
        threes: { avg: 0, rank: teams.length || 30 },
        blocks: { avg: 0, rank: teams.length || 30 },
        steals: { avg: 0, rank: teams.length || 30 },
      },
      F: {
        points: { avg: 0, rank: teams.length || 30 },
        rebounds: { avg: 0, rank: teams.length || 30 },
        assists: { avg: 0, rank: teams.length || 30 },
        threes: { avg: 0, rank: teams.length || 30 },
        blocks: { avg: 0, rank: teams.length || 30 },
        steals: { avg: 0, rank: teams.length || 30 },
      },
      C: {
        points: { avg: 0, rank: teams.length || 30 },
        rebounds: { avg: 0, rank: teams.length || 30 },
        assists: { avg: 0, rank: teams.length || 30 },
        threes: { avg: 0, rank: teams.length || 30 },
        blocks: { avg: 0, rank: teams.length || 30 },
        steals: { avg: 0, rank: teams.length || 30 },
      },
    };
  }

  for (const group of ["G", "F", "C"] as PositionGroup[]) {
    for (const stat of NBA_MATCHUP_STATS) {
      const ranked = teams
        .map((team) => {
          const entry = source.get(team)?.[group];
          const avg = entry && entry.games > 0 ? entry.stats[stat.key] / entry.games : 0;
          return { team, avg };
        })
        .sort((a, b) => b.avg - a.avg);

      ranked.forEach((entry, index) => {
        output[entry.team][group][stat.key] = {
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

  const [recentGames, standings] = await Promise.all([
    getRecentNBAGames(RECENT_DAY_WINDOW),
    getNBAStandings(),
  ]);

  const uniqueGames = recentGames.slice(0, 90);
  const boxscoreCache = new Map<string, { home: NBABoxscorePlayer[]; away: NBABoxscorePlayer[] }>();
  const BATCH = 12;

  for (let index = 0; index < uniqueGames.length; index += BATCH) {
    const batch = uniqueGames.slice(index, index + BATCH);
    await Promise.all(
      batch.map(async (game) => {
        const boxscore = await getNBABoxscore(game.id);
        if (boxscore.home.length > 0 || boxscore.away.length > 0) {
          boxscoreCache.set(game.id, boxscore);
        }
      })
    );
  }

  const offenseTotals = new Map<string, TeamAccumulator>();
  const defenseTotals = new Map<string, TeamAccumulator>();
  const dvpTotals = new Map<string, DvpAccumulator>();
  const teamCounts = new Map<string, number>();

  for (const game of uniqueGames) {
    const boxscore = boxscoreCache.get(game.id);
    if (!boxscore) continue;

    const homeTeam = game.homeTeam.abbreviation;
    const awayTeam = game.awayTeam.abbreviation;
    const homeCount = teamCounts.get(homeTeam) || 0;
    const awayCount = teamCounts.get(awayTeam) || 0;

    if (homeCount < TEAM_SAMPLE) {
      const homeStats = teamTotals(boxscore.home);
      const awayStats = teamTotals(boxscore.away);
      const offense = upsertTeamAccumulator(offenseTotals, homeTeam);
      const defense = upsertTeamAccumulator(defenseTotals, homeTeam);
      offense.games += 1;
      defense.games += 1;
      for (const stat of NBA_MATCHUP_STATS) {
        offense.stats[stat.key] += homeStats[stat.key];
        defense.stats[stat.key] += awayStats[stat.key];
      }
      const dvp = upsertDvpAccumulator(dvpTotals, homeTeam);
      const positionStats = positionTotals(boxscore.away);
      for (const group of ["G", "F", "C"] as PositionGroup[]) {
        dvp[group].games += 1;
        for (const stat of NBA_MATCHUP_STATS) {
          dvp[group].stats[stat.key] += positionStats[group][stat.key];
        }
      }
      teamCounts.set(homeTeam, homeCount + 1);
    }

    if (awayCount < TEAM_SAMPLE) {
      const homeStats = teamTotals(boxscore.home);
      const awayStats = teamTotals(boxscore.away);
      const offense = upsertTeamAccumulator(offenseTotals, awayTeam);
      const defense = upsertTeamAccumulator(defenseTotals, awayTeam);
      offense.games += 1;
      defense.games += 1;
      for (const stat of NBA_MATCHUP_STATS) {
        offense.stats[stat.key] += awayStats[stat.key];
        defense.stats[stat.key] += homeStats[stat.key];
      }
      const dvp = upsertDvpAccumulator(dvpTotals, awayTeam);
      const positionStats = positionTotals(boxscore.home);
      for (const group of ["G", "F", "C"] as PositionGroup[]) {
        dvp[group].games += 1;
        for (const stat of NBA_MATCHUP_STATS) {
          dvp[group].stats[stat.key] += positionStats[group][stat.key];
        }
      }
      teamCounts.set(awayTeam, awayCount + 1);
    }
  }

  const data: LeagueDataset = {
    recentGames,
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

function buildRecord(
  abbrev: string,
  standingMap: Map<string, NBATeamStanding>,
  competitorRecord?: string
) {
  if (competitorRecord) return competitorRecord;
  const standing = standingMap.get(abbrev);
  if (!standing) return "0-0";
  return `${standing.wins}-${standing.losses}`;
}

function buildInsights(
  awayStanding: NBATeamStanding | null,
  homeStanding: NBATeamStanding | null
): MatchupInsight[] {
  const insights: MatchupInsight[] = [];

  if (awayStanding) {
    const road = parseNBARecord(awayStanding.roadRecord);
    insights.push({
      label: `${awayStanding.teamAbbrev} road`,
      value: `${road.wins}-${road.losses}`,
      tone: road.wins > road.losses ? "positive" : "neutral",
    });
    insights.push({
      label: `${awayStanding.teamAbbrev} last 10`,
      value: awayStanding.last10 || "—",
      tone: awayStanding.streak.startsWith("W") ? "positive" : "neutral",
    });
  }

  if (homeStanding) {
    const home = parseNBARecord(homeStanding.homeRecord);
    insights.push({
      label: `${homeStanding.teamAbbrev} home`,
      value: `${home.wins}-${home.losses}`,
      tone: home.wins > home.losses ? "positive" : "neutral",
    });
    insights.push({
      label: `${homeStanding.teamAbbrev} streak`,
      value: homeStanding.streak || "—",
      tone: homeStanding.streak.startsWith("W") ? "positive" : "warning",
    });
  }

  return insights;
}

function compareRanks(offenseRank: number, defenseRank: number): MatchupComparisonMetric["advantage"] {
  if (offenseRank + 4 < defenseRank) return "offense";
  if (defenseRank + 4 < offenseRank) return "defense";
  return "even";
}

function buildComparisonViews(
  awayAbbrev: string,
  homeAbbrev: string,
  dataset: LeagueDataset
): MatchupComparisonView[] {
  const buildView = (offenseTeam: string, defenseTeam: string): MatchupComparisonView => ({
    id: `${offenseTeam.toLowerCase()}-offense`,
    label: `${offenseTeam} offense vs ${defenseTeam} defense`,
    offenseTeam,
    defenseTeam,
    stats: NBA_MATCHUP_STATS.map((stat) => {
      const offense = dataset.offense[offenseTeam]?.[stat.key] || { avg: 0, rank: 30 };
      const defense = dataset.defense[defenseTeam]?.[stat.key] || { avg: 0, rank: 30 };
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

function buildDvpText(
  opponent: string,
  position: string,
  statKey: NBAStatKey,
  dataset: LeagueDataset
) {
  const positionGroup = normalizePositionGroup(position);
  const matchup = dataset.dvp[opponent]?.[positionGroup]?.[statKey];
  if (!matchup) return `vs ${opponent} (DVP building)`;
  return `vs ${opponent} (${ordinal(matchup.rank)}-most ${statLabel(statKey)} to ${positionGroup})`;
}

async function buildTeamPlayers(params: {
  teamAbbrev: string;
  opponentAbbrev: string;
  isAway: boolean;
  currentPlayers: NBABoxscorePlayer[];
  recentGames: NBAGame[];
  boxscoreCache: Map<string, { home: NBABoxscorePlayer[]; away: NBABoxscorePlayer[] }>;
  bestPropByPlayer: Map<string, any>;
  dataset: LeagueDataset;
  gameId: string;
}): Promise<{ players: MatchupPlayerCard[]; starters: MatchupStarter[] }> {
  const {
    teamAbbrev,
    opponentAbbrev,
    isAway,
    currentPlayers,
    recentGames,
    boxscoreCache,
    bestPropByPlayer,
    dataset,
    gameId,
  } = params;

  const recentTeamGames = recentGames
    .filter((game) => game.homeTeam.abbreviation === teamAbbrev || game.awayTeam.abbreviation === teamAbbrev)
    .slice(0, TEAM_SAMPLE);

  const fallbackGame = recentTeamGames[0];
  const fallbackBox = fallbackGame ? boxscoreCache.get(fallbackGame.id) : null;
  const fallbackPlayers = fallbackBox
    ? (fallbackGame?.homeTeam.abbreviation === teamAbbrev ? fallbackBox.home : fallbackBox.away)
    : [];

  const discoveryPlayers = (currentPlayers.length > 0 ? currentPlayers : fallbackPlayers)
    .filter((player) => (parseFloat(player.minutes) || 0) >= 12)
    .sort((a, b) => (parseFloat(b.minutes) || 0) - (parseFloat(a.minutes) || 0) || b.points - a.points)
    .slice(0, 8);

  const summaries: MatchupPlayerCard[] = [];

  for (const player of discoveryPlayers) {
    const logs = recentTeamGames.map((game) => {
      const boxscore = boxscoreCache.get(game.id);
      if (!boxscore) return null;
      const teamPlayers = game.homeTeam.abbreviation === teamAbbrev ? boxscore.home : boxscore.away;
      const matched = matchPlayer(teamPlayers, player.name);
      if (!matched) return null;
      return {
        position: matched.position || player.position,
        minutes: parseFloat(matched.minutes) || 0,
        points: matched.points || 0,
        rebounds: matched.rebounds || 0,
        assists: matched.assists || 0,
        threes: parseInt(String(matched.threePointers || "0").split("-")[0], 10) || 0,
        blocks: matched.blocks || 0,
        steals: matched.steals || 0,
      };
    }).filter(Boolean) as Array<{
      position: string;
      minutes: number;
      points: number;
      rebounds: number;
      assists: number;
      threes: number;
      blocks: number;
      steals: number;
    }>;

    if (logs.length < 3) continue;

    const avgMinutes = logs.reduce((sum, log) => sum + log.minutes, 0) / logs.length;
    const avgPoints = logs.reduce((sum, log) => sum + log.points, 0) / logs.length;
    const avgRebounds = logs.reduce((sum, log) => sum + log.rebounds, 0) / logs.length;
    const avgAssists = logs.reduce((sum, log) => sum + log.assists, 0) / logs.length;
    const avgThrees = logs.reduce((sum, log) => sum + log.threes, 0) / logs.length;
    const avgBlocks = logs.reduce((sum, log) => sum + log.blocks, 0) / logs.length;
    const avgSteals = logs.reduce((sum, log) => sum + log.steals, 0) / logs.length;

    const bestProp = bestPropByPlayer.get(player.name.toLowerCase());
    const position = logs[0]?.position || player.position || "G";
    const statKey = propTypeToStatKey(bestProp?.propType, position);
    const propType = bestProp?.propType || (statKey === "rebounds" ? "Rebounds" : "Points");

    summaries.push({
      id: `${teamAbbrev}-${player.id}`,
      name: player.name,
      team: teamAbbrev,
      opponent: opponentAbbrev,
      position,
      sortValue: avgMinutes * 10 + avgPoints,
      avgMinutes: Number(avgMinutes.toFixed(1)),
      seasonStats: [
        { label: "PTS", value: Number(avgPoints.toFixed(1)) },
        { label: "REB", value: Number(avgRebounds.toFixed(1)) },
        { label: "AST", value: Number(avgAssists.toFixed(1)) },
        { label: "3PM", value: Number(avgThrees.toFixed(1)) },
        { label: "BLK", value: Number(avgBlocks.toFixed(1)) },
        { label: "STL", value: Number(avgSteals.toFixed(1)) },
      ],
      dvp: buildDvpText(opponentAbbrev, position, statKey, dataset),
      trendHref: buildPlayerTrendHref({
        league: "NBA",
        playerName: player.name,
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
        teamColor: NBA_TEAM_COLORS[teamAbbrev] || "#4a9eff",
      }),
    });
  }

  const players = summaries
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 5);

  const starters: MatchupStarter[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    subtitle: `${player.position} · ${player.seasonStats[0]?.value ?? 0} PTS · ${player.avgMinutes?.toFixed(1) || "0.0"} MIN`,
    badge: "Projected",
    trendHref: player.trendHref,
  }));

  return { players, starters };
}

function normalizePlayerProps(props: any[]): MatchupPropCard[] {
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

// ── Goose-model numeric context export ────────────────────────────────────────

/**
 * Stat keys used in DvP and offense/defense rankings.
 * Mirrors NBAStatKey but exported so callers don't need internal types.
 */
export type NBADefenseStatKey = "points" | "rebounds" | "assists" | "threes" | "blocks" | "steals";

/**
 * Real-data defensive context for a team, derived from the cached league dataset.
 * Used by goose-model/nba-context.ts to auto-tag dvp_advantage and pace_matchup
 * signals from actual ESPN boxscore data rather than reasoning-text patterns.
 */
export type NBATeamDefenseContext = {
  /** DvP rank for the given position group + stat (1=best defense, 30=worst defense) */
  dvpRank: number | null;
  /** Avg stat allowed per game to this position group (e.g. avg pts allowed to Gs) */
  dvpAvgAllowed: number | null;
  /** Team's overall offense rank by scoring — used as a pace proxy (1=highest scoring) */
  offensePaceRank: number | null;
  /** Team's average points scored per game (raw pace proxy value) */
  offensePtsAvg: number | null;
};

/**
 * Fetch real defensive and pace data for a team from the cached league dataset.
 *
 * DvP (Defense vs Position): how many points/rebounds/assists/etc. the opponent
 * allows per game to the given position group (G/F/C). Rank 23-30 = weak defender.
 *
 * Pace proxy: team's average points scored per game. Both teams in top 10 scoring
 * implies a high-pace/high-scoring game — more total stat volume for props.
 *
 * This is server-side only — calls getLeagueDataset() which fetches ESPN boxscores
 * and caches them for 15 minutes.
 */
export async function getNBATeamDefenseContext(
  opponentAbbrev: string,
  positionGroup: "G" | "F" | "C",
  statKey: NBADefenseStatKey,
): Promise<NBATeamDefenseContext> {
  try {
    const dataset = await getLeagueDataset();
    const dvpEntry = dataset.dvp[opponentAbbrev]?.[positionGroup]?.[statKey as NBAStatKey];
    const offEntry = dataset.offense[opponentAbbrev]?.points;

    return {
      dvpRank: dvpEntry?.rank ?? null,
      dvpAvgAllowed: dvpEntry?.avg ?? null,
      offensePaceRank: offEntry?.rank ?? null,
      offensePtsAvg: offEntry?.avg ?? null,
    };
  } catch {
    return {
      dvpRank: null,
      dvpAvgAllowed: null,
      offensePaceRank: null,
      offensePtsAvg: null,
    };
  }
}

/**
 * Fetch pace context for both teams in a matchup.
 * Returns each team's offensive scoring rank (pace proxy).
 * Both in top 10 → high-pace game → more stat volume for props.
 */
export async function getNBAMatchupPaceContext(
  teamAbbrev: string,
  opponentAbbrev: string,
): Promise<{ teamPaceRank: number | null; opponentPaceRank: number | null; teamPtsAvg: number | null; opponentPtsAvg: number | null }> {
  try {
    const dataset = await getLeagueDataset();
    const teamOff = dataset.offense[teamAbbrev]?.points;
    const oppOff = dataset.offense[opponentAbbrev]?.points;
    return {
      teamPaceRank: teamOff?.rank ?? null,
      opponentPaceRank: oppOff?.rank ?? null,
      teamPtsAvg: teamOff?.avg ?? null,
      opponentPtsAvg: oppOff?.avg ?? null,
    };
  } catch {
    return { teamPaceRank: null, opponentPaceRank: null, teamPtsAvg: null, opponentPtsAvg: null };
  }
}

export async function getNBAMatchupData(gameId: string): Promise<MatchupPageData | null> {
  const [summary, dataset, odds] = await Promise.all([
    getNBAGameSummary(gameId),
    getLeagueDataset(),
    getNBAOdds(),
  ]);

  const competition = summary?.header?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((entry: any) => entry.homeAway === "home") || competitors[0];
  const away = competitors.find((entry: any) => entry.homeAway === "away") || competitors[1];

  if (!competition || !home || !away) {
    return null;
  }

  const standingMap = new Map(dataset.standings.map((standing) => [standing.teamAbbrev, standing]));
  const homeStanding = standingMap.get(home.team?.abbreviation ?? "") || null;
  const awayStanding = standingMap.get(away.team?.abbreviation ?? "") || null;
  const eventDate = summary?.header?.competitions?.[0]?.date || summary?.header?.competitions?.[0]?.startDate || "";
  const status = buildStatus(eventDate, competition.status?.type);
  const espnOdds = competition.odds?.[0];

  const game: NBAGame = {
    id: String(gameId),
    date: eventDate ? new Date(eventDate).toISOString().slice(0, 10) : "",
    status: status.code === "FINAL" ? "Final" : status.code === "LIVE" ? "Live" : status.detail,
    statusDetail: status.detail,
    homeTeam: {
      id: home.team?.id || "",
      abbreviation: home.team?.abbreviation || "",
      fullName: home.team?.displayName || home.team?.shortDisplayName || home.team?.name || "",
      record: buildRecord(home.team?.abbreviation || "", standingMap, home.records?.[0]?.summary),
    },
    awayTeam: {
      id: away.team?.id || "",
      abbreviation: away.team?.abbreviation || "",
      fullName: away.team?.displayName || away.team?.shortDisplayName || away.team?.name || "",
      record: buildRecord(away.team?.abbreviation || "", standingMap, away.records?.[0]?.summary),
    },
    homeScore: home.score != null ? parseInt(String(home.score), 10) || 0 : null,
    awayScore: away.score != null ? parseInt(String(away.score), 10) || 0 : null,
  };

  const oddsEvent = findNBAOddsForGame(
    odds,
    game.homeTeam.abbreviation,
    game.awayTeam.abbreviation
  );
  const gameWithOdds = {
    ...game,
    oddsEventId: oddsEvent?.id,
  };

  const [props, currentBoxscore] = await Promise.all([
    buildNBAStatsPropFeed([gameWithOdds], {
      maxGames: 1,
      maxPlayers: 6,
      recentGames: dataset.recentGames,
    }),
    getNBABoxscore(game.id),
  ]);

  const propsForGame = normalizePlayerProps(props);
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

  const neededGames = new Set<string>();
  for (const recentGame of dataset.recentGames) {
    if (recentGame.homeTeam.abbreviation === game.homeTeam.abbreviation || recentGame.awayTeam.abbreviation === game.homeTeam.abbreviation) {
      neededGames.add(recentGame.id);
    }
    if (recentGame.homeTeam.abbreviation === game.awayTeam.abbreviation || recentGame.awayTeam.abbreviation === game.awayTeam.abbreviation) {
      neededGames.add(recentGame.id);
    }
  }

  const boxscoreCache = new Map<string, { home: NBABoxscorePlayer[]; away: NBABoxscorePlayer[] }>();
  const fetchIds = Array.from(neededGames).slice(0, TEAM_SAMPLE * 2);
  await Promise.all(
    fetchIds.map(async (id) => {
      const boxscore = await getNBABoxscore(id);
      if (boxscore.home.length > 0 || boxscore.away.length > 0) {
        boxscoreCache.set(id, boxscore);
      }
    })
  );

  const [homePlayers, awayPlayers] = await Promise.all([
    buildTeamPlayers({
      teamAbbrev: game.homeTeam.abbreviation,
      opponentAbbrev: game.awayTeam.abbreviation,
      isAway: false,
      currentPlayers: currentBoxscore.home,
      recentGames: dataset.recentGames,
      boxscoreCache,
      bestPropByPlayer,
      dataset,
      gameId: game.id,
    }),
    buildTeamPlayers({
      teamAbbrev: game.awayTeam.abbreviation,
      opponentAbbrev: game.homeTeam.abbreviation,
      isAway: true,
      currentPlayers: currentBoxscore.away,
      recentGames: dataset.recentGames,
      boxscoreCache,
      bestPropByPlayer,
      dataset,
      gameId: game.id,
    }),
  ]);

  const lineup: MatchupLineup = {
    title: "Projected Starters",
    note: "Rotation model based on the most recent qualifying game logs.",
    away: awayPlayers.starters,
    home: homePlayers.starters,
  };

  const awaySummary: MatchupTeamSummary = {
    abbrev: game.awayTeam.abbreviation,
    name: game.awayTeam.abbreviation,
    fullName: game.awayTeam.fullName,
    logo: getTeamLogo(away),
    color: NBA_TEAM_COLORS[game.awayTeam.abbreviation] || "#4a9eff",
    record: buildRecord(game.awayTeam.abbreviation, standingMap, game.awayTeam.record),
    score: game.awayScore,
  };

  const homeSummary: MatchupTeamSummary = {
    abbrev: game.homeTeam.abbreviation,
    name: game.homeTeam.abbreviation,
    fullName: game.homeTeam.fullName,
    logo: getTeamLogo(home),
    color: NBA_TEAM_COLORS[game.homeTeam.abbreviation] || "#4a9eff",
    record: buildRecord(game.homeTeam.abbreviation, standingMap, game.homeTeam.record),
    score: game.homeScore,
  };

  const awaySeries = buildSeriesRecord(dataset.recentGames, game.awayTeam.abbreviation, game.homeTeam.abbreviation);
  const homeSeries = buildSeriesRecord(dataset.recentGames, game.homeTeam.abbreviation, game.awayTeam.abbreviation);
  const awayCompact = awayStanding
    ? `Road ${awayStanding.roadRecord} | L10 ${awayStanding.last10 || "—"} | Streak ${awayStanding.streak || "—"}`
    : `L10 — | Streak —`;
  const homeCompact = homeStanding
    ? `Home ${homeStanding.homeRecord} | L10 ${homeStanding.last10 || "—"} | Streak ${homeStanding.streak || "—"}`
    : `L10 — | Streak —`;
  const betting = buildBettingSummary(
    oddsEvent,
    game.awayTeam.abbreviation,
    game.homeTeam.abbreviation,
    {
      awayML: typeof espnOdds?.awayTeamOdds?.moneyLine === "number" ? espnOdds.awayTeamOdds.moneyLine : undefined,
      homeML: typeof espnOdds?.homeTeamOdds?.moneyLine === "number" ? espnOdds.homeTeamOdds.moneyLine : undefined,
      spread: typeof espnOdds?.details === "string" ? espnOdds.details : undefined,
      overUnder: typeof espnOdds?.overUnder === "number" ? espnOdds.overUnder : undefined,
    }
  );

  const awayRow1 = awayStanding
    ? `Record: ${awayStanding.wins}-${awayStanding.losses} | Home: ${awayStanding.homeRecord} | Road: ${awayStanding.roadRecord}`
    : `Record: ${awaySummary.record}`;
  const homeRow1 = homeStanding
    ? `Record: ${homeStanding.wins}-${homeStanding.losses} | Home: ${homeStanding.homeRecord} | Road: ${homeStanding.roadRecord}`
    : `Record: ${homeSummary.record}`;
  const awayRow2 = `L10: ${awayStanding?.last10 || "—"} | Streak: ${awayStanding?.streak || "—"} | ${awaySeries ? `vs ${game.homeTeam.abbreviation}: ${awaySeries}` : `Seed: ${awayStanding?.seed ?? "—"}`}`;
  const homeRow2 = `L10: ${homeStanding?.last10 || "—"} | Streak: ${homeStanding?.streak || "—"} | ${homeSeries ? `vs ${game.awayTeam.abbreviation}: ${homeSeries}` : `Seed: ${homeStanding?.seed ?? "—"}`}`;

  return {
    league: "NBA",
    gameId,
    header: {
      away: awaySummary,
      home: homeSummary,
      status,
      compact: {
        away: awayCompact,
        home: homeCompact,
        betting,
      },
    },
    teamStats: {
      away: {
        row1: awayRow1,
        row2: awayRow2,
      },
      home: {
        row1: homeRow1,
        row2: homeRow2,
      },
      seriesNote: awaySeries && homeSeries ? `Recent series sample: ${game.awayTeam.abbreviation} ${awaySeries}, ${game.homeTeam.abbreviation} ${homeSeries}` : null,
    },
    insights: buildInsights(awayStanding, homeStanding),
    comparisonViews: buildComparisonViews(game.awayTeam.abbreviation, game.homeTeam.abbreviation, dataset),
    players: {
      away: awayPlayers.players,
      home: homePlayers.players,
    },
    lineup,
    props: propsForGame.sort((a, b) => (b.edgePct || 0) - (a.edgePct || 0)),
    propFilters: Array.from(new Set(propsForGame.map((prop) => prop.propType))).sort(),
  };
}
