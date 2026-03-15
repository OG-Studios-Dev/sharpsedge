import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks } from "@/lib/picks-engine";
import { persistPicksToSupabase } from "@/lib/persist-picks";
import { getDateKey, NBA_TIME_ZONE } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Today's upcoming/live game IDs (filter out completed + future days)
function getTodayActiveGameIds(schedule: any[]): Set<string> {
  const today = getDateKey(new Date(), NBA_TIME_ZONE);
  const ids = new Set<string>();
  for (const game of schedule) {
    const gameDate = typeof game.date === "string" ? game.date.slice(0, 10) : "";
    const isToday = gameDate === today;
    const isNotFinished = game.status !== "Final";
    if (isToday && isNotFinished) ids.add(game.id);
  }
  // If no active today games, fall back to all today games
  if (ids.size === 0) {
    for (const game of schedule) {
      const gameDate = typeof game.date === "string" ? game.date.slice(0, 10) : "";
      if (gameDate === today) ids.add(game.id);
    }
  }
  return ids;
}

function readBuiltDashboardFallback() {
  try {
    const fallbackPath = path.join(process.cwd(), ".next", "server", "app", "api", "nba", "dashboard.body");
    if (!fs.existsSync(fallbackPath)) return null;
    return JSON.parse(fs.readFileSync(fallbackPath, "utf8"));
  } catch {
    return null;
  }
}

function buildFallbackPicks(date: string) {
  const fallback = readBuiltDashboardFallback();
  if (!fallback) return null;

  const todayIds = getTodayActiveGameIds(fallback.schedule || []);
  const todayProps = (fallback.props || []).filter((prop: any) => !prop.gameId || todayIds.has(prop.gameId));
  const todayTrends = (fallback.teamTrends || []).filter((trend: any) => !trend.gameId || todayIds.has(trend.gameId));
  const picks = selectNBATopPicks(todayProps, todayTrends, date);

  return { picks, date };
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), NBA_TIME_ZONE);

  try {
    const data = await getNBADashboardData();

    // Filter props and trends to today's games only for picks
    const todayIds = getTodayActiveGameIds(data.schedule || []);
    const todayProps = (data.props || []).filter((p: any) => !p.gameId || todayIds.has(p.gameId));
    const todayTrends = (data.teamTrends || []).filter((t: any) => !t.gameId || todayIds.has(t.gameId));

    const picks = selectNBATopPicks(todayProps, todayTrends, date);
    if (picks.length === 0) {
      const fallback = buildFallbackPicks(date);
      if (fallback) return NextResponse.json(fallback);
    }
    persistPicksToSupabase(picks.map(p => ({ ...p, league: p.league ?? "NBA" }))).catch(() => {});
    return NextResponse.json({ picks, date });
  } catch {
    const fallback = buildFallbackPicks(date);
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json({ picks: [], date });
  }
}
// force redeploy 1773534840
