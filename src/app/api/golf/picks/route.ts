import { NextRequest, NextResponse } from "next/server";
import { getGolfTournamentPicks, getTournamentDateKey } from "@/lib/golf-live-data";
import { getPGALeaderboard } from "@/lib/golf-api";
import { getDGCacheSummary } from "@/lib/datagolf-cache";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";
import { shouldRecoverStoredSlate } from "@/lib/pick-history-integrity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    league: "PGA",
    status: pickCount >= expectedPickCount ? "locked" : "incomplete",
    provenance: "original",
    expected_pick_count: expectedPickCount,
    pick_count: pickCount,
    integrity_status: pickCount >= expectedPickCount ? "ok" : "incomplete",
    status_note: message,
  };
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
  try {
    // Resolve the tournament start date as the canonical date key for PGA picks.
    const leaderboard = await getPGALeaderboard();
    const tournamentDateKey = getTournamentDateKey(leaderboard?.tournament);

    // Check for locked slate first (already generated picks persist)
    const lockedSlate = await getStoredPickSlate(tournamentDateKey, "PGA");
    if (lockedSlate.slate && !shouldRecoverStoredSlate(lockedSlate.slate, lockedSlate.records)) {
      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date: tournamentDateKey,
          source: "history_locked",
          integrity: lockedSlate.slate,
          warning: integrityWarning(lockedSlate.slate),
        },
        { status: shouldReturnIntegrityConflict(req, lockedSlate.slate.integrity_status) ? 409 : 200 },
      );
    }

    // Guard: Don't generate PGA picks if DataGolf data isn't ready.
    // Without good DG data, hitRates are garbage (3-11%).
    const dgStatus = await getDGCacheSummary();
    if (!dgStatus.ready) {
      return NextResponse.json({
        picks: [],
        date: tournamentDateKey,
        source: "dg-not-ready",
        reason: dgStatus.reason,
      });
    }

    const result = await getGolfTournamentPicks(tournamentDateKey);

    console.log("[api/golf/picks] generated", {
      date: tournamentDateKey,
      generatedCount: result.picks.length,
      generatedPicks: result.picks.map((pick) => ({
        player: pick.playerName,
        market: pick.propType,
        edge: pick.edge,
        confidence: pick.confidence,
        odds: pick.odds,
      })),
    });

    if (result.picks.length === 0) {
      return NextResponse.json({ picks: [], date: tournamentDateKey, source: "no-qualifying" });
    }

    const normalizedPicks = result.picks.map((pick) => ({ ...pick, league: "PGA" }));

    try {
      const stored = await storeDailyPickSlate(normalizedPicks, {
        date: tournamentDateKey,
        league: "PGA",
        allowRecovery: false,
      });

      console.log("[api/golf/picks] stored", {
        date: tournamentDateKey,
        source: stored.source,
        persistedCount: stored.records.length,
        returnedCount: stored.picks.length,
        slate: stored.slate,
      });

      return NextResponse.json(
        {
          picks: stored.picks,
          date: tournamentDateKey,
          source: stored.source === "existing" ? "history_locked" : stored.source === "repaired" ? "generated_repaired" : "generated_locked",
          integrity: stored.slate,
          warning: integrityWarning(stored.slate),
        },
        { status: shouldReturnIntegrityConflict(req, stored.slate?.integrity_status) ? 409 : 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist authoritative picks";
      console.error("[api/golf/picks] persistence degraded, serving generated picks:", error);
      return NextResponse.json(
        {
          picks: normalizedPicks,
          date: tournamentDateKey,
          source: "generated_unlocked",
          integrity: buildEphemeralIntegrity(tournamentDateKey, normalizedPicks.length, `Serving generated picks without persistence: ${message}`, lockedSlate.slate),
          warning: message,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error("[api/golf/picks] error:", error);
    return NextResponse.json(
      {
        picks: [],
        date: "error",
        source: "integrity_error",
        error: error instanceof Error ? error.message : "Failed to load authoritative picks",
      },
      { status: 503 },
    );
  }
}
