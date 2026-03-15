import {
  GolfLeaderboard,
  GolfPlayer,
  GolfPlayerHistoryResult,
  GolfPlayerHitRates,
  GolfPlayerSeasonStats,
} from "@/lib/types";

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

function parseFinishValue(finish: string) {
  const raw = finish.toUpperCase();
  if (!raw || raw === "—") return 65;
  if (raw === "CUT" || raw === "MC") return 80;
  const parsed = Number(raw.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 65;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeRate(hits: number, total: number) {
  if (total <= 0) return 0;
  return (hits / total) * 100;
}

function scoreFromFinishes(history: GolfPlayerHistoryResult[]) {
  if (history.length === 0) return 50;
  const weighted = history.map((result, index) => {
    const finish = parseFinishValue(result.finish);
    const weight = history.length - index;
    return { score: clamp(110 - finish * 2.4, 10, 100), weight };
  });

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 50;
  return weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
}

function scoreSeasonStats(stats: GolfPlayerSeasonStats | null | undefined) {
  if (!stats) return 50;
  const scoringAverage = stats.scoringAverage !== null ? clamp(100 - (stats.scoringAverage - 68) * 10, 0, 100) : 50;
  const drivingAccuracy = stats.drivingAccuracy !== null ? clamp(stats.drivingAccuracy, 0, 100) : 50;
  const gir = stats.gir !== null ? clamp(stats.gir, 0, 100) : 50;
  const puttingAverage = stats.puttingAverage !== null ? clamp(100 - (stats.puttingAverage - 1.68) * 100, 0, 100) : 50;
  return (scoringAverage * 0.45) + (drivingAccuracy * 0.15) + (gir * 0.2) + (puttingAverage * 0.2);
}

function scoreCurrentPosition(player: GolfPlayer) {
  const finish = parseFinishValue(player.position);
  return clamp(110 - finish * 2.8, 0, 100);
}

function buildCourseHistory(history: GolfPlayerHistoryResult[], course: string) {
  const normalizedCourse = course.toLowerCase();
  return history.filter((entry) => entry.course.toLowerCase() === normalizedCourse);
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

export function computeGolfHitRates(history: GolfPlayerHistoryResult[]): GolfPlayerHitRates {
  const sample = history.slice(0, 5);
  const rounds = sample.flatMap((entry) => entry.roundScores ?? []);

  return {
    top5: normalizeRate(sample.filter((entry) => parseFinishValue(entry.finish) <= 5).length, sample.length),
    top10: normalizeRate(sample.filter((entry) => parseFinishValue(entry.finish) <= 10).length, sample.length),
    top20: normalizeRate(sample.filter((entry) => parseFinishValue(entry.finish) <= 20).length, sample.length),
    madeCut: normalizeRate(sample.filter((entry) => entry.madeCut !== false && parseFinishValue(entry.finish) < 80).length, sample.length),
    firstRoundLeader: normalizeRate(sample.filter((entry) => (entry.roundScores?.[0] ?? 99) <= 67).length, sample.length),
    under70_5: normalizeRate(rounds.filter((round) => round <= 70.5).length, rounds.length),
  };
}

export function buildGolfPlayerInsights(
  leaderboard: GolfLeaderboard | null,
  historyByPlayer: PlayerHistoryMap,
): GolfPlayer[] {
  if (!leaderboard) return [];

  return leaderboard.players
    .map((player) => {
      const recentForm = historyByPlayer[player.id] ?? [];
      const courseHistory = buildCourseHistory(recentForm, leaderboard.tournament.course);
      const seasonStats = deriveSeasonStats(player, recentForm);
      const hitRates = computeGolfHitRates(recentForm);
      const recentFormScore = scoreFromFinishes(recentForm);
      const courseHistoryScore = courseHistory.length > 0 ? scoreFromFinishes(courseHistory) : recentFormScore * 0.85;
      const seasonScore = scoreSeasonStats(seasonStats);
      const currentScore = scoreCurrentPosition(player);
      const compositeScore = (recentFormScore * 0.45)
        + (courseHistoryScore * 0.2)
        + (seasonScore * 0.2)
        + (currentScore * 0.15);

      return {
        ...player,
        recentForm,
        courseHistory,
        seasonStats,
        hitRates,
        compositeScore: Math.round(compositeScore * 10) / 10,
      };
    })
    .sort((left, right) => (right.compositeScore ?? 0) - (left.compositeScore ?? 0) || left.name.localeCompare(right.name));
}

export function buildGolfHeadToHeadLean(playerA: GolfPlayer, playerB: GolfPlayer) {
  const left = playerA.compositeScore ?? 0;
  const right = playerB.compositeScore ?? 0;
  if (left === right) return null;
  return left > right ? playerA.name : playerB.name;
}
