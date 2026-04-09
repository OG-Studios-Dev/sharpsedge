import {
  AIPick,
  GolfDGCacheSummary,
  GolfHeadToHeadPrediction,
  GolfLeaderboard,
  GolfOddsBoard,
  GolfPlayer,
  GolfPlayerHistoryResult,
  GolfPlayerHitRates,
  GolfPlayerSeasonStats,
  GolfPrediction,
  GolfPredictionBoard,
  GolfPredictionModelSource,
  GolfPredictionMarket,
  GolfValuePlay,
} from "@/lib/types";
import { getDGCache, summarizeDGCache, type DGCache } from "./datagolf-cache";
import { type BovadaTopFinishOddsMap, findBovadaTopFinishOdds } from "./golf-odds";
import { type BDLSeasonStat, type BDLFuturesOdds } from "./golf/bdl-pga";

export const GOLF_PROP_TYPES = [
  "Tournament Winner",
  "Top 5 Finish",
  "Top 10 Finish",
  "Top 20 Finish",
  "Make/Miss Cut",
  "Head-to-Head Matchup",
  "Round Score O/U 70.5",
  "First Round Leader",
] as const;

type PlayerHistoryMap = Record<string, GolfPlayerHistoryResult[]>;

const FORM_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08];
const GOLF_PICK_COLOR = "#167c45";
const GOLF_TOP_FINISH_MARKETS: GolfPredictionMarket[] = [
  "Tournament Winner",
  "Top 5 Finish",
  "Top 10 Finish",
  "Top 20 Finish",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeRate(rate?: number) {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return 0;
  return Math.abs(rate) <= 1 ? rate : rate / 100;
}

type DGProbabilityScale = "fraction" | "percent";

function normalizeProbability(value: number | null | undefined, scale: DGProbabilityScale = "fraction") {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const normalized = scale === "percent"
    ? value / 100
    : value;
  return clamp(normalized, 0, 1);
}

function normalizeName(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCourse(value?: string) {
  return normalizeName(value);
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${round(value, 2)}`;
}

function parseFinishValue(finish: string) {
  const raw = finish.toUpperCase();
  if (!raw || raw === "—") return 65;
  if (raw === "CUT" || raw === "MC") return 80;
  const parsed = Number(raw.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 65;
}

function parsePositionRank(position: string, fieldSize: number) {
  const raw = position.toUpperCase();
  if (!raw) return fieldSize;
  if (raw === "CUT" || raw === "MC") return fieldSize + 10;
  const parsed = Number(raw.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : fieldSize;
}

function normalizeFinishScore(finish: string) {
  const place = parseFinishValue(finish);
  if (place === 80) return 0;
  if (place === 1) return 100;
  if (place === 2) return 90;
  if (place <= 5) return 80;
  if (place <= 10) return 70;
  if (place <= 20) return 55;
  if (place <= 30) return 40;
  return 25;
}

function normalizeCourseHistoryFinishScore(finish: string) {
  const place = parseFinishValue(finish);
  if (place === 80) return 25;
  if (place === 1) return 95;
  if (place <= 5) return 88;
  if (place <= 10) return 80;
  if (place <= 20) return 72;
  if (place <= 30) return 60;
  return 45;
}

function weightedAverage(scores: number[]) {
  if (scores.length === 0) return null;

  const weights = FORM_WEIGHTS.slice(0, scores.length);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) return null;

  return scores.reduce((sum, score, index) => sum + score * weights[index], 0) / totalWeight;
}

function americanToImpliedProbability(odds: number) {
  if (!Number.isFinite(odds) || odds === 0) return null;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probabilityToAmericanOdds(probability: number) {
  const bounded = clamp(probability, 0.01, 0.99);
  if (bounded >= 0.5) {
    return -Math.round((bounded / (1 - bounded)) * 100);
  }
  return Math.round(((1 - bounded) / bounded) * 100);
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "-");
}

function lastNameKey(playerName: string) {
  const last = playerName.trim().split(/\s+/).slice(-1)[0] ?? playerName;
  return last.slice(0, 3).toUpperCase();
}

function scoreSeasonStats(stats: GolfPlayerSeasonStats | null | undefined) {
  if (!stats) return 50;
  const scoringAverage = stats.scoringAverage !== null ? clamp(100 - (stats.scoringAverage - 68.5) * 10, 20, 95) : 50;
  const drivingAccuracy = stats.drivingAccuracy !== null ? clamp(stats.drivingAccuracy, 30, 90) : 50;
  const gir = stats.gir !== null ? clamp(stats.gir, 30, 90) : 50;
  const puttingAverage = stats.puttingAverage !== null ? clamp(100 - (stats.puttingAverage - 1.7) * 100, 25, 95) : 50;
  return (scoringAverage * 0.5) + (drivingAccuracy * 0.15) + (gir * 0.2) + (puttingAverage * 0.15);
}

function scoreCurrentPosition(player: GolfPlayer, fieldSize: number) {
  const rank = parsePositionRank(player.position, fieldSize);
  if (rank > fieldSize) return 0;
  if (fieldSize <= 1) return 50;
  return clamp(100 * (1 - ((rank - 1) / (fieldSize - 1))), 20, 100);
}

function scoreDGSkill(dg: DGEnrichedPlayer | null) {
  if (!dg) return null;

  const scores: number[] = [];
  if (dg.dgRank !== null) {
    scores.push(clamp(100 - ((dg.dgRank - 1) * 0.55), 25, 98));
  }
  if (dg.sgT2G !== null) {
    scores.push(clamp(50 + (dg.sgT2G * 16), 20, 95));
  }
  if (dg.sgAPP !== null) {
    scores.push(clamp(50 + (dg.sgAPP * 12), 20, 95));
  }
  if (dg.sgPUTT !== null) {
    scores.push(clamp(50 + (dg.sgPUTT * 10), 20, 95));
  }

  const value = average(scores);
  return value === null ? null : round(value);
}

function scoreDGCourseFit(dg: DGEnrichedPlayer | null) {
  if (!dg || dg.dgCourseFit === null) return null;
  const raw = dg.dgCourseFit;
  if (Math.abs(raw) <= 1) return round(clamp(raw * 100, 20, 95));
  if (Math.abs(raw) <= 10) return round(clamp(50 + (raw * 6), 20, 95));
  return round(clamp(raw, 20, 95));
}

function detectDGProbabilityScale(cache: DGCache | null): DGProbabilityScale {
  const probabilityValues = cache?.data.predictions.flatMap((prediction) => (
    [
      prediction.winProb,
      prediction.top5Prob,
      prediction.top10Prob,
      prediction.top20Prob,
      prediction.makeCutProb,
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
  )) ?? [];

  return probabilityValues.some((value) => value > 1) ? "percent" : "fraction";
}

function buildCourseHistory(history: GolfPlayerHistoryResult[], course: string) {
  const normalizedCourse = normalizeCourse(course);
  return history.filter((entry) => normalizeCourse(entry.course) === normalizedCourse);
}

function deriveSeasonStats(player: GolfPlayer, history: GolfPlayerHistoryResult[]) {
  if (player.seasonStats) return player.seasonStats;
  const allRounds = history.flatMap((entry) => entry.roundScores ?? []);
  const scoringAverage = average(allRounds);
  if (scoringAverage === null) return null;
  return {
    scoringAverage,
    drivingAccuracy: null,
    gir: null,
    puttingAverage: null,
  };
}

function buildCourseFieldAverage(historyByPlayer: PlayerHistoryMap, course: string) {
  const normalizedCourse = normalizeCourse(course);
  const roundScores = Object.values(historyByPlayer)
    .flatMap((history) => history.filter((entry) => normalizeCourse(entry.course) === normalizedCourse))
    .flatMap((entry) => entry.roundScores ?? []);

  return average(roundScores);
}

function buildSeasonFieldAverage(players: GolfPlayer[], historyByPlayer: PlayerHistoryMap) {
  const scoringAverages = players
    .map((player) => deriveSeasonStats(player, historyByPlayer[player.id] ?? [])?.scoringAverage ?? null)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return average(scoringAverages) ?? 71.5;
}

export function computeGolfHitRates(history: GolfPlayerHistoryResult[]): GolfPlayerHitRates {
  const sample = history.slice(0, 5);
  const rounds = sample.flatMap((entry) => entry.roundScores ?? []);

  const normalizePercent = (hits: number, total: number) => total > 0 ? (hits / total) * 100 : 0;

  return {
    top5: normalizePercent(sample.filter((entry) => parseFinishValue(entry.finish) <= 5).length, sample.length),
    top10: normalizePercent(sample.filter((entry) => parseFinishValue(entry.finish) <= 10).length, sample.length),
    top20: normalizePercent(sample.filter((entry) => parseFinishValue(entry.finish) <= 20).length, sample.length),
    madeCut: normalizePercent(sample.filter((entry) => entry.madeCut !== false && parseFinishValue(entry.finish) < 80).length, sample.length),
    firstRoundLeader: normalizePercent(sample.filter((entry) => (entry.roundScores?.[0] ?? 99) <= 67).length, sample.length),
    under70_5: normalizePercent(rounds.filter((round) => round <= 70.5).length, rounds.length),
  };
}

export function calculateRecentFormScore(history: GolfPlayerHistoryResult[]) {
  const scores = history.slice(0, 5).map((entry) => normalizeFinishScore(entry.finish));
  const weighted = weightedAverage(scores);
  return round(weighted ?? 50);
}

export function calculateCourseHistoryScore(history: GolfPlayerHistoryResult[]) {
  if (history.length === 0) return 50;
  const scores = history.slice(0, 5).map((entry) => normalizeCourseHistoryFinishScore(entry.finish));
  const weighted = weightedAverage(scores);
  return round(clamp(weighted ?? 50, 20, 90));
}

export function calculateCourseFitScore(params: {
  courseHistory: GolfPlayerHistoryResult[];
  recentForm: GolfPlayerHistoryResult[];
  seasonStats: GolfPlayerSeasonStats | null;
  courseFieldAverage: number | null;
  seasonFieldAverage: number;
}) {
  const courseRounds = params.courseHistory.flatMap((entry) => entry.roundScores ?? []);
  const playerCourseAverage = average(courseRounds);
  const fallbackAverage = params.seasonStats?.scoringAverage ?? average(params.recentForm.flatMap((entry) => entry.roundScores ?? []));
  const playerAverage = playerCourseAverage ?? fallbackAverage;

  if (playerAverage === null) return 50;

  const baseline = playerCourseAverage !== null && params.courseFieldAverage !== null
    ? params.courseFieldAverage
    : params.seasonFieldAverage;

  const differential = baseline - playerAverage;
  return round(clamp(50 + (differential * 12), 20, 95));
}

function buildTopFinishProbabilities(player: {
  modelProb: number;
  hitRates?: GolfPlayerHitRates;
}) {
  const top5Rate = normalizeRate(player.hitRates?.top5);
  const top10Rate = normalizeRate(player.hitRates?.top10);
  const top20Rate = normalizeRate(player.hitRates?.top20);
  const madeCutRate = normalizeRate(player.hitRates?.madeCut);

  const top5Prob = clamp(
    (player.modelProb * 5.2) + (top5Rate * 0.45) + (top10Rate * 0.1),
    Math.max(player.modelProb, top5Rate * 0.45),
    0.68,
  );

  const top10Prob = clamp(
    (player.modelProb * 8.1) + (top10Rate * 0.48) + (top20Rate * 0.12),
    Math.max(top5Prob + 0.03, player.modelProb * 1.8),
    0.84,
  );

  const top20Prob = clamp(
    (player.modelProb * 12.2) + (top20Rate * 0.52) + (madeCutRate * 0.15),
    Math.max(top10Prob + 0.04, player.modelProb * 2.6),
    0.93,
  );

  return {
    top5Prob: round(top5Prob, 4),
    top10Prob: round(top10Prob, 4),
    top20Prob: round(top20Prob, 4),
  };
}

function buildOutrightProxyFinishProbabilities(bookProb: number | null) {
  if (bookProb === null) {
    return {
      "Tournament Winner": null,
      "Top 5 Finish": null,
      "Top 10 Finish": null,
      "Top 20 Finish": null,
    } satisfies Record<GolfPredictionMarket, number | null>;
  }

  const top5Prob = clamp((bookProb * 5.1) + 0.015, bookProb, 0.67);
  const top10Prob = clamp((bookProb * 8.3) + 0.03, top5Prob + 0.03, 0.83);
  const top20Prob = clamp((bookProb * 12.4) + 0.06, top10Prob + 0.04, 0.92);

  return {
    "Tournament Winner": round(bookProb, 4),
    "Top 5 Finish": round(top5Prob, 4),
    "Top 10 Finish": round(top10Prob, 4),
    "Top 20 Finish": round(top20Prob, 4),
  } satisfies Record<GolfPredictionMarket, number | null>;
}

function findBestOutright(odds: GolfOddsBoard | null, playerName: string) {
  if (!odds) return null;
  const target = normalizeName(playerName);
  return odds.outrights.find((entry) => normalizeName(entry.playerName) === target) ?? null;
}

function buildHeadToHeadMatchups(players: GolfPrediction[], odds: GolfOddsBoard | null): GolfHeadToHeadPrediction[] {
  if (!odds || odds.h2h.length === 0) return [];

  const playerByName = new Map(players.map((player) => [normalizeName(player.name), player]));

  return odds.h2h
    .map((matchup) => {
      const playerA = playerByName.get(normalizeName(matchup.playerA));
      const playerB = playerByName.get(normalizeName(matchup.playerB));
      if (!playerA || !playerB) return null;

      const modelScoreA = (playerA.formScore * 0.55) + (playerA.courseFitScore * 0.25) + (playerA.courseHistoryScore * 0.2);
      const modelScoreB = (playerB.formScore * 0.55) + (playerB.courseFitScore * 0.25) + (playerB.courseHistoryScore * 0.2);
      const totalModelScore = modelScoreA + modelScoreB;
      if (totalModelScore <= 0) return null;

      const impliedA = americanToImpliedProbability(matchup.playerAOdds) ?? 0.5;
      const impliedB = americanToImpliedProbability(matchup.playerBOdds) ?? 0.5;
      const totalImplied = impliedA + impliedB;
      const bookProbA = totalImplied > 0 ? impliedA / totalImplied : 0.5;
      const bookProbB = totalImplied > 0 ? impliedB / totalImplied : 0.5;
      const modelProbA = modelScoreA / totalModelScore;
      const modelProbB = modelScoreB / totalModelScore;

      const modelPick = modelProbA === modelProbB ? null : modelProbA > modelProbB ? matchup.playerA : matchup.playerB;
      const bookFavorite = bookProbA === bookProbB ? null : bookProbA > bookProbB ? matchup.playerA : matchup.playerB;
      const edgeA = modelProbA - bookProbA;
      const edgeB = modelProbB - bookProbB;

      return {
        matchup: matchup.matchup,
        playerA: matchup.playerA,
        playerB: matchup.playerB,
        playerAOdds: matchup.playerAOdds,
        playerBOdds: matchup.playerBOdds,
        book: matchup.book,
        bookProbA: round(bookProbA, 4),
        bookProbB: round(bookProbB, 4),
        modelProbA: round(modelProbA, 4),
        modelProbB: round(modelProbB, 4),
        modelPick,
        bookFavorite,
        valueSide: edgeA > 0.04 ? matchup.playerA : edgeB > 0.04 ? matchup.playerB : null,
        disagreement: Boolean(modelPick && bookFavorite && modelPick !== bookFavorite),
      } satisfies GolfHeadToHeadPrediction;
    })
    .filter((matchup): matchup is GolfHeadToHeadPrediction => matchup !== null)
    .sort((left, right) => {
      if (left.disagreement !== right.disagreement) return Number(right.disagreement) - Number(left.disagreement);
      const leftEdge = Math.max(Math.abs(left.modelProbA - left.bookProbA), Math.abs(left.modelProbB - left.bookProbB));
      const rightEdge = Math.max(Math.abs(right.modelProbA - right.bookProbA), Math.abs(right.modelProbB - right.bookProbB));
      return rightEdge - leftEdge;
    });
}

function buildValuePlays(players: GolfPrediction[]): GolfValuePlay[] {
  const valuePlays = players.flatMap((player) => {
    const bookProbabilities = buildOutrightProxyFinishProbabilities(player.bookProb);

    return GOLF_TOP_FINISH_MARKETS.map((market) => {
      const modelProb = market === "Tournament Winner"
        ? player.modelProb
        : market === "Top 5 Finish"
          ? player.top5Prob
          : market === "Top 10 Finish"
            ? player.top10Prob
            : player.top20Prob;

      const bookProb = bookProbabilities[market];
      const edge = bookProb === null ? null : round(modelProb - bookProb, 4);

      return {
        market,
        modelProb: round(modelProb, 4),
        bookProb,
        edge,
        player,
      } satisfies GolfValuePlay;
    });
  });

  return valuePlays
    .filter((play) => (play.edge ?? 0) > 0)
    .sort((left, right) => (
      (right.edge ?? Number.NEGATIVE_INFINITY) - (left.edge ?? Number.NEGATIVE_INFINITY)
    ) || right.player.combinedScore - left.player.combinedScore);
}

function buildPredictionDataSources(params: {
  leaderboard: GolfLeaderboard | null;
  odds: GolfOddsBoard | null;
  datagolf: GolfDGCacheSummary;
  playersCount: number;
}): NonNullable<GolfPredictionBoard["dataSources"]> {
  let model: GolfPredictionModelSource = "pending-field";

  if (params.leaderboard && params.playersCount > 0) {
    model = params.datagolf.ready ? "datagolf-hybrid" : "espn-form";
  }

  return {
    model,
    odds: params.odds && (params.odds.outrights.length > 0 || params.odds.h2h.length > 0) ? "live-odds" : "model-only",
    datagolf: params.datagolf,
  };
}

/**
 * Merge BDL season stats into a GolfPlayerSeasonStats object.
 * BDL provides gir_percentage, driving_accuracy, putts_per_round, scoring_avg —
 * all fields currently null in our ESPN-derived stats.
 */
export function mergeBDLSeasonStats(
  base: GolfPlayerSeasonStats | null,
  bdlStat: BDLSeasonStat | undefined,
): GolfPlayerSeasonStats | null {
  if (!bdlStat) return base;
  return {
    scoringAverage: base?.scoringAverage ?? bdlStat.scoring_avg ?? null,
    drivingAccuracy: bdlStat.driving_accuracy != null ? bdlStat.driving_accuracy : (base?.drivingAccuracy ?? null),
    gir: bdlStat.gir_percentage != null ? bdlStat.gir_percentage : (base?.gir ?? null),
    puttingAverage: bdlStat.putts_per_round != null ? bdlStat.putts_per_round : (base?.puttingAverage ?? null),
  };
}

/**
 * Build a lookup map from normalised player name → BDL season stat.
 */
export function buildBDLSeasonStatsMap(stats: BDLSeasonStat[]): Map<string, BDLSeasonStat> {
  const map = new Map<string, BDLSeasonStat>();
  for (const s of stats) {
    if (s.player?.display_name) {
      map.set(normalizeName(s.player.display_name), s);
    }
  }
  return map;
}

/**
 * Build a lookup map from normalised player name → best BDL futures odds (winner market).
 */
export function buildBDLFuturesMap(futures: BDLFuturesOdds[]): Map<string, BDLFuturesOdds> {
  const map = new Map<string, BDLFuturesOdds>();
  for (const f of futures) {
    if (!f.player?.display_name) continue;
    const key = normalizeName(f.player.display_name);
    const existing = map.get(key);
    // prefer DraftKings/FanDuel; otherwise take the best (lowest absolute odds for winners)
    if (!existing || Math.abs(f.odds) < Math.abs(existing.odds)) {
      map.set(key, f);
    }
  }
  return map;
}

export function buildGolfPredictionBoard(
  leaderboard: GolfLeaderboard | null,
  historyByPlayer: PlayerHistoryMap,
  odds: GolfOddsBoard | null = null,
  dgCache: DGCache | null = null,
  bdlSeasonStatsMap?: Map<string, BDLSeasonStat>,
  bdlFuturesMap?: Map<string, BDLFuturesOdds>,
): GolfPredictionBoard {
  const generatedAt = new Date().toISOString();
  const activePlayers = leaderboard?.players.filter((player) => player.position !== "CUT" && player.position !== "MC") ?? [];
  const datagolf = summarizeDGCache({
    cache: dgCache,
    tournamentName: leaderboard?.tournament.name,
    playerNames: activePlayers.map((player) => player.name),
  });
  const dataSources = buildPredictionDataSources({
    leaderboard,
    odds,
    datagolf,
    playersCount: activePlayers.length,
  });

  if (!leaderboard) {
    return {
      tournament: null,
      generatedAt,
      players: [],
      bestValuePicks: [],
      h2hMatchups: [],
      dataSources,
    };
  }

  if (activePlayers.length === 0) {
    return {
      tournament: leaderboard.tournament,
      generatedAt,
      players: [],
      bestValuePicks: [],
      h2hMatchups: [],
      dataSources,
    };
  }

  const courseFieldAverage = buildCourseFieldAverage(historyByPlayer, leaderboard.tournament.course);
  const seasonFieldAverage = buildSeasonFieldAverage(activePlayers, historyByPlayer);
  const fieldSize = Math.max(activePlayers.length, 1);
  const shouldBlendDG = datagolf.ready;
  const dgProbabilityScale = shouldBlendDG ? detectDGProbabilityScale(dgCache) : "fraction";

  const enrichedPlayers = activePlayers.map((player) => {
    const fullHistory = historyByPlayer[player.id] ?? [];
    const recentForm = fullHistory.slice(0, 5);
    const courseHistory = buildCourseHistory(fullHistory, leaderboard.tournament.course);
    const rawSeasonStats = deriveSeasonStats(player, fullHistory);
    const bdlStat = bdlSeasonStatsMap?.get(normalizeName(player.name));
    const seasonStats = mergeBDLSeasonStats(rawSeasonStats, bdlStat);
    const hitRates = computeGolfHitRates(recentForm);
    const formScore = calculateRecentFormScore(recentForm);
    const courseHistoryScore = calculateCourseHistoryScore(courseHistory);
    const courseFitScore = calculateCourseFitScore({
      courseHistory,
      recentForm,
      seasonStats,
      courseFieldAverage,
      seasonFieldAverage,
    });
    const seasonScore = scoreSeasonStats(seasonStats);
    const livePositionScore = leaderboard.tournament.status === "in-progress"
      ? scoreCurrentPosition(player, fieldSize)
      : null;
    const dg = shouldBlendDG ? getDGEnrichmentFromCache(dgCache, player.name) : null;
    const dgSkillScore = scoreDGSkill(dg);
    const dgCourseFitScore = scoreDGCourseFit(dg);
    const resolvedCourseFitScore = dgCourseFitScore === null
      ? courseFitScore
      : clamp((courseFitScore * 0.45) + (dgCourseFitScore * 0.55), 20, 95);

    const baseCombinedScore = dgSkillScore === null
      ? (formScore * 0.48) + (courseHistoryScore * 0.22) + (resolvedCourseFitScore * 0.18) + (seasonScore * 0.12)
      : (formScore * 0.36) + (courseHistoryScore * 0.18) + (resolvedCourseFitScore * 0.18) + (seasonScore * 0.12) + (dgSkillScore * 0.16);
    const combinedScore = livePositionScore === null
      ? baseCombinedScore
      : (baseCombinedScore * 0.82) + (livePositionScore * 0.18);

    const outright = findBestOutright(odds, player.name);
    const bookProb = outright ? americanToImpliedProbability(outright.odds) : null;

    return {
      ...player,
      recentForm,
      courseHistory,
      seasonStats,
      hitRates,
      outrightOdds: outright?.odds ?? (bdlFuturesMap?.get(normalizeName(player.name))?.odds ?? null),
      outrightBook: outright?.book ?? (bdlFuturesMap?.get(normalizeName(player.name)) ? "BDL" : null),

      formScore: round(formScore),
      courseHistoryScore: round(courseHistoryScore),
      courseFitScore: round(resolvedCourseFitScore),
      combinedScore: round(combinedScore),
      compositeScore: round(combinedScore),
      bookProb: bookProb === null ? null : round(bookProb, 4),
      bookOdds: outright?.odds ?? null,
      dgRank: dg?.dgRank ?? null,
      dgWinProb: normalizeProbability(dg?.dgWinProb, dgProbabilityScale),
      dgTop5Prob: normalizeProbability(dg?.dgTop5Prob, dgProbabilityScale),
      dgTop10Prob: normalizeProbability(dg?.dgTop10Prob, dgProbabilityScale),
      dgTop20Prob: normalizeProbability(dg?.dgTop20Prob, dgProbabilityScale),
      dgCourseFit: dg?.dgCourseFit ?? null,
      sgTotal: dg?.sgTotal ?? null,
      sgT2G: dg?.sgT2G ?? null,
      modelProb: 0,
      edge: null,
      top5Prob: 0,
      top10Prob: 0,
      top20Prob: 0,
    } satisfies GolfPrediction;
  });

  const formScoreTotal = enrichedPlayers.reduce((sum, player) => sum + player.formScore, 0);
  const dgWinProbTotal = enrichedPlayers.reduce((sum, player) => sum + (player.dgWinProb ?? 0), 0);
  const seededPlayers = enrichedPlayers.map((player) => {
    const fallbackModelProb = formScoreTotal > 0 ? player.formScore / formScoreTotal : 0;
    const dgWinSeed = dgWinProbTotal > 0 && typeof player.dgWinProb === "number"
      ? player.dgWinProb / dgWinProbTotal
      : null;
    const fallbackTopFinishProbabilities = buildTopFinishProbabilities({
      modelProb: fallbackModelProb,
      hitRates: player.hitRates,
    });

    return {
      player,
      fallbackModelProb,
      fallbackTopFinishProbabilities,
      winSeed: dgWinSeed === null ? fallbackModelProb : (dgWinSeed * 0.75) + (fallbackModelProb * 0.25),
    };
  });
  const totalWinSeed = seededPlayers.reduce((sum, entry) => sum + entry.winSeed, 0);

  const players = seededPlayers
    .map(({ player, fallbackTopFinishProbabilities, winSeed }) => {
      const modelProb = totalWinSeed > 0 ? winSeed / totalWinSeed : 0;
      const top5Prob = typeof player.dgTop5Prob !== "number"
        ? fallbackTopFinishProbabilities.top5Prob
        : round(clamp((player.dgTop5Prob * 0.75) + (fallbackTopFinishProbabilities.top5Prob * 0.25), modelProb, 0.75), 4);
      const top10Prob = typeof player.dgTop10Prob !== "number"
        ? fallbackTopFinishProbabilities.top10Prob
        : round(clamp((player.dgTop10Prob * 0.75) + (fallbackTopFinishProbabilities.top10Prob * 0.25), top5Prob + 0.02, 0.88), 4);
      const top20Prob = typeof player.dgTop20Prob !== "number"
        ? fallbackTopFinishProbabilities.top20Prob
        : round(clamp((player.dgTop20Prob * 0.75) + (fallbackTopFinishProbabilities.top20Prob * 0.25), top10Prob + 0.03, 0.94), 4);

      return {
        ...player,
        modelProb: round(modelProb, 4),
        edge: player.bookProb === null ? null : round(modelProb - player.bookProb, 4),
        top5Prob,
        top10Prob,
        top20Prob,
      } satisfies GolfPrediction;
    })
    .sort((left, right) => (
      right.combinedScore - left.combinedScore
    ) || (
      right.formScore - left.formScore
    ) || left.name.localeCompare(right.name));

  return {
    tournament: leaderboard.tournament,
    generatedAt,
    players,
    bestValuePicks: buildValuePlays(players).slice(0, 12),
    h2hMatchups: buildHeadToHeadMatchups(players, odds).slice(0, 10),
    dataSources,
  };
}

export function buildGolfPlayerInsights(
  leaderboard: GolfLeaderboard | null,
  historyByPlayer: PlayerHistoryMap,
  dgCache: DGCache | null = null,
): GolfPlayer[] {
  return buildGolfPredictionBoard(leaderboard, historyByPlayer, null, dgCache).players;
}

export function buildGolfHeadToHeadLean(playerA: GolfPlayer, playerB: GolfPlayer) {
  const left = playerA.combinedScore ?? playerA.compositeScore ?? 0;
  const right = playerB.combinedScore ?? playerB.compositeScore ?? 0;
  if (left === right) return null;
  return left > right ? playerA.name : playerB.name;
}

function formatProbability(probability: number) {
  return `${round(probability * 100, 1)}%`;
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getMarketProbability(player: GolfPrediction, market: GolfPredictionMarket) {
  if (market === "Tournament Winner") return player.modelProb;
  if (market === "Top 5 Finish") return player.top5Prob;
  if (market === "Top 10 Finish") return player.top10Prob;
  return player.top20Prob;
}

function getProxyBookProbability(player: GolfPrediction, market: GolfPredictionMarket) {
  return buildOutrightProxyFinishProbabilities(player.bookProb)[market];
}

function getRealTopFinishBookProbability(
  player: GolfPrediction,
  market: GolfPredictionMarket,
  bovadaTopFinishOdds?: BovadaTopFinishOddsMap | null,
) {
  const line = findBovadaTopFinishOdds(bovadaTopFinishOdds ?? null, player.name);
  if (!line) return null;
  const odds = market === "Top 5 Finish"
    ? line.top5
    : market === "Top 10 Finish"
      ? line.top10
      : line.top20;
  if (typeof odds !== "number") return null;
  return americanToImpliedProbability(odds);
}

function getDGMarketProbability(player: GolfPrediction, market: GolfPredictionMarket) {
  if (market === "Tournament Winner") return player.dgWinProb ?? null;
  if (market === "Top 5 Finish") return player.dgTop5Prob ?? null;
  if (market === "Top 10 Finish") return player.dgTop10Prob ?? null;
  return player.dgTop20Prob ?? null;
}

function buildGolfPickReasoning(
  player: GolfPrediction,
  market: GolfPredictionMarket,
  tournamentName: string,
  bookLabel: string,
  bookProbability: number | null,
) {
  const parts = [
    `${player.name} rates ${formatProbability(getMarketProbability(player, market))} for ${market.toLowerCase()} at ${tournamentName}.`,
    `Form ${round(player.formScore)}, course history ${round(player.courseHistoryScore)}, course fit ${round(player.courseFitScore)}.`,
  ];

  const dgMarketProbability = getDGMarketProbability(player, market);
  if (typeof player.dgRank === "number" || dgMarketProbability !== null || typeof player.sgT2G === "number") {
    const dgParts: string[] = [];
    if (typeof player.dgRank === "number") dgParts.push(`DataGolf rank #${player.dgRank}`);
    if (dgMarketProbability !== null) dgParts.push(`${market} model ${formatProbability(dgMarketProbability)}`);
    if (typeof player.sgT2G === "number") dgParts.push(`SG T2G ${formatSignedNumber(player.sgT2G)}`);
    parts.push(`${dgParts.join(" · ")}.`);
  }

  if (player.position && player.position !== "CUT" && player.position !== "MC" && player.position !== "—") {
    parts.push(`Current position: ${player.position}.`);
  }

  if (market === "Tournament Winner" && player.bookOdds !== null && player.bookProb !== null) {
    parts.push(`Outright price ${bookLabel} ${formatOdds(player.bookOdds)} implies ${formatProbability(player.bookProb)}.`);
  } else if (bookProbability !== null) {
    parts.push(`Placement edge uses an outright-derived free-data proxy from ${bookLabel}: ${formatProbability(bookProbability)} baseline.`);
  } else {
    parts.push("No matching book number is available, so this is model-only.");
  }

  return parts.join(" ");
}

function predictionToPick(
  player: GolfPrediction,
  market: GolfPredictionMarket,
  date: string,
  tournamentName: string,
  tournamentId: string | undefined,
  bovadaTopFinishOdds?: BovadaTopFinishOddsMap | null,
): AIPick {
  const modelProbability = getMarketProbability(player, market);
  const proxyBookProbability = market === "Tournament Winner"
    ? player.bookProb
    : getRealTopFinishBookProbability(player, market, bovadaTopFinishOdds) ?? getProxyBookProbability(player, market);

  // Look up real Bovada top-finish odds for this player (when available).
  // Real scraped lines take precedence over proxy calculations — honesty rule.
  //
  // CONTRACT: For top-finish markets (Top 5/10/20), this function should only
  // be called when real odds are confirmed available upstream (hasRealTopFinishLine).
  // If realTopFinishOdds ends up null here for a top-finish market, it means
  // the caller bypassed the integrity guard — that is a bug.
  const realBovadaLine = market !== "Tournament Winner"
    ? findBovadaTopFinishOdds(bovadaTopFinishOdds ?? null, player.name)
    : null;
  const realTopFinishOdds = (() => {
    if (!realBovadaLine) return null;
    if (market === "Top 5 Finish") return realBovadaLine.top5;
    if (market === "Top 10 Finish") return realBovadaLine.top10;
    if (market === "Top 20 Finish") return realBovadaLine.top20;
    return null;
  })();

  // For top-finish markets: real Bovada line required. If somehow null here,
  // log a warning — this should have been caught by hasRealTopFinishLine upstream.
  if (market !== "Tournament Winner" && realTopFinishOdds === null) {
    console.warn(
      `[golf-stats-engine] predictionToPick called for ${market} on ${player.name} without real odds — pick should have been blocked upstream.`,
    );
  }

  const bookLabel = market === "Tournament Winner"
    ? player.outrightBook ?? "Model Line"
    : realBovadaLine?.book ?? (realTopFinishOdds !== null
      ? "Top-finish book"
      : "No odds available");
  const displayProbability = proxyBookProbability ?? modelProbability;
  const odds = market === "Tournament Winner" && player.bookOdds !== null
    ? player.bookOdds
    : realTopFinishOdds !== null
      ? realTopFinishOdds  // Use real Bovada line when available
      : probabilityToAmericanOdds(displayProbability);  // Only reached if upstream guard missed it
  const edge = proxyBookProbability === null ? 0 : modelProbability - proxyBookProbability;

  // For golf, hitRate represents the confidence/composite score — NOT the raw probability.
  // Raw win probabilities (e.g. 3.9%) are meaningful for golf but look terrible as "hit rates".
  // The confidence score (combinedScore + modelProbability blend) maps to the 60-95 range
  // that aligns with the hitRate display standard used by NHL/NBA picks.
  const dgSupport = (() => {
    if (market === "Tournament Winner") return typeof player.dgWinProb === "number" ? player.dgWinProb * 100 : 0;
    if (market === "Top 5 Finish") return typeof player.dgTop5Prob === "number" ? player.dgTop5Prob * 100 : 0;
    if (market === "Top 10 Finish") return typeof player.dgTop10Prob === "number" ? player.dgTop10Prob * 100 : 0;
    return typeof player.dgTop20Prob === "number" ? player.dgTop20Prob * 100 : 0;
  })();
  const confidence = Math.round(clamp((player.combinedScore * 0.5) + (modelProbability * 100 * 0.2) + (dgSupport * 0.3), 35, 95));

  return {
    id: `golf-${slugify(player.name)}-${slugify(market)}-${date}`,
    date,
    type: "player",
    playerName: player.name,
    team: lastNameKey(player.name),
    teamColor: GOLF_PICK_COLOR,
    opponent: tournamentName,
    isAway: false,
    propType: market,
    line: 0,
    direction: "Over",
    pickLabel: market === "Tournament Winner" ? `${player.name} to win` : `${player.name} ${market}`,
    edge: round(edge * 100, 1),
    hitRate: confidence,
    confidence,
    reasoning: buildGolfPickReasoning(player, market, tournamentName, bookLabel, proxyBookProbability),
    result: "pending",
    units: 1,
    gameId: tournamentId,
    odds,
    book: bookLabel,
    league: "PGA",
  };
}

function selectUniquePlayers(players: GolfPrediction[], count: number, usedPlayers: Set<string>) {
  const selected: GolfPrediction[] = [];

  for (const player of players) {
    if (selected.length >= count) break;
    if (usedPlayers.has(player.id)) continue;
    usedPlayers.add(player.id);
    selected.push(player);
  }

  if (selected.length >= count) return selected;

  for (const player of players) {
    if (selected.length >= count) break;
    if (selected.some((entry) => entry.id === player.id)) continue;
    selected.push(player);
  }

  return selected;
}

// ── PGA outright winner rules ────────────────────────────────
// Hard rule: minimum +200 for any outright winner pick.
// Odds cap of -200 also applies (safety net; golf is always plus-money).
// 4 outright winner picks per tournament spanning value tiers.
const PGA_OUTRIGHT_WINNER_COUNT = 4;
const PGA_OUTRIGHT_MIN_ODDS     = 200;   // +200 minimum — no chalk below this
const PGA_OUTRIGHT_MAX_ODDS     = 10000; // avoid novelty/dead-ticket outrights

function isQualifyingOutrightOdds(odds: number | null | undefined): boolean {
  if (typeof odds !== "number") return false;
  return odds >= PGA_OUTRIGHT_MIN_ODDS && odds <= PGA_OUTRIGHT_MAX_ODDS;
}

// ── Top-Finish Odds Integrity Rule ───────────────────────────────────────────
// PGA top-finish picks (Top 5/10/20) MUST be backed by real scraped odds.
// Proxy estimates derived from outright win odds are NEVER acceptable for these
// markets — they are fabricated/estimated values, not real market lines.
//
// Permanent rule: if top-finish odds are not available from automated sources
// (Bovada snapshot), the pick is skipped entirely. Never fabricate, estimate,
// or substitute proxy odds. If truly unavailable, omit the pick.
function hasRealTopFinishLine(
  oddsMap: BovadaTopFinishOddsMap | null | undefined,
  playerName: string,
  market: GolfPredictionMarket,
): boolean {
  if (!oddsMap || oddsMap.size === 0) return false;
  const line = findBovadaTopFinishOdds(oddsMap, playerName);
  if (!line) return false;
  if (market === "Top 5 Finish") return line.top5 !== null;
  if (market === "Top 10 Finish") return line.top10 !== null;
  if (market === "Top 20 Finish") return line.top20 !== null;
  return false;
}

function getTopFinishEdge(
  player: GolfPrediction,
  market: GolfPredictionMarket,
  oddsMap: BovadaTopFinishOddsMap | null | undefined,
): number {
  if (!hasRealTopFinishLine(oddsMap, player.name, market)) return Number.NEGATIVE_INFINITY;
  const bookProbability = getRealTopFinishBookProbability(player, market, oddsMap);
  if (bookProbability === null) return Number.NEGATIVE_INFINITY;
  return getMarketProbability(player, market) - bookProbability;
}

function normalizeTopFinishMarket(market: GolfPredictionMarket): GolfPredictionMarket {
  if (market === "Top 20 Finish") return "Top 10 Finish";
  if (market === "Top 10 Finish") return "Top 5 Finish";
  return market;
}

type PGAMarketRule = {
  market: GolfPredictionMarket;
  targetCount: number;
  minEdge: number;
  minConfidence: number;
  uniquePlayerOnly?: boolean;
};

function scorePlacementCandidate(player: GolfPrediction, market: GolfPredictionMarket) {
  const probability = getMarketProbability(player, market);
  const dgSupport = getDGSupport(player, market);
  const confidence = Math.round(clamp((player.combinedScore * 0.5) + (probability * 100 * 0.2) + (dgSupport * 0.3), 35, 95));
  return {
    probability,
    dgSupport,
    confidence,
    profileScore: (player.formScore + player.courseHistoryScore + player.combinedScore),
  };
}

function getDGSupport(player: GolfPrediction, market: GolfPredictionMarket): number {
  if (market === "Tournament Winner") return typeof player.dgWinProb === "number" ? player.dgWinProb * 100 : 0;
  if (market === "Top 5 Finish") return typeof player.dgTop5Prob === "number" ? player.dgTop5Prob * 100 : 0;
  if (market === "Top 10 Finish") return typeof player.dgTop10Prob === "number" ? player.dgTop10Prob * 100 : 0;
  return typeof player.dgTop20Prob === "number" ? player.dgTop20Prob * 100 : 0;
}

function buildPGAMarketCandidates(
  players: GolfPrediction[],
  market: GolfPredictionMarket,
  oddsMap: BovadaTopFinishOddsMap | null | undefined,
) {
  const oddsLookupMarket = market === "Tournament Winner" ? market : normalizeTopFinishMarket(market);
  return players
    .filter((player) => market === "Tournament Winner"
      ? isQualifyingOutrightOdds(player.bookOdds)
      : hasRealTopFinishLine(oddsMap, player.name, oddsLookupMarket))
    .map((player) => {
      const edge = market === "Tournament Winner"
        ? (player.edge ?? Number.NEGATIVE_INFINITY)
        : getTopFinishEdge(player, oddsLookupMarket, oddsMap);
      const scoring = scorePlacementCandidate(player, market);
      return {
        player,
        edge,
        oddsLookupMarket,
        ...scoring,
      };
    })
    .sort((left, right) => (
      right.edge - left.edge
    ) || (
      right.confidence - left.confidence
    ) || (
      right.profileScore - left.profileScore
    ));
}

export function buildGolfTournamentPicks(
  predictions: GolfPredictionBoard,
  date: string,
  bovadaTopFinishOdds?: BovadaTopFinishOddsMap | null,
): AIPick[] {
  const players = predictions.players.filter((player) => player.position !== "CUT" && player.position !== "MC");
  const tournamentName = predictions.tournament?.name ?? "PGA Tournament";
  const tournamentId = predictions.tournament?.id;
  const picks: AIPick[] = [];
  const usedPlayers = new Set<string>();
  const rules: PGAMarketRule[] = [
    { market: "Tournament Winner", targetCount: 4, minEdge: 0.005, minConfidence: 35, uniquePlayerOnly: true },
    { market: "Top 5 Finish", targetCount: 2, minEdge: 0.01, minConfidence: 35, uniquePlayerOnly: true },
    { market: "Top 10 Finish", targetCount: 3, minEdge: 0.008, minConfidence: 35, uniquePlayerOnly: true },
    { market: "Top 20 Finish", targetCount: 4, minEdge: 0.006, minConfidence: 35 },
  ];

  for (const rule of rules) {
    const marketCandidates = buildPGAMarketCandidates(players, rule.market, bovadaTopFinishOdds);
    const candidates = marketCandidates
      .filter((candidate) => candidate.edge >= rule.minEdge)
      .filter((candidate) => candidate.confidence >= rule.minConfidence)
      .filter((candidate) => {
        if (!rule.uniquePlayerOnly) return true;
        return !usedPlayers.has(candidate.player.id);
      });

    console.log("[golf-stats-engine] market scan", {
      market: rule.market,
      totalCandidates: marketCandidates.length,
      qualifiedCandidates: candidates.length,
      thresholds: { minEdge: rule.minEdge, minConfidence: rule.minConfidence, uniquePlayerOnly: Boolean(rule.uniquePlayerOnly) },
      topCandidates: marketCandidates.slice(0, 8).map((candidate) => ({
        player: candidate.player.name,
        edge: Number.isFinite(candidate.edge) ? Number(candidate.edge.toFixed(4)) : null,
        confidence: candidate.confidence,
        odds: rule.market === "Tournament Winner"
          ? candidate.player.bookOdds
          : (() => {
            const line = findBovadaTopFinishOdds(bovadaTopFinishOdds ?? null, candidate.player.name);
            if (!line) return null;
            if (candidate.oddsLookupMarket === "Top 5 Finish") return line.top5;
            if (candidate.oddsLookupMarket === "Top 10 Finish") return line.top10;
            return line.top20;
          })(),
      })),
    });

    let added = 0;
    for (const candidate of candidates) {
      if (added >= rule.targetCount) break;
      const duplicateMarket = picks.some((pick) => pick.playerName === candidate.player.name && pick.propType === rule.market);
      if (duplicateMarket) continue;
      if (rule.uniquePlayerOnly && usedPlayers.has(candidate.player.id)) continue;

      picks.push(predictionToPick(candidate.player, rule.market, date, tournamentName, tournamentId, bovadaTopFinishOdds));
      if (rule.uniquePlayerOnly) usedPlayers.add(candidate.player.id);
      added += 1;
    }
  }

  return picks.slice(0, 16);
}

// --- DataGolf Integration ---

export interface DGEnrichedPlayer {
  sgTotal: number | null;
  sgOTT: number | null;
  sgAPP: number | null;
  sgARG: number | null;
  sgPUTT: number | null;
  sgT2G: number | null;
  dgRank: number | null;
  dgWinProb: number | null;
  dgTop5Prob: number | null;
  dgTop10Prob: number | null;
  dgTop20Prob: number | null;
  dgCourseFit: number | null;
}

function normalizeDGName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "").trim();
}

