import { NextResponse } from "next/server";
import { getPGALeaderboard } from "@/lib/golf-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leaderboard = await getPGALeaderboard();
    return NextResponse.json({ leaderboard });
  } catch {
    return NextResponse.json({ leaderboard: null });
  }
}
