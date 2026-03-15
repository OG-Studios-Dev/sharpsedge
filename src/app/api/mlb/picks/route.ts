import { NextRequest, NextResponse } from "next/server";
import { getDateKey } from "@/lib/date-utils";
import { MLB_TIME_ZONE } from "@/lib/mlb-api";
import { getMLBDashboardData } from "@/lib/mlb-live-data";
import { selectMLBTopPicks } from "@/lib/picks-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getTodayActiveGameIds(schedule: any[]) {
  const today = getDateKey(new Date(), MLB_TIME_ZONE);
  const ids = new Set<string>();

  for (const game of schedule) {
    const gameDate = typeof game.date === "string" ? game.date.slice(0, 10) : "";
    if (gameDate === today && game.status !== "Final") {
      ids.add(String(game.id));
    }
  }

  if (ids.size === 0) {
    for (const game of schedule) {
      const gameDate = typeof game.date === "string" ? game.date.slice(0, 10) : "";
      if (gameDate === today) ids.add(String(game.id));
    }
  }

  return ids;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), MLB_TIME_ZONE);

  try {
    const data = await getMLBDashboardData();
    const todayIds = getTodayActiveGameIds(data.schedule || []);
    const props = todayIds.size > 0
      ? (data.props || []).filter((prop: any) => !prop.gameId || todayIds.has(prop.gameId))
      : (data.props || []);
    const teamTrends = todayIds.size > 0
      ? (data.teamTrends || []).filter((trend: any) => !trend.gameId || todayIds.has(trend.gameId))
      : (data.teamTrends || []);

    const picks = selectMLBTopPicks(props, teamTrends, date);
    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date });
  }
}
