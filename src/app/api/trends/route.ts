import { NextResponse } from "next/server";
import { getLiveTrendData } from "@/lib/live-data";
import { PlayerProp, TeamTrend } from "@/lib/types";

const L10_THRESHOLD = 70;   // 70%+ in last 10
const L5_MIN_HITS = 3;      // 3/5 in last 5
const STREAK_MIN = 3;       // 3+ consecutive games

/**
 * Returns true if a prop qualifies as a "trend" by ANY of:
 * 1. 70%+ hit rate in last 10
 * 2. 3/5 in last 5
 * 3. 3+ consecutive games hitting
 */
function qualifiesAsTrend(p: PlayerProp): boolean {
  // Criterion 1: L10 hit rate >= 70%
  if (typeof p.hitRate === "number" && p.hitRate >= L10_THRESHOLD) return true;

  const games = p.recentGames;
  const line = p.line;
  const dir = p.direction || p.overUnder;

  if (!games?.length || line === undefined || !dir) return false;

  const hits = (vals: number[]) =>
    vals.filter((v) => dir === "Over" ? v > line : v < line);

  // Criterion 2: 3/5 in last 5
  const last5 = games.slice(0, 5);
  if (last5.length >= 5 && hits(last5).length >= L5_MIN_HITS) return true;

  // Criterion 3: 3+ consecutive hits (current streak)
  let streak = 0;
  for (const val of games) {
    const hit = dir === "Over" ? val > line : val < line;
    if (hit) streak++;
    else break;
  }
  if (streak >= STREAK_MIN) return true;

  return false;
}

function teamQualifies(t: TeamTrend): boolean {
  return typeof t.hitRate === "number" && t.hitRate >= L10_THRESHOLD;
}

export async function GET() {
  try {
    const data = await getLiveTrendData();

    const trendingProps = (data.props || []).filter(qualifiesAsTrend);
    const trendingTeams = (data.teamTrends || []).filter(teamQualifies);

    return NextResponse.json({
      props: trendingProps,
      teamTrends: trendingTeams,
      meta: {
        ...data.meta,
        criteria: "70%+ L10 OR 3/5 L5 OR 3-game streak",
        propsCount: trendingProps.length,
        teamTrendsCount: trendingTeams.length,
      },
    });
  } catch {
    return NextResponse.json({ props: [], teamTrends: [], meta: {} });
  }
}
