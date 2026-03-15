import { NextResponse } from "next/server";
import { getNHLMatchupData } from "@/lib/nhl-matchup";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  try {
    const data = await getNHLMatchupData(gameId);
    if (!data) {
      return NextResponse.json({ error: "Matchup not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load matchup" }, { status: 500 });
  }
}
