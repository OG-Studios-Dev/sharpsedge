/**
 * GET  /api/admin/goose-model/generate-daily  — cron trigger (11 AM ET daily)
 * POST /api/admin/goose-model/generate-daily  — manual trigger
 *
 * High-volume sandbox data-collection engine. Philosophy:
 *   More data in → faster signal-weight learning → faster path to production.
 *
 * Rules:
 *   - Sandbox thresholds: hitRate ≥ 55%, edge ≥ 3%, top 10 per sport.
 *   - "Generate more" mode: if fewer than 6 sandbox picks were stored for a
 *     sport today, retry with no threshold floor to capture whatever's available.
 *   - Never skip a sport because of a thin slate — 2–3 picks > 0 picks.
 *   - HARD RULE: -200 odds cap on every pick, every sport, every experiment.
 *   - PGA timing:
 *       • Tuesday/Wednesday of tournament week → run PGA first (priority).
 *       • After Wednesday 10 PM ET → skip PGA (picks already locked).
 *       • Thursday–Sunday → skip PGA.
 *   - PGA outright winner picks: minimum +200 odds (no chalk below this).
 *   - MLB timing:
 *       • Off-season (Nov 1 – Mar 19): MLB picks skipped automatically.
 *       • Regular season (Mar 20 – Oct 31): picks enabled every day.
 *
 * Manual POST body (all optional):
 *   { date?: string; sports?: string[]; sandbox?: boolean; experiment_tag?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks } from "@/lib/goose-model/store";
import {
  SANDBOX_TOP_N,
  SANDBOX_HIT_RATE_FLOOR,
  SANDBOX_EDGE_FLOOR,
  SANDBOX_MIN_PICKS_TARGET,
  SANDBOX_EXPERIMENT_TAG,
} from "@/lib/goose-model/generator";
import { getPGATimingStatus, canGeneratePGAPicksNow } from "@/lib/goose-model/pga-timing";
import { getMLBSeasonTimingStatus, canGenerateMLBPicksNow } from "@/lib/goose-model/mlb-timing";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

const ALL_SPORTS = ["NHL", "NBA", "MLB", "PGA"] as const;

// ── Per-sport generate call ───────────────────────────────────

interface SportResult {
  sport: string;
  success: boolean;
  picks?: number;
  scored_count?: number;
  odds_rejected?: number;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
  generate_more_triggered?: boolean;
  generate_more_picks?: number;
}

async function generateForSport(
  sport: string,
  date: string,
  baseUrl: string,
  opts: {
    sandbox: boolean;
    experimentTag: string | null;
    hitRateFloor?: number;
    edgeFloor?: number;
    topN?: number;
  },
): Promise<SportResult> {
  try {
    const body: Record<string, unknown> = {
      date,
      sport,
      sandbox: opts.sandbox,
      experiment_tag: opts.experimentTag,
      topN: opts.topN ?? (opts.sandbox ? SANDBOX_TOP_N : 5),
    };
    if (opts.hitRateFloor !== undefined) body.hit_rate_floor = opts.hitRateFloor;
    if (opts.edgeFloor !== undefined) body.edge_floor = opts.edgeFloor;

    const res = await fetch(`${baseUrl}/api/admin/goose-model/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goose-model-cron": "1",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sport, success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json() as {
      selected_count?: number;
      scored_count?: number;
      odds_rejected?: number;
      message?: string;
    };

    return {
      sport,
      success: true,
      picks: data.selected_count ?? 0,
      scored_count: data.scored_count ?? 0,
      odds_rejected: data.odds_rejected ?? 0,
    };
  } catch (err) {
    return { sport, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── "Generate more" fallback ──────────────────────────────────
// If fewer than SANDBOX_MIN_PICKS_TARGET picks were stored for a sport today,
// retry with no threshold floor — take whatever the live engine produced.

async function generateMoreIfNeeded(
  sport: string,
  date: string,
  baseUrl: string,
  firstResult: SportResult,
  sandbox: boolean,
  experimentTag: string | null,
): Promise<SportResult> {
  const firstCount = firstResult.picks ?? 0;

  if (firstCount >= SANDBOX_MIN_PICKS_TARGET) return firstResult;
  if (!firstResult.success && firstResult.error) return firstResult; // hard error, don't retry

  // Count already-stored picks to avoid double-counting
  let storedToday = 0;
  try {
    const existing = await listGoosePicks({ date, sport, limit: 50 });
    storedToday = existing.length;
  } catch {
    storedToday = firstCount;
  }

  if (storedToday >= SANDBOX_MIN_PICKS_TARGET) return firstResult;

  // Retry with no hitRate/edge floor — capture whatever is available
  const retry = await generateForSport(sport, date, baseUrl, {
    sandbox,
    experimentTag: experimentTag ? `${experimentTag}-wide-net` : "wide-net",
    hitRateFloor: 0,
    edgeFloor: 0,
    topN: SANDBOX_TOP_N,
  });

  return {
    ...firstResult,
    generate_more_triggered: true,
    generate_more_picks: retry.picks ?? 0,
    picks: (firstResult.picks ?? 0) + (retry.picks ?? 0),
    scored_count: Math.max(firstResult.scored_count ?? 0, retry.scored_count ?? 0),
  };
}

// ── Main orchestrator ─────────────────────────────────────────

async function runDailyGeneration(opts: {
  targetDate?: string;
  sports?: string[];
  sandbox?: boolean;
  experimentTag?: string | null;
}): Promise<{
  date: string;
  sandbox: boolean;
  experiment_tag: string | null;
  sports: SportResult[];
  total_picks: number;
  pga_timing?: ReturnType<typeof getPGATimingStatus>;
  mlb_timing?: ReturnType<typeof getMLBSeasonTimingStatus>;
}> {
  const date = opts.targetDate ?? new Date().toISOString().slice(0, 10);
  const sandbox = opts.sandbox ?? true; // default: sandbox mode for data collection
  const experimentTag = opts.experimentTag ?? (sandbox ? SANDBOX_EXPERIMENT_TAG : null);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Determine which sports to run and their order
  let requestedSports = (opts.sports ?? [...ALL_SPORTS]).map((s) => s.toUpperCase());

  // PGA timing check
  const pgaTiming = getPGATimingStatus();
  const pgaIncluded = requestedSports.includes("PGA");

  if (pgaIncluded) {
    if (!canGeneratePGAPicksNow()) {
      // Past Wednesday 10 PM ET or tournament in progress → skip PGA
      requestedSports = requestedSports.filter((s) => s !== "PGA");
      console.info("[goose-model/generate-daily] PGA skipped:", pgaTiming.reason);
    } else if (pgaTiming.isPriorityDay) {
      // Tuesday or Wednesday: run PGA first
      requestedSports = ["PGA", ...requestedSports.filter((s) => s !== "PGA")];
      console.info("[goose-model/generate-daily] PGA is priority today:", pgaTiming.reason);
    }
  }

  // MLB off-season check
  const mlbTiming = getMLBSeasonTimingStatus();
  const mlbIncluded = requestedSports.includes("MLB");

  if (mlbIncluded && !canGenerateMLBPicksNow()) {
    requestedSports = requestedSports.filter((s) => s !== "MLB");
    console.info("[goose-model/generate-daily] MLB skipped (off-season):", mlbTiming.reason);
  }

  // Run sports sequentially to avoid thundering-herd on pick APIs
  const results: SportResult[] = [];

  for (const sport of requestedSports) {
    // For PGA, skip if past cutoff (belt-and-suspenders)
    if (sport === "PGA" && !canGeneratePGAPicksNow()) {
      results.push({
        sport,
        success: true,
        skipped: true,
        skip_reason: pgaTiming.reason,
      });
      console.info("[goose-model/generate-daily] PGA pick generation skipped (past cutoff)");
      continue;
    }

    const firstResult = await generateForSport(sport, date, baseUrl, {
      sandbox,
      experimentTag,
    });

    // "Generate more" mode: retry with wider net if below target
    const finalResult = await generateMoreIfNeeded(
      sport,
      date,
      baseUrl,
      firstResult,
      sandbox,
      experimentTag,
    );

    results.push(finalResult);
    console.info("[goose-model/generate-daily]", finalResult);
  }

  // Report skipped PGA if it was excluded
  if (pgaIncluded && !requestedSports.includes("PGA")) {
    results.push({
      sport: "PGA",
      success: true,
      skipped: true,
      skip_reason: pgaTiming.reason,
    });
  }

  // Report skipped MLB if it was excluded (off-season)
  if (mlbIncluded && !requestedSports.includes("MLB")) {
    results.push({
      sport: "MLB",
      success: true,
      skipped: true,
      skip_reason: mlbTiming.reason,
    });
  }

  return {
    date,
    sandbox,
    experiment_tag: experimentTag,
    sports: results,
    total_picks: results.reduce((sum, r) => sum + (r.picks ?? 0), 0),
    pga_timing: pgaTiming,
    mlb_timing: mlbTiming,
  };
}

// ── Route handlers ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyGeneration({ sandbox: true });
    console.info("[goose-model/generate-daily] cron completed", {
      date: result.date,
      total_picks: result.total_picks,
      pga_timing: result.pga_timing?.reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/generate-daily] cron failed", error);
    return NextResponse.json({ error: "Daily generation failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      date?: string;
      sports?: string[];
      sandbox?: boolean;
      experiment_tag?: string | null;
    };

    const result = await runDailyGeneration({
      targetDate: body.date,
      sports: body.sports,
      sandbox: body.sandbox ?? true,
      experimentTag: body.experiment_tag,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/generate-daily] manual run failed", error);
    return NextResponse.json({ error: "Daily generation failed" }, { status: 500 });
  }
}
