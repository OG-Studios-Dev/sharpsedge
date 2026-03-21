import { NextRequest, NextResponse } from "next/server";
import { getAggregatedOddsBoard } from "@/lib/odds-aggregator";
import { captureMarketSnapshot } from "@/lib/market-snapshot-store";
import { SUPPORTED_AGGREGATION_SPORTS, type AggregatedSport } from "@/lib/books/types";

export const dynamic = "force-dynamic";

function isTruthy(value: string | null) {
  return ["1", "true", "yes"].includes((value || "").toLowerCase());
}

function authorizeCron(request: NextRequest) {
  if (request.nextUrl.searchParams.get("cron") !== "true") return null;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured for cron requests" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return null;

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function parseSportsParam(value: string | null) {
  if (!value) return SUPPORTED_AGGREGATION_SPORTS;

  const requested = value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

  const sports = requested.filter((sport): sport is AggregatedSport => {
    return SUPPORTED_AGGREGATION_SPORTS.includes(sport as AggregatedSport);
  });

  return sports.length ? sports : SUPPORTED_AGGREGATION_SPORTS;
}

function buildSummary(result: Awaited<ReturnType<typeof captureMarketSnapshot>>, requestedSports: AggregatedSport[]) {
  const { snapshot, persistence } = result;
  return {
    ok: true,
    captured: true,
    snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt,
    requestedSports,
    source: snapshot.source,
    trigger: snapshot.trigger,
    reason: snapshot.reason,
    counts: {
      sports: snapshot.sportCount,
      games: snapshot.gameCount,
      events: snapshot.eventCount,
      prices: snapshot.priceCount,
      books: snapshot.sourceSummary.bookCount,
    },
    freshness: snapshot.freshness,
    sourceSummary: snapshot.sourceSummary,
    sportBreakdown: snapshot.sportBreakdown,
    persistence,
    warnings: [
      ...(snapshot.gameCount === 0 ? ["Snapshot captured with zero games on board."] : []),
      ...(snapshot.sourceSummary.bookCount === 0 ? ["Snapshot captured with zero books available from upstream sources."] : []),
      ...(persistence.file.status === "memory_fallback" ? ["Filesystem archive unavailable; snapshot kept in memory only for this runtime."] : []),
      ...(persistence.supabase.status === "error" ? [`Supabase persistence failed: ${persistence.supabase.error ?? "unknown error"}`] : []),
      ...(snapshot.freshness.staleSourceCount > 0 ? [`${snapshot.freshness.staleSourceCount} upstream source entries were older than 30 minutes at capture time.`] : []),
    ],
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const shouldCapture = isTruthy(request.nextUrl.searchParams.get("capture") || request.nextUrl.searchParams.get("cron"));
    const sports = parseSportsParam(request.nextUrl.searchParams.get("sports"));

    if (!shouldCapture) {
      return NextResponse.json({
        ok: true,
        captured: false,
        message: "Add ?capture=true for a manual snapshot or ?cron=true for a cron-triggered capture.",
        supportedSports: SUPPORTED_AGGREGATION_SPORTS,
      });
    }

    const board = await getAggregatedOddsBoard(sports);
    const scopedBoard = Object.fromEntries(sports.map((sport) => [sport, board[sport] || []])) as Partial<Record<AggregatedSport, Awaited<ReturnType<typeof getAggregatedOddsBoard>>[AggregatedSport]>>;
    const result = await captureMarketSnapshot({
      board: scopedBoard,
      trigger: request.nextUrl.searchParams.get("cron") === "true" ? "cron" : "manual",
      reason: request.nextUrl.searchParams.get("reason") || null,
    });

    return NextResponse.json(buildSummary(result, sports));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to capture aggregated odds snapshot",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sports = parseSportsParam(typeof body?.sports === "string" ? body.sports : null);
    const board = await getAggregatedOddsBoard(sports);
    const scopedBoard = Object.fromEntries(sports.map((sport) => [sport, board[sport] || []])) as Partial<Record<AggregatedSport, Awaited<ReturnType<typeof getAggregatedOddsBoard>>[AggregatedSport]>>;
    const result = await captureMarketSnapshot({
      board: scopedBoard,
      trigger: "api",
      reason: typeof body?.reason === "string" ? body.reason : null,
    });

    return NextResponse.json(buildSummary(result, sports));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to capture aggregated odds snapshot",
    }, { status: 500 });
  }
}
