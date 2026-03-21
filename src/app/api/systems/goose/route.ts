import { NextRequest, NextResponse } from "next/server";
import { readSystemsTrackingData, refreshTodayGooseSystem } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const shouldRefresh = ["1", "true", "yes"].includes((request.nextUrl.searchParams.get("refresh") || request.nextUrl.searchParams.get("cron") || "").toLowerCase());
    const date = request.nextUrl.searchParams.get("date") || undefined;

    if (request.nextUrl.searchParams.get("cron") === "true") {
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const authHeader = request.headers.get("authorization");
        if (authHeader !== `Bearer ${cronSecret}`) {
          return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
      }
    }

    const system = shouldRefresh
      ? await refreshTodayGooseSystem({ date })
      : (await readSystemsTrackingData()).systems.find((entry) => entry.id === "nba-goose-system");

    return NextResponse.json({
      ok: true,
      refreshed: shouldRefresh,
      updatedAt: new Date().toISOString(),
      system: system || null,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load Goose system",
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const system = await refreshTodayGooseSystem({ date: body?.date || undefined });
    return NextResponse.json({
      ok: true,
      refreshed: true,
      updatedAt: new Date().toISOString(),
      system,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refresh Goose system",
    }, { status: 500 });
  }
}
