import { NextRequest, NextResponse } from "next/server";
import { getPlayerHeadshotCached } from "@/lib/asset-cache";
import { getPlayerHeadshot } from "@/lib/visual-identity";

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league");
  const playerId = req.nextUrl.searchParams.get("playerId");
  const playerName = req.nextUrl.searchParams.get("playerName");
  const headshot = req.nextUrl.searchParams.get("headshot");

  if (!league) {
    return NextResponse.json({ error: "league is required" }, { status: 400 });
  }

  const fallback = getPlayerHeadshot({
    league,
    playerId,
    playerName,
    headshot,
  });

  if (!playerId) {
    return NextResponse.json({ url: headshot || fallback || null });
  }

  const url = await getPlayerHeadshotCached(league, playerId, headshot || fallback || null);
  return NextResponse.json({ url: url || null });
}
