import { NextRequest, NextResponse } from "next/server";
import { getSportsGameOddsSample, getSportsGameOddsUsage } from "@/lib/sportsgameodds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const sport = req.nextUrl.searchParams.get("sport") || "NBA";
    const usage = await getSportsGameOddsUsage();
    const sample = await getSportsGameOddsSample(sport);

    const usageData = usage.data;
    const limit = usageData?.limit ?? 0;
    const remaining = usageData?.remaining ?? 0;
    const used = usageData?.used ?? 0;
    const usagePct = limit > 0 ? Math.round((used / limit) * 100) : null;

    const status = !usage.ok
      ? "degraded"
      : !sample.ok
      ? "degraded"
      : usagePct != null && usagePct >= 90
      ? "critical"
      : usagePct != null && usagePct >= 80
      ? "stale"
      : "healthy";

    return NextResponse.json({
      provider: "SportsGameOdds",
      generatedAt: new Date().toISOString(),
      sport: String(sport).toUpperCase(),
      status,
      envConfigured: Boolean(process.env.SPORTSGAMEODDS_API_KEY || process.env.SPORTSGAMEODDS_API_KEYS),
      usage: {
        ok: usage.ok,
        status: usage.status,
        used,
        remaining,
        limit,
        usagePct,
        resetAt: usageData?.resetAt ?? null,
      },
      sample: {
        ok: sample.ok,
        status: sample.status,
        path: sample.path,
        attempts: sample.attempts,
        preview: Array.isArray(sample.sample)
          ? sample.sample.slice(0, 2)
          : sample.sample && typeof sample.sample === "object"
          ? Object.fromEntries(Object.entries(sample.sample).slice(0, 8))
          : sample.sample,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        provider: "SportsGameOdds",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
