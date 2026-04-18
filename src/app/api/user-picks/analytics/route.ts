import { NextResponse } from "next/server";
import { listCurrentUserPicks, getCurrentUserPickStats } from "@/lib/user-picks-store";
import { computeUserPickAnalytics } from "@/lib/user-picks-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const picks = await listCurrentUserPicks(1000);
    const stats = await getCurrentUserPickStats();
    const analytics = computeUserPickAnalytics(picks, stats);
    return NextResponse.json({ analytics, picks });
  } catch (error) {
    return NextResponse.json(
      { analytics: null, picks: [], error: error instanceof Error ? error.message : "Failed to load user pick analytics" },
      { status: String(error).includes("Unauthorized") ? 401 : 500 },
    );
  }
}
