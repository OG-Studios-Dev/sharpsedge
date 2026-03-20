import { NextRequest, NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks } from "@/lib/picks-engine";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";
import { getDateKey, NBA_TIME_ZONE } from "@/lib/date-utils";

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
  const requestedDate = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), NBA_TIME_ZONE);

  const allowedDates = new Set([requestedDate]);
  const date = requestedDate;

  try {
    const lockedSlate = await getStoredPickSlate(date, "NBA");
    if (lockedSlate.slate) {
      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date,
          source: "history_locked",
          integrity: lockedSlate.slate,
        },
        { status: lockedSlate.slate.integrity_status === "incomplete" ? 409 : 200 },
      );
    }

    const data = await getNBADashboardData();

    const todayIds = getActiveGameIds(data.schedule || [], allowedDates);
    const todayProps = (data.props || []).filter((p: any) => isRealNBAGameId(p?.gameId) && todayIds.has(p.gameId));
    const todayTrends = (data.teamTrends || []).filter((t: any) => isRealNBAGameId(t?.gameId) && todayIds.has(t.gameId));

    const picks = selectNBATopPicks(todayProps, todayTrends, date);

    if (picks.length === 0) {
      return NextResponse.json({ picks: [], date, source: "no-qualifying" });
    }

    const stored = await storeDailyPickSlate(
      picks.map((pick) => ({ ...pick, league: pick.league ?? "NBA" })),
      {
        date,
        league: "NBA",
      },
    );

    return NextResponse.json(
      {
        picks: stored.picks,
        date,
        source: stored.source === "existing" ? "history_locked" : "generated_locked",
        integrity: stored.slate,
      },
      { status: stored.slate?.integrity_status === "incomplete" ? 409 : 200 },
    );
  } catch (error) {
    console.error("[api/nba/picks] error:", error);
    return NextResponse.json(
      {
        picks: [],
        date,
        source: "integrity_error",
        error: error instanceof Error ? error.message : "Failed to load authoritative picks",
      },
      { status: 503 },
    );
  }
}
// force redeploy 1773534840
