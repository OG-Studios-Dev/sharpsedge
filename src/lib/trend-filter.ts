import { PlayerProp } from "@/lib/types";

const L10_THRESHOLD = 60;  // 60%+ in last 10
const L5_MIN_HITS   = 3;   // 3/5 in last 5
const STREAK_MIN    = 3;   // 3+ consecutive

/**
 * Returns true if a prop qualifies as a "trend" by ANY of:
 * 1. 60%+ hit rate in last 10
 * 2. 3/5 in last 5
 * 3. 3+ consecutive games hitting
 */
export function qualifiesAsTrend(p: PlayerProp): boolean {
  // Criterion 1: L10 hit rate >= 60%
  if (typeof p.hitRate === "number" && p.hitRate >= L10_THRESHOLD) return true;

  const games = p.recentGames;
  const line  = p.line;
  const dir   = p.direction || p.overUnder;

  if (!games?.length || line === undefined || !dir) return false;

  const isHit = (v: number) => dir === "Over" ? v > line : v < line;

  // Criterion 2: 3/5 in last 5
  const last5 = games.slice(0, 5);
  if (last5.length >= 5 && last5.filter(isHit).length >= L5_MIN_HITS) return true;

  // Criterion 3: 3+ consecutive (current streak from most recent)
  let streak = 0;
  for (const v of games) {
    if (isHit(v)) streak++;
    else break;
  }
  if (streak >= STREAK_MIN) return true;

  return false;
}
