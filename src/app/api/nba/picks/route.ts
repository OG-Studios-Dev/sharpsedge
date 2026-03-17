import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
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
  const supabase = createServerClient();
  const requestedDate = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), NBA_TIME_ZONE);
  
  // Check for cached picks first
  const { data: cachedPicks } = await supabase
    .pickHistory
    .select("*")
    .eq("date", requestedDate)
    .eq("result", "pending")
    .eq("league", "NBA")
    .order("created_at", { ascending: false })
    .limit(10);

  if (cachedPicks && cachedPicks.length > 0) {
    return NextResponse.json({ picks: cachedPicks, date: requestedDate, source: "cached" });
  }

  const allowedDates = new Set([requestedDate]);
  const date = requestedDate;

  try {
    const data = await getNBADashboardData();

    const todayIds = getActiveGameIds(data.schedule || [], allowedDates);
    const todayProps = (data.props || []).filter((p: any) => isRealNBAGameId(p?.gameId) && todayIds.has(p.gameId));
    const todayTrends = (data.teamTrends || []).filter((t: any) => isRealNBAGameId(t?.gameId) && todayIds.has(t.gameId));

    const picks = selectNBATopPicks(todayProps, todayTrends, date);

    if (picks.length === 0) {
      return NextResponse.json({ picks: [], date, source: "no-qualifying" });
    }

    try {
      await persistPicksToSupabase(picks.map((pick) => ({ ...pick, league: pick.league ?? "NBA" })));
    } catch (error) {
      console.warn("[api/nba/picks] failed to persist picks", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return NextResponse.json({ picks, date, source: "generated" });
  } catch (error) {
    console.error("[api/nba/picks] error:", error);
    return NextResponse.json({ picks: [], date });
  }
}
// force redeploy 1773534840
