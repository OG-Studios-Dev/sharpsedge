import { calculatePayout } from "@/lib/pick-record";
import type { UserPickRecord, UserPickStatsRecord } from "@/lib/supabase-types";

export type UserPickHistoryBucket = {
  key: string;
  label: string;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  settled: number;
  winRate: number;
  profitUnits: number;
  totalUnitsRisked: number;
  roi: number;
  picks: UserPickRecord[];
};

export type UserPickAnalytics = {
  overall: UserPickStatsRecord;
  byDay: UserPickHistoryBucket[];
  bySport: UserPickHistoryBucket[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeStake(units: number | null | undefined) {
  return typeof units === "number" && Number.isFinite(units) && units > 0 ? units : 1;
}

function buildEmptyStats(): UserPickStatsRecord {
  return {
    user_id: "",
    total_picks: 0,
    settled_picks: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    win_rate: 0,
    profit_units: 0,
    roi: 0,
    current_streak: 0,
    best_win_streak: 0,
    updated_at: new Date(0).toISOString(),
  };
}

export function computeUserPickStats(picks: UserPickRecord[], userId = ""): UserPickStatsRecord {
  const stats = buildEmptyStats();
  stats.user_id = userId;
  stats.total_picks = picks.length;
  stats.updated_at = new Date().toISOString();

  let currentStreak = 0;
  let bestWinStreak = 0;
  let streakDirection: "win" | "loss" | null = null;
  let totalRiskedOnSettled = 0;

  const chron = [...picks].sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime());

  for (const pick of chron) {
    const stake = normalizeStake(pick.units);

    if (pick.status === "win") {
      stats.wins += 1;
      stats.settled_picks += 1;
      stats.profit_units += calculatePayout(typeof pick.odds === "number" ? pick.odds : undefined, stake);
      totalRiskedOnSettled += stake;
      currentStreak = streakDirection === "win" ? currentStreak + 1 : 1;
      streakDirection = "win";
      bestWinStreak = Math.max(bestWinStreak, currentStreak);
    } else if (pick.status === "loss") {
      stats.losses += 1;
      stats.settled_picks += 1;
      stats.profit_units -= stake;
      totalRiskedOnSettled += stake;
      currentStreak = streakDirection === "loss" ? currentStreak - 1 : -1;
      streakDirection = "loss";
    } else if (pick.status === "push" || pick.status === "void" || pick.status === "cancelled") {
      stats.pushes += 1;
      stats.settled_picks += 1;
      streakDirection = null;
      currentStreak = 0;
    } else {
      stats.pending += 1;
    }
  }

  stats.profit_units = round2(stats.profit_units);
  stats.win_rate = stats.settled_picks > 0 ? round2((stats.wins / stats.settled_picks) * 100) : 0;
  stats.roi = totalRiskedOnSettled > 0 ? round2((stats.profit_units / totalRiskedOnSettled) * 100) : 0;
  stats.current_streak = currentStreak;
  stats.best_win_streak = bestWinStreak;
  return stats;
}

function formatDayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function bucketize(
  picks: UserPickRecord[],
  getKey: (pick: UserPickRecord) => string,
  getLabel: (key: string) => string,
): UserPickHistoryBucket[] {
  const grouped = new Map<string, UserPickRecord[]>();

  for (const pick of picks) {
    const key = getKey(pick);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(pick);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => {
      const stats = computeUserPickStats(group, group[0]?.user_id ?? "");
      const totalUnitsRisked = round2(group.reduce((sum, pick) => {
        if (pick.status === "pending") return sum;
        return sum + normalizeStake(pick.units);
      }, 0));

      return {
        key,
        label: getLabel(key),
        wins: stats.wins,
        losses: stats.losses,
        pushes: stats.pushes,
        pending: stats.pending,
        settled: stats.settled_picks,
        winRate: stats.win_rate,
        profitUnits: stats.profit_units,
        totalUnitsRisked,
        roi: stats.roi,
        picks: group.sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()),
      };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

export function computeUserPickAnalytics(picks: UserPickRecord[], stats?: UserPickStatsRecord | null): UserPickAnalytics {
  const overall = stats ?? computeUserPickStats(picks, picks[0]?.user_id ?? "");
  const byDay = bucketize(
    picks,
    (pick) => pick.game_date || pick.placed_at.slice(0, 10),
    (key) => formatDayLabel(key),
  );
  const bySport = bucketize(
    picks,
    (pick) => (pick.league || "Other").toUpperCase(),
    (key) => key,
  );

  return { overall, byDay, bySport };
}
