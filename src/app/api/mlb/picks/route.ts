import { NextRequest, NextResponse } from "next/server";
import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBDashboardData } from "@/lib/mlb-live-data";
import { selectMLBTopPicks } from "@/lib/picks-engine";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";
import { shouldRecoverStoredSlate } from "@/lib/pick-history-integrity";

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
    league: "MLB",
    status: pickCount >= expectedPickCount ? "locked" : "incomplete",
    provenance: "original",
    expected_pick_count: expectedPickCount,
    pick_count: pickCount,
    integrity_status: pickCount >= expectedPickCount ? "ok" : "incomplete",
    status_note: message,
  };
}

function isPickableMLBOdds(odds?: number | null) {
  if (typeof odds !== "number") return true;
  return odds >= -200 && odds <= 300;
}

function pickMeetsCurrentMLBGate(pick: { hitRate?: number; edge?: number; odds?: number | null }) {
  const hitRate = typeof pick.hitRate === "number" ? pick.hitRate : 0;
  const edge = typeof pick.edge === "number" ? pick.edge : 0;
  const odds = typeof pick.odds === "number" ? pick.odds : null;
  return hitRate >= 72 && edge >= 12 && isPickableMLBOdds(odds);
}

function shouldReturnIntegrityConflict(req: NextRequest, integrityStatus?: string | null) {
  return integrityStatus === "incomplete" && req.headers.get("x-goose-model-agent") === "1";
}

function integrityWarning(integrity?: { integrity_status?: string | null; status_note?: string | null } | null) {
  return integrity?.integrity_status === "incomplete"
    ? integrity.status_note ?? "Stored authoritative slate is incomplete."
    : undefined;
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey(new Date(), MLB_TIME_ZONE);

  try {
    const lockedSlate = await getStoredPickSlate(date, "MLB");

    const data = await getMLBDashboardData();
    const todayIds = getTodayActiveGameIds(data.schedule || []);
    const props = todayIds.size > 0
      ? (data.props || []).filter((prop: any) => !prop.gameId || todayIds.has(prop.gameId))
      : (data.props || []);
    const teamTrends = todayIds.size > 0
      ? (data.teamTrends || []).filter((trend: any) => !trend.gameId || todayIds.has(trend.gameId))
      : (data.teamTrends || []);
    const picks = selectMLBTopPicks(props, teamTrends, date);

    if (lockedSlate.slate && !shouldRecoverStoredSlate(lockedSlate.slate, lockedSlate.records)) {
      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date,
          source: "history_locked",
          integrity: lockedSlate.slate,
          warning: integrityWarning(lockedSlate.slate),
          meta: {
            propsConsidered: props.length,
            trendsConsidered: teamTrends.length,
            gamesActive: todayIds.size,
          },
        },
        { status: shouldReturnIntegrityConflict(req, lockedSlate.slate.integrity_status) ? 409 : 200 },
      );
    }

    if (picks.length === 0) {
      return NextResponse.json({
        picks: [],
        date,
        source: "no-qualifying",
        meta: {
          propsConsidered: props.length,
          trendsConsidered: teamTrends.length,
          gamesActive: todayIds.size,
        },
      });
    }

    const normalizedPicks = picks.map((pick: any) => ({ ...pick, league: pick.league ?? "MLB" }));

    try {
      const stored = await storeDailyPickSlate(normalizedPicks, {
        date,
        league: "MLB",
        allowRecovery: false,
      });

      return NextResponse.json(
        {
          picks: stored.picks,
          date,
          source: stored.source === "existing" ? "history_locked" : stored.source === "repaired" ? "generated_repaired" : "generated_locked",
          integrity: stored.slate,
          warning: integrityWarning(stored.slate),
          meta: {
            propsConsidered: props.length,
            trendsConsidered: teamTrends.length,
            gamesActive: todayIds.size,
          },
        },
        { status: shouldReturnIntegrityConflict(req, stored.slate?.integrity_status) ? 409 : 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist authoritative picks";
      console.error("[api/mlb/picks] persistence degraded, serving generated picks:", error);
      return NextResponse.json(
        {
          picks: normalizedPicks,
          date,
          source: "generated_unlocked",
          integrity: buildEphemeralIntegrity(date, normalizedPicks.length, `Serving generated picks without persistence: ${message}`, lockedSlate.slate),
          warning: message,
          meta: {
            propsConsidered: props.length,
            trendsConsidered: teamTrends.length,
            gamesActive: todayIds.size,
          },
        },
        { status: 200 },
      );
    }
  } catch (err) {
    console.error("[api/mlb/picks] error:", err);
    return NextResponse.json(
      {
        picks: [],
        date,
        source: "integrity_error",
        error: err instanceof Error ? err.message : "Failed to load authoritative picks",
      },
      { status: 503 },
    );
  }
}
