import { NextResponse } from "next/server";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import { getDateKey } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const board = await getTodayNHLContextBoard();
    return NextResponse.json(board);
  } catch (error) {
    return NextResponse.json({
      date: getDateKey(),
      season: "unknown",
      builtAt: new Date().toISOString(),
      games: [],
      availability: {
        officialAvailabilityApproximation: "team-news-link-tags",
        note: "NHL context board failed to build, so official availability approximation is unavailable for this request.",
        counts: {
          teamsWithOfficialNewsLinks: 0,
          teamsWithRosterMoveSignals: 0,
          teamsWithGameDaySignals: 0,
          teamsMissingOfficialSignals: 0,
        },
      },
      sourceHealth: {
        status: "missing",
        checks: [],
        degradedCount: 0,
        staleCount: 0,
        missingCount: 1,
      },
      meta: {
        sources: {
          schedule: { provider: "nhl-api", fetchedAt: null },
          standings: { provider: "nhl-api", fetchedAt: null },
          moneyPuck: {
            provider: "unavailable",
            kind: "unavailable",
            upstream: "MoneyPuck",
            url: null,
            asOf: null,
            fetchedAt: null,
            teamCount: 0,
          },
          news: {
            provider: "nhl.com",
            kind: "unavailable",
            fetchedAt: new Date().toISOString(),
            note: "Official team news adapter unavailable because the context board failed to build.",
          },
        },
        notes: [
          "NHL context board failed to build for this request.",
          error instanceof Error ? error.message : "Unknown error",
        ],
      },
    }, { status: 200 });
  }
}
