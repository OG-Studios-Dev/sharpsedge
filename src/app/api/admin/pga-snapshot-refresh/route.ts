/**
 * GET/POST /api/admin/pga-snapshot-refresh
 *
 * Admin endpoint to regenerate the PGA bundled fallback snapshot
 * (data/pga/datagolf-field.snapshot.json) from the live Supabase DG cache.
 *
 * WHY THIS EXISTS:
 *   The bundled snapshot is the last-resort fallback when both Supabase
 *   and /tmp caches are unavailable. It ships in the repo and is static
 *   unless manually updated. Running this endpoint weekly keeps the bundled
 *   snapshot current, so the last-resort fallback still reflects the
 *   current or upcoming tournament field — not a stale tournament from weeks ago.
 *
 * SAFETY:
 *   - Read-only in GET mode (status check only)
 *   - POST mode writes to disk — guarded by ADMIN_SECRET or SCRAPE_SECRET
 *   - Validates that the live cache is populated before overwriting
 *   - Adds _meta.honestLimitations to the written snapshot
 *   - Does NOT overwrite if the live cache is stale or empty
 *   - ONLY updates the bundled snapshot — does not affect Supabase or /tmp
 *
 * USAGE:
 *   GET  /api/admin/pga-snapshot-refresh           → status check
 *   POST /api/admin/pga-snapshot-refresh           → refresh bundled snapshot
 *   POST /api/admin/pga-snapshot-refresh?force=true → force even if same tournament
 *
 * RECOMMENDED CADENCE: once per week (Monday morning or after tournament ends).
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { getDGCache, getDGCacheSummary } from "@/lib/datagolf-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUNDLED_SNAPSHOT_PATH = join(process.cwd(), "data/pga/datagolf-field.snapshot.json");

function isAuthorized(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  const scrapeSecret = process.env.SCRAPE_SECRET;

  if (!adminSecret && !scrapeSecret) return true; // no secrets configured — allow in dev

  const authHeader = request.headers.get("authorization");
  const xKey = request.headers.get("x-admin-key") || request.headers.get("x-scrape-key");

  if (adminSecret && (authHeader === `Bearer ${adminSecret}` || xKey === adminSecret)) return true;
  if (scrapeSecret && (authHeader === `Bearer ${scrapeSecret}` || xKey === scrapeSecret)) return true;

  return false;
}

export async function GET() {
  try {
    const cacheSummary = await getDGCacheSummary();
    return NextResponse.json({
      mode: "status",
      currentLiveCache: {
        ready: cacheSummary.ready,
        tournament: cacheSummary.tournament,
        lastScrape: cacheSummary.lastScrape,
        sourceTier: cacheSummary.sourceTier,
        reason: cacheSummary.reason,
      },
      bundledSnapshotPath: "data/pga/datagolf-field.snapshot.json",
      instructions: {
        refresh: "POST /api/admin/pga-snapshot-refresh (with admin/scrape secret) to regenerate bundled snapshot from live cache",
        cadence: "Recommended: weekly, Monday morning or after tournament ends",
        guard: "Will refuse to overwrite if live cache is stale, empty, or lacks usable data",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized — supply x-admin-key or x-scrape-key header" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "true";

  try {
    const [cacheSummary, dgCache] = await Promise.all([
      getDGCacheSummary(),
      getDGCache(),
    ]);

    // Safety guard: do not overwrite with empty/stale data
    if (!cacheSummary.ready) {
      return NextResponse.json(
        {
          success: false,
          reason: `Live DG cache is not ready: ${cacheSummary.reason}`,
          cache: cacheSummary,
          action: "Bundled snapshot NOT updated. Scrape first (/api/golf/scrape?force=true), then re-run this endpoint.",
        },
        { status: 409 },
      );
    }

    if (!dgCache?.data) {
      return NextResponse.json(
        {
          success: false,
          reason: "DG cache returned no data object.",
          action: "Bundled snapshot NOT updated.",
        },
        { status: 409 },
      );
    }

    const { rankings, predictions, courseFit, field } = dgCache.data;

    if (rankings.length === 0 && predictions.length === 0 && courseFit.length === 0 && field.length === 0) {
      return NextResponse.json(
        {
          success: false,
          reason: "Live DG cache has zero rows in all data arrays. Not safe to overwrite bundled snapshot.",
          action: "Bundled snapshot NOT updated.",
        },
        { status: 409 },
      );
    }

    // Build the new bundled snapshot
    const now = new Date().toISOString();
    const snapshot = {
      _meta: {
        kind: "bundled-fallback-snapshot",
        version: "1.1",
        bundledAt: now,
        tournament: dgCache.tournament,
        lastScrapeAt: dgCache.lastScrape,
        generatedBy: "POST /api/admin/pga-snapshot-refresh",
        sourceStrategy:
          "This snapshot was generated from the live Supabase DG cache by the bundled-snapshot refresh endpoint. " +
          "It contains real DataGolf data (rankings, SG metrics, course-fit scores, predictions, field). " +
          "This is a last-resort fallback only — the live Supabase cache (24h TTL) is the primary source. " +
          "Do not use this snapshot to make picks directly; it may be stale relative to current tournament.",
        sourceDetails: {
          rankingsCount: rankings.length,
          predictionsCount: predictions.length,
          courseFitCount: courseFit.length,
          fieldCount: field.length,
        },
        honestLimitations:
          "This bundled snapshot is only used when Supabase + /tmp both fail. " +
          "Rankings, SG data, and course-fit are from the last successful scrape at bundledAt. " +
          "Data may be from a different tournament than the current one if not refreshed weekly.",
      },
      timestamp: dgCache.lastScrape,
      tournament: dgCache.tournament,
      venue: null as unknown,
      rankings,
      predictions,
      courseFit,
      field,
      errors: [],
    };

    writeFileSync(BUNDLED_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");

    return NextResponse.json({
      success: true,
      message: `Bundled snapshot updated from live DG cache (${dgCache.tournament}).`,
      snapshot: {
        tournament: dgCache.tournament,
        lastScrapeAt: dgCache.lastScrape,
        rankingsCount: rankings.length,
        predictionsCount: predictions.length,
        courseFitCount: courseFit.length,
        fieldCount: field.length,
        writtenAt: now,
        path: "data/pga/datagolf-field.snapshot.json",
      },
      nextSteps: [
        "Commit the updated snapshot to the repo: git add data/pga/datagolf-field.snapshot.json && git commit -m 'chore(pga): refresh bundled DG snapshot'",
        "This snapshot will now be the last-resort fallback for the next deployment.",
      ],
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: String(err),
        action: "Bundled snapshot NOT updated due to error.",
      },
      { status: 500 },
    );
  }
}
