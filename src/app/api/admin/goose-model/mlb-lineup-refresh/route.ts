/**
 * GET  /api/admin/goose-model/mlb-lineup-refresh  — cron trigger (5 PM ET = 21 UTC daily)
 * POST /api/admin/goose-model/mlb-lineup-refresh  — manual trigger
 *
 * Purpose: Re-generate MLB picks after official lineups are confirmed (~2-4 PM ET).
 * The primary generate-daily cron runs at 11 AM ET, before lineups are published.
 * This late-day refresh captures lineup-dependent edges that couldn't fire earlier:
 *   - lineup_bvp_edge (requires 9-batter confirmed lineup)
 *   - handedness_advantage (more reliable once actual pitcher confirmed)
 *   - umpire signals (HP ump may be finalized closer to game time)
 *
 * The refresh does NOT delete prior picks. It generates NEW picks with the
 * "lineup-refresh-v1" experiment tag so they can be tracked and compared separately.
 * Deduplication is handled at the display layer (latest pick per game/market wins).
 *
 * Timing rationale:
 *   MLB lineups posted: 2-4 PM ET on game days
 *   This cron: 5 PM ET (21 UTC) — safely after most lineups are confirmed
 *   Games start: 7-10 PM ET — still 2+ hours of lead time
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks } from "@/lib/goose-model/store";
import {
  SANDBOX_TOP_N,
  SANDBOX_HIT_RATE_FLOOR,
  SANDBOX_EDGE_FLOOR,
  SANDBOX_MIN_PICKS_TARGET,
} from "@/lib/goose-model/generator";
import { getMLBSeasonTimingStatus, canGenerateMLBPicksNow } from "@/lib/goose-model/mlb-timing";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MLB_LINEUP_REFRESH_TAG = "lineup-refresh-v1";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-goose-model-cron");
  if (!cronSecret && !adminSecret) return true; // dev mode
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (adminSecret && authHeader === `Bearer ${adminSecret}`) return true;
  if (cronHeader === "1") return true;
  return false;
}

async function runMLBLineupRefresh(opts: {
  date: string;
  baseUrl: string;
  sandbox?: boolean;
}): Promise<{
  date: string;
  experiment_tag: string;
  lineup_status_note: string;
  mlb_timing: ReturnType<typeof getMLBSeasonTimingStatus>;
  prior_picks_today: number;
  refresh_picks: number;
  scored_count: number;
  skipped: boolean;
  skip_reason?: string;
}> {
  const { date, baseUrl, sandbox = true } = opts;
  const mlbTiming = getMLBSeasonTimingStatus();

  if (!canGenerateMLBPicksNow()) {
    return {
      date,
      experiment_tag: MLB_LINEUP_REFRESH_TAG,
      lineup_status_note: "off-season — MLB lineup refresh skipped",
      mlb_timing: mlbTiming,
      prior_picks_today: 0,
      refresh_picks: 0,
      scored_count: 0,
      skipped: true,
      skip_reason: mlbTiming.reason,
    };
  }

  // Count already-stored MLB picks today (all experiment tags)
  let priorPicksToday = 0;
  try {
    const existing = await listGoosePicks({ date, sport: "MLB", limit: 50 });
    priorPicksToday = existing.length;
  } catch { /* non-fatal */ }

  // Run generation with lineup-refresh tag and wider threshold to capture BvP-enabled picks
  // Use same sandbox thresholds but hit a 5 PM ET window where lineups should be official
  const body = {
    date,
    sport: "MLB",
    sandbox,
    experiment_tag: MLB_LINEUP_REFRESH_TAG,
    topN: SANDBOX_TOP_N,
    hit_rate_floor: SANDBOX_HIT_RATE_FLOOR,
    edge_floor: SANDBOX_EDGE_FLOOR,
  };

  let refreshPicks = 0;
  let scoredCount = 0;

  try {
    const res = await fetch(`${baseUrl}/api/admin/goose-model/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goose-model-cron": "1",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json() as { selected_count?: number; scored_count?: number };
      refreshPicks = data.selected_count ?? 0;
      scoredCount = data.scored_count ?? 0;
    } else {
      const text = await res.text().catch(() => "");
      console.warn("[mlb-lineup-refresh] generate failed:", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error("[mlb-lineup-refresh] generate error:", err);
  }

  // "Generate more" fallback if under minimum
  if (refreshPicks < SANDBOX_MIN_PICKS_TARGET) {
    try {
      const retryBody = { ...body, hit_rate_floor: 0, edge_floor: 0, experiment_tag: `${MLB_LINEUP_REFRESH_TAG}-wide` };
      const res2 = await fetch(`${baseUrl}/api/admin/goose-model/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goose-model-cron": "1" },
        body: JSON.stringify(retryBody),
        cache: "no-store",
      });
      if (res2.ok) {
        const data2 = await res2.json() as { selected_count?: number };
        refreshPicks += data2.selected_count ?? 0;
      }
    } catch { /* non-fatal */ }
  }

  return {
    date,
    experiment_tag: MLB_LINEUP_REFRESH_TAG,
    lineup_status_note: "5 PM ET window — lineups should be official. BvP/handedness signals active.",
    mlb_timing: mlbTiming,
    prior_picks_today: priorPicksToday,
    refresh_picks: refreshPicks,
    scored_count: scoredCount,
    skipped: false,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = new Date().toISOString().slice(0, 10);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin || "http://localhost:3000";

  try {
    const result = await runMLBLineupRefresh({ date, baseUrl, sandbox: true });
    console.info("[mlb-lineup-refresh] cron completed", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[mlb-lineup-refresh] cron failed", error);
    return NextResponse.json({ error: "MLB lineup refresh failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { date?: string; sandbox?: boolean };
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin || "http://localhost:3000";

    const result = await runMLBLineupRefresh({ date, baseUrl, sandbox: body.sandbox ?? true });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[mlb-lineup-refresh] manual run failed", error);
    return NextResponse.json({ error: "MLB lineup refresh failed" }, { status: 500 });
  }
}
