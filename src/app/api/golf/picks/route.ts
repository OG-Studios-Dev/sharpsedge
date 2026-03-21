import { NextRequest, NextResponse } from "next/server";
import { getGolfTournamentPicks, getTournamentDateKey } from "@/lib/golf-live-data";
import { getPGALeaderboard } from "@/lib/golf-api";
import { getDGCacheSummary } from "@/lib/datagolf-cache";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    // Resolve the tournament start date as the canonical date key for PGA picks.
    const leaderboard = await getPGALeaderboard();
    const tournamentDateKey = getTournamentDateKey(leaderboard?.tournament);

    // Check for locked slate first (already generated picks persist)
    const lockedSlate = await getStoredPickSlate(tournamentDateKey, "PGA");
    if (lockedSlate.slate) {
      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date: tournamentDateKey,
          source: "history_locked",
          integrity: lockedSlate.slate,
        },
        { status: lockedSlate.slate.integrity_status === "incomplete" ? 409 : 200 },
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

    if (result.picks.length === 0) {
      return NextResponse.json({ picks: [], date: tournamentDateKey, source: "no-qualifying" });
    }

    const stored = await storeDailyPickSlate(
      result.picks.map((pick) => ({ ...pick, league: "PGA" })),
      {
        date: tournamentDateKey,
        league: "PGA",
      },
    );

    return NextResponse.json(
      {
        picks: stored.picks,
        date: tournamentDateKey,
        source: stored.source === "existing" ? "history_locked" : "generated_locked",
        integrity: stored.slate,
      },
      { status: stored.slate?.integrity_status === "incomplete" ? 409 : 200 },
    );
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
