import { NextRequest, NextResponse } from "next/server";
import { getAggregatedOddsBoard } from "@/lib/odds-aggregator";
import { captureMarketSnapshot } from "@/lib/market-snapshot-store";
import { addIncident, readAdminOpsData, updateCronSchedule, updateIncident } from "@/lib/admin-ops-store";
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

async function syncCronHealth(snapshotPath: string, capturedAt: string, succeeded: boolean) {
  const ops = await readAdminOpsData();
  const cron = ops.cronSchedules.find((item) => item.path === snapshotPath);
  if (!cron) return;

  await updateCronSchedule(cron.id, {
    lastRunAt: capturedAt,
    lastSuccessAt: succeeded ? capturedAt : cron.lastSuccessAt ?? null,
    lastFailureAt: succeeded ? cron.lastFailureAt ?? null : capturedAt,
    consecutiveFailures: succeeded ? 0 : (cron.consecutiveFailures ?? 0) + 1,
  });
}

async function syncQuarterCoverageIncident(
  requestedSports: AggregatedSport[],
  reason: string | null,
  capturedAt: string,
  quarterCoverage: { q1PriceCount: number; q3PriceCount: number; q1GameCount: number; q3GameCount: number; booksWithQ1: string[]; booksWithQ3: string[] },
) {
  const isDedicatedNbaArchive = requestedSports.length === 1 && requestedSports[0] === "NBA" && reason === "nba-q1-q3-daily-archive";
  if (!isDedicatedNbaArchive) return;

  const zeroQuarterRows = quarterCoverage.q1PriceCount === 0 || quarterCoverage.q3PriceCount === 0;
  const ops = await readAdminOpsData();
  const existing = ops.incidents.find((incident) => incident.title === "NBA quarter archive missing Q1/Q3 lines" && incident.status !== "resolved");

  if (zeroQuarterRows) {
    const summary = `Daily NBA quarter archive captured with Q1 rows=${quarterCoverage.q1PriceCount} across ${quarterCoverage.q1GameCount} games and Q3 rows=${quarterCoverage.q3PriceCount} across ${quarterCoverage.q3GameCount} games.`;
    const notes = `Quarter-source visibility: Q1 books=${quarterCoverage.booksWithQ1.join(", ") || "none"}; Q3 books=${quarterCoverage.booksWithQ3.join(", ") || "none"}. Existing non-Odds-API adapters vary by environment, so this incident stays open until named books are actually producing Q1/Q3 rows.`;

    if (existing) {
      await updateIncident(existing.id, {
        status: "investigating",
        severity: "sev2",
        summary,
        impact: "Goose settlement/archive rail lacks usable daily Q1/Q3 market coverage.",
        notes,
      });
      return;
    }

    await addIncident({
      title: "NBA quarter archive missing Q1/Q3 lines",
      severity: "sev2",
      status: "investigating",
      owner: "Odds pipeline",
      summary,
      impact: "Goose settlement/archive rail lacks usable daily Q1/Q3 market coverage.",
      resolvedAt: null,
      notes,
    });
    return;
  }

  if (existing) {
    await updateIncident(existing.id, {
      status: "resolved",
      resolvedAt: capturedAt,
      summary: `Daily NBA quarter archive recovered with Q1 rows=${quarterCoverage.q1PriceCount} and Q3 rows=${quarterCoverage.q3PriceCount}.`,
      impact: "Quarter archive coverage restored for the dedicated daily NBA checkpoint.",
    });
  }
}

function buildSummary(result: Awaited<ReturnType<typeof captureMarketSnapshot>>, requestedSports: AggregatedSport[]) {
  const { snapshot, quarterCoverage, persistence } = result;
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
    quarterCoverage,
    freshness: snapshot.freshness,
    health: snapshot.health,
    sourceSummary: snapshot.sourceSummary,
    sportBreakdown: snapshot.sportBreakdown,
    persistence,
    warnings: [
      ...(snapshot.gameCount === 0 ? ["Snapshot captured with zero games on board."] : []),
      ...(snapshot.sourceSummary.bookCount === 0 ? ["Snapshot captured with zero books available from upstream sources."] : []),
      ...(persistence.file.status === "memory_fallback" ? ["Filesystem archive unavailable; snapshot kept in memory only for this runtime."] : []),
      ...(persistence.supabase.status === "error" ? [`Supabase persistence failed: ${persistence.supabase.error ?? "unknown error"}`] : []),
      ...(snapshot.freshness.staleSourceCount > 0 ? [`${snapshot.freshness.staleSourceCount} upstream source entries were older than 30 minutes at capture time.`] : []),
      ...(quarterCoverage.q1PriceCount === 0 ? [`No Q1 spread rows were captured in this snapshot. Books with Q1 coverage: ${quarterCoverage.booksWithQ1.join(", ") || "none"}.`] : []),
      ...(quarterCoverage.q3PriceCount === 0 ? [`No Q3 spread rows were captured in this snapshot. Books with Q3 coverage: ${quarterCoverage.booksWithQ3.join(", ") || "none"}.`] : []),
      ...(snapshot.health.status !== "healthy" ? [`Snapshot health ${snapshot.health.status}: ${snapshot.health.summary}`] : []),
    ],
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const reason = request.nextUrl.searchParams.get("reason") || null;
  const sports = parseSportsParam(request.nextUrl.searchParams.get("sports"));
  const trigger = request.nextUrl.searchParams.get("cron") === "true" ? "cron" : "manual";
  const cronPath = `/api/odds/aggregated/snapshot?cron=true&sports=${sports.join(",")}${reason ? `&reason=${reason}` : ""}`;

  try {
    const shouldCapture = isTruthy(request.nextUrl.searchParams.get("capture") || request.nextUrl.searchParams.get("cron"));

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
      trigger,
      reason,
    });

    await Promise.all([
      trigger === "cron" ? syncCronHealth(cronPath, result.snapshot.capturedAt, true) : Promise.resolve(),
      syncQuarterCoverageIncident(sports, reason, result.snapshot.capturedAt, result.quarterCoverage),
    ]);

    return NextResponse.json(buildSummary(result, sports));
  } catch (error) {
    if (trigger === "cron") {
      await syncCronHealth(cronPath, new Date().toISOString(), false);
    }
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
