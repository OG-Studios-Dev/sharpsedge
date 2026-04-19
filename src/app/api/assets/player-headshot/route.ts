import { NextRequest, NextResponse } from "next/server";
import { getPlayerHeadshotCached } from "@/lib/asset-cache";
import { getPlayerHeadshot } from "@/lib/visual-identity";

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league");
  const playerId = req.nextUrl.searchParams.get("playerId");
  const playerName = req.nextUrl.searchParams.get("playerName");
  const headshot = req.nextUrl.searchParams.get("headshot");
  const proxy = req.nextUrl.searchParams.get("proxy") === "1";

  if (!league) {
    return NextResponse.json({ error: "league is required" }, { status: 400 });
  }

  const fallback = getPlayerHeadshot({
    league,
    playerId,
    playerName,
    headshot,
  });

  const resolvedUrl = playerId
    ? await getPlayerHeadshotCached(league, playerId, headshot || fallback || null)
    : headshot || fallback || null;

  if (!proxy) {
    return NextResponse.json({ url: resolvedUrl || null });
  }

  if (!resolvedUrl) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const upstream = await fetch(resolvedUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": "GoosalyticsHeadshotProxy/1.0",
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(null, { status: 404 });
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const bytes = await upstream.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
