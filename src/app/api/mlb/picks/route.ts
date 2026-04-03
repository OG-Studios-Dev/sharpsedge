import { NextRequest, NextResponse } from "next/server";
import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBDashboardData } from "@/lib/mlb-live-data";
import { selectMLBTopPicks } from "@/lib/picks-engine";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
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

function pickMeetsCurrentMLBGate(pick: { hitRate?: number; edge?: number }) {
  const hitRate = typeof pick.hitRate === "number" ? pick.hitRate : 0;
  const edge = typeof pick.edge === "number" ? pick.edge : 0;
  return hitRate >= 72 && edge >= 12;
}

async function repairStoredMLBSlate(date: string, keepPicks: any[], removeIds: string[]) {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getSupabaseServiceRoleKey();

  if (removeIds.length > 0) {
    const filters = removeIds.map((id) => `id.eq.${encodeURIComponent(id)}`).join(",");
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/pick_history?or=(${filters})`, {
      method: "DELETE",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      cache: "no-store",
    });

    if (!deleteResponse.ok) {
      const detail = await deleteResponse.text();
      throw new Error(`Failed to delete stale MLB picks: ${detail}`);
    }
  }

  const patchResponse = await fetch(`${supabaseUrl}/rest/v1/pick_slates?date=eq.${encodeURIComponent(date)}&league=eq.MLB`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      pick_count: keepPicks.length,
      status: keepPicks.length > 0 ? "locked" : "incomplete",
      provenance: "manual_repair",
      provenance_note: "Auto-rewritten same day after tightened MLB production gate removed stale picks.",
      status_note: keepPicks.length > 0
        ? `Auto-rewrite removed ${removeIds.length} MLB pick(s) that failed the current production gate.`
        : "Auto-rewrite removed all MLB picks because none passed the current production gate.",
      updated_at: new Date().toISOString(),
    }),
    cache: "no-store",
  });

  if (!patchResponse.ok) {
    const detail = await patchResponse.text();
    throw new Error(`Failed to patch MLB slate metadata: ${detail}`);
  }
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
      const staleRows = lockedSlate.records.filter((row) => !pickMeetsCurrentMLBGate({ hitRate: row.hit_rate ?? undefined, edge: row.edge ?? undefined }));
      if (staleRows.length > 0) {
        const keepPicks = lockedSlate.picks.filter((pick) => pickMeetsCurrentMLBGate({ hitRate: pick.hitRate, edge: pick.edge }));
        await repairStoredMLBSlate(date, keepPicks, staleRows.map((row) => row.id));
        const repaired = await getStoredPickSlate(date, "MLB");
        return NextResponse.json(
          {
            picks: repaired.picks,
            date,
            source: "history_rewritten",
            integrity: repaired.slate,
            meta: {
              propsConsidered: props.length,
              trendsConsidered: teamTrends.length,
              gamesActive: todayIds.size,
              removedStalePickCount: staleRows.length,
            },
          },
          { status: repaired.slate?.integrity_status === "incomplete" ? 409 : 200 },
        );
      }

      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date,
          source: "history_locked",
          integrity: lockedSlate.slate,
          meta: {
            propsConsidered: props.length,
            trendsConsidered: teamTrends.length,
            gamesActive: todayIds.size,
          },
        },
        { status: lockedSlate.slate.integrity_status === "incomplete" ? 409 : 200 },
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
      });

      return NextResponse.json(
        {
          picks: stored.picks,
          date,
          source: stored.source === "existing" ? "history_locked" : stored.source === "repaired" ? "generated_repaired" : "generated_locked",
          integrity: stored.slate,
          meta: {
            propsConsidered: props.length,
            trendsConsidered: teamTrends.length,
            gamesActive: todayIds.size,
          },
        },
        { status: stored.slate?.integrity_status === "incomplete" ? 409 : 200 },
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
