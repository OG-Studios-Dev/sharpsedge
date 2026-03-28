/**
 * GET /api/admin/systems/performance
 * GET /api/admin/systems/performance?systemId=...
 *
 * Returns per-system W/L/net-units performance summary from Supabase.
 * Public read: no auth required (stats are non-sensitive).
 */

import { NextRequest, NextResponse } from "next/server";
import { loadSystemPerformanceStats, loadSystemQualifierHistory } from "@/lib/systems-tracking-store";
import { getGradeabilityMap } from "@/lib/system-grader";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const systemId = request.nextUrl.searchParams.get("systemId") || undefined;
    const includeHistory = request.nextUrl.searchParams.get("history") === "true";
    const limitDays = Number(request.nextUrl.searchParams.get("days") || "90");

    const [perfStats, gradeabilityMap] = await Promise.all([
      loadSystemPerformanceStats(systemId).catch(() => []),
      Promise.resolve(getGradeabilityMap()),
    ]);

    let history = null;
    if (includeHistory && systemId) {
      history = await loadSystemQualifierHistory(systemId, limitDays).catch(() => []);
    }

    return NextResponse.json({
      ok: true,
      performanceStats: perfStats,
      gradeabilityMap,
      history,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load system performance",
    }, { status: 500 });
  }
}