function findDGMatch<T extends { name: string }>(list: T[], playerName: string): T | undefined {
  const normalized = normalizeDGName(playerName);
  return list.find((p) => normalizeDGName(p.name) === normalized)
    || list.find((p) => normalizeDGName(p.name).includes(normalized) || normalized.includes(normalizeDGName(p.name)));
}

function getDGEnrichmentFromCache(cache: DGCache | null, playerName: string): DGEnrichedPlayer | null {
  if (!cache?.data) return null;

  const ranking = findDGMatch(cache.data.rankings, playerName);
  const prediction = findDGMatch(cache.data.predictions, playerName);
  const courseFit = findDGMatch(cache.data.courseFit, playerName);

  if (!ranking && !prediction && !courseFit) return null;

  return {
    sgTotal: ranking?.sgTotal ?? null,
    sgOTT: ranking?.sgOTT ?? null,
    sgAPP: ranking?.sgAPP ?? null,
    sgARG: ranking?.sgARG ?? null,
    sgPUTT: ranking?.sgPUTT ?? null,
    sgT2G: ranking?.sgT2G ?? null,
    dgRank: ranking?.rank ?? null,
    dgWinProb: prediction?.winProb ?? null,
    dgTop5Prob: prediction?.top5Prob ?? null,
    dgTop10Prob: prediction?.top10Prob ?? null,
    dgTop20Prob: prediction?.top20Prob ?? null,
    dgCourseFit: courseFit?.fitScore ?? null,
  };
}

/**
 * Enrich a golf player with DataGolf strokes-gained data from cache.
 */
export async function getDGEnrichment(playerName: string): Promise<DGEnrichedPlayer | null> {
  return getDGEnrichmentFromCache(await getDGCache(), playerName);
}

/**
 * Calculate edge from DataGolf prediction vs book odds.
 * Returns edge as percentage (e.g. 15.2 means +15.2% edge).
 */
export function calculateDGEdge(
  dgProb: number | null,
  bookOdds: number | null,
  market: "win" | "top5" | "top10" | "top20" = "win"
): number | null {
  if (dgProb === null || bookOdds === null) return null;

  // Convert American odds to implied probability
  const impliedProb = bookOdds > 0
    ? 100 / (bookOdds + 100)
    : Math.abs(bookOdds) / (Math.abs(bookOdds) + 100);

  // DG probs may be 0-1 or 0-100
  const dgProbNorm = dgProb > 1 ? dgProb / 100 : dgProb;

  const edge = (dgProbNorm - impliedProb) * 100;
  return Math.round(edge * 10) / 10;
}
