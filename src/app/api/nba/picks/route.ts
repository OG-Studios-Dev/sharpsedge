import { NextRequest, NextResponse } from "next/server";
import { getNBADashboardData } from "@/lib/nba-live-data";
import { selectNBATopPicks } from "@/lib/picks-engine";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";
import { shouldRecoverStoredSlate } from "@/lib/pick-history-integrity";
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

function buildEphemeralIntegrity(
  date: string,
  pickCount: number,
  message: string,
  priorIntegrity?: Record<string, unknown> | null,
) {
  const previous = (priorIntegrity ?? {}) as Record<string, unknown>;
  const expectedPickCount = typeof previous.expected_pick_count === "number" ? previous.expected_pick_count : pickCount;

  return {
    ...previous,
    date,
    league: "NBA",
    status: pickCount >= expectedPickCount ? "locked" : "incomplete",
    provenance: "original",
    expected_pick_count: expectedPickCount,
    pick_count: pickCount,
    integrity_status: pickCount >= expectedPickCount ? "ok" : "incomplete",
    status_note: message,
  };
}

export async function GET(req: NextRequest) {
  const requestedDate = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), NBA_TIME_ZONE);

  const allowedDates = new Set([requestedDate]);
  const date = requestedDate;

  try {
    const lockedSlate = await getStoredPickSlate(date, "NBA");
    if (lockedSlate.slate && !shouldRecoverStoredSlate(lockedSlate.slate, lockedSlate.records)) {
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

    const normalizedPicks = picks.map((pick) => ({ ...pick, league: pick.league ?? "NBA" }));

    try {
      const stored = await storeDailyPickSlate(normalizedPicks, {
        date,
        league: "NBA",
      });

      return NextResponse.json(
        {
          picks: stored.picks,
          date,
          source: stored.source === "existing" ? "history_locked" : stored.source === "repaired" ? "generated_repaired" : "generated_locked",
          integrity: stored.slate,
        },
        { status: stored.slate?.integrity_status === "incomplete" ? 409 : 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist authoritative picks";
      console.error("[api/nba/picks] persistence degraded, serving generated picks:", error);
      return NextResponse.json(
        {
          picks: normalizedPicks,
          date,
          source: "generated_unlocked",
          integrity: buildEphemeralIntegrity(date, normalizedPicks.length, `Serving generated picks without persistence: ${message}`, lockedSlate.slate),
          warning: message,
        },
        { status: 200 },
      );
    }
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
