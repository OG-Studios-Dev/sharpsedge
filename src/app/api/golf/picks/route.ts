import { NextRequest, NextResponse } from "next/server";
import { getGolfTournamentPicks, getTournamentDateKey } from "@/lib/golf-live-data";
import { getPGALeaderboard } from "@/lib/golf-api";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    // PGA picks are disabled until pick_slates table exists and DataGolf scraper
    // is fully wired. Without the lock table, picks regenerate on every page load
    // with garbage hitRates. Re-enable once pick_slates is created in Supabase.
    const PGA_PICKS_ENABLED = false;
    if (!PGA_PICKS_ENABLED) {
      return NextResponse.json({ picks: [], date: new Date().toISOString().slice(0, 10), source: "disabled" });
    }

    // Resolve the tournament start date as the canonical date key for PGA picks.
    // This ensures picks generated on Thursday persist through the entire tournament
    // instead of regenerating every day when the client sends today's date.
    const leaderboard = await getPGALeaderboard();
    const tournamentDateKey = getTournamentDateKey(leaderboard?.tournament);

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
