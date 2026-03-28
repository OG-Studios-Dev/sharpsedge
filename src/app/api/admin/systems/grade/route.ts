/**
 * POST /api/admin/systems/grade
 * GET  /api/admin/systems/grade?systemId=...
 *
 * Grades pending system qualifier rows from live game results.
 * - NHL (Swaggy Stretch Drive): grades from NHL API final scores
 * - MLB (Falcons Fight): grades from MLB Stats API final scores
 * - NBA Goose: graded inline via ESPN quarter scores (existing path)
 *
 * Auth: ADMIN_SECRET or SCRAPE_SECRET (dev-unrestricted when unset).
 */

import { NextRequest, NextResponse } from "next/server";
import { gradeAllSystemQualifiers, gradeSystemById, getGradeabilityMap } from "@/lib/system-grader";
import { loadPendingQualifiers } from "@/lib/system-qualifiers-db";
import { loadSystemPerformanceStats } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  const scrapeSecret = process.env.SCRAPE_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  // Dev: unrestricted when no secrets configured
  if (!adminSecret && !scrapeSecret && !cronSecret) return true;

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  return (
    (adminSecret && token === adminSecret) ||
    (scrapeSecret && token === scrapeSecret) ||
    (cronSecret && token === cronSecret) ||
    false
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const isCron = ["1", "true"].includes((request.nextUrl.searchParams.get("cron") || "").toLowerCase());

  // When called as cron: run grading automatically
  if (isCron) {
    try {
      const result = await gradeAllSystemQualifiers();
      const perfStats = await loadSystemPerformanceStats().catch(() => []);
      return NextResponse.json({
        ...result,
        performanceStats: perfStats,
        cron: true,
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        cron: true,
        error: error instanceof Error ? error.message : "Grading failed",
      }, { status: 500 });
    }
  }

  try {
    const systemId = request.nextUrl.searchParams.get("systemId") || undefined;
    const gradeabilityMap = getGradeabilityMap();

    // Load pending counts
    const pending = await loadPendingQualifiers(systemId).catch(() => []);
    const pendingBySystem = pending.reduce((acc, q) => {
      acc[q.system_id] = (acc[q.system_id] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Load current performance stats from DB
    const perfStats = await loadSystemPerformanceStats(systemId).catch(() => []);

    return NextResponse.json({
      ok: true,
      gradeabilityMap,
      pendingQualifiers: pendingBySystem,
      totalPending: pending.length,
      performanceStats: perfStats,
      hint: "POST to /api/admin/systems/grade to run grading. Add ?cron=true for cron-triggered auto-grade.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load grading status",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const systemId = typeof body?.systemId === "string" ? body.systemId : undefined;

    let result;
    if (systemId) {
      result = await gradeSystemById(systemId);
    } else {
      result = await gradeAllSystemQualifiers();
    }

    // Refresh performance stats after grading
    const perfStats = await loadSystemPerformanceStats(systemId).catch(() => []);

    return NextResponse.json({
      ...result,
      performanceStats: perfStats,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to grade system qualifiers",
    }, { status: 500 });
  }
}
