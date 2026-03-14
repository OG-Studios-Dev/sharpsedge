import { NextRequest, NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { upsertPickHistory } from "@/lib/pick-history";
import { selectNBATopPicks } from "@/lib/picks-engine";

// Today's game IDs from schedule (filter picks to today only)
function getTodayGameIds(schedule: any[]): Set<string> {
  const today = new Date().toISOString().slice(0, 10);
  const ids = new Set<string>();
  for (const game of schedule) {
    const gameDate = typeof game.date === "string" ? game.date.slice(0, 10) : "";
    if (gameDate === today) ids.add(game.id);
  }
  return ids;
}

export async function GET(req: NextRequest) {
  try {
    const data = await getNBADashboardData();
    const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);

    // Filter props and trends to today's games only for picks
    const todayIds = getTodayGameIds(data.schedule || []);
    const todayProps = (data.props || []).filter((p: any) => !p.gameId || todayIds.has(p.gameId));
    const todayTrends = (data.teamTrends || []).filter((t: any) => !t.gameId || todayIds.has(t.gameId));

    const picks = selectNBATopPicks(todayProps, todayTrends, date);

    try {
      await upsertPickHistory(picks.map((pick) => ({ ...pick, league: "NBA" })));
    } catch (error) {
      console.warn("[nba-picks] unable to update admin pick history", error);
    }

    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date: new Date().toISOString().slice(0, 10) });
  }
}
