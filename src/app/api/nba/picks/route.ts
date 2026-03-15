import { NextRequest, NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks } from "@/lib/picks-engine";
import { persistPicksToSupabase } from "@/lib/persist-picks";
import { getDateKey, getPickDateKeys, NBA_TIME_ZONE } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isRealNBAGameId(gameId?: string | null) {
  return Boolean(gameId && /^\d{8,12}$/.test(gameId));
}

function getActiveGameIds(schedule: any[], allowedDates: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const game of schedule) {
    const gameDate = typeof game.date === "string" ? game.date.slice(0, 10) : "";
    const isToday = allowedDates.has(gameDate);
    const isNotFinished = game.status !== "Final";
    if (isToday && isNotFinished && isRealNBAGameId(game.id)) ids.add(game.id);
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const requestedDate = req.nextUrl.searchParams.get("date");
  const allowedDates = new Set(requestedDate ? [requestedDate] : getPickDateKeys(new Date(), NBA_TIME_ZONE));
  const date = requestedDate || getDateKey(new Date(), NBA_TIME_ZONE);

  try {
    const data = await getNBADashboardData();

    const todayIds = getActiveGameIds(data.schedule || [], allowedDates);
    const todayProps = (data.props || []).filter((p: any) => isRealNBAGameId(p?.gameId) && todayIds.has(p.gameId));
    const todayTrends = (data.teamTrends || []).filter((t: any) => isRealNBAGameId(t?.gameId) && todayIds.has(t.gameId));

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
