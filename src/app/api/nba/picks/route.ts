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

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), NBA_TIME_ZONE);

  try {
    const data = await getNBADashboardData();

    // Filter props and trends to today's games only for picks
    const todayIds = getTodayActiveGameIds(data.schedule || []);
    const todayProps = (data.props || []).filter((p: any) => typeof p.gameId === "string" && todayIds.has(p.gameId));
    const todayTrends = (data.teamTrends || []).filter((t: any) => typeof t.gameId === "string" && todayIds.has(t.gameId));

    const picks = selectNBATopPicks(todayProps, todayTrends, date);

    try {
      await persistPicksToSupabase(picks.map((pick) => ({ ...pick, league: pick.league ?? "NBA" })));
    } catch (error) {
      console.warn("[api/nba/picks] failed to persist picks", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date });
  }
}
// force redeploy 1773534840
