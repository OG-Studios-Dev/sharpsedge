/**
 * GET /api/admin/goose-model/analytics
 *
 * Signal-weight learning analytics. Buckets all graded picks by:
 *   - edge % at capture (3–5, 5–7, 7–10, 10+)
 *   - hitRate % at capture (55–60, 60–65, 65–70, 70+)
 *   - signals_count (1, 2, 3+)
 *   - sport
 *   - signal name (mirrors signal leaderboard)
 *   - experiment_tag (cohort comparison)
 *   - PGA-specific: outright winner vs placement picks
 *
 * Only returns buckets with ≥ MIN_SAMPLE graded picks (default 10).
 * Returns a data-driven recommendation: optimal edge threshold based
 * on what's actually producing wins.
 *
 * Optional query params:
 *   ?sport=NHL|NBA|MLB|PGA|ALL
 *   ?experiment_tag=baseline-v1
 *   ?min_sample=10
 *   ?pga_pick_type=winner|placement|all   (PGA only)
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks } from "@/lib/goose-model/store";
import type { GooseModelPick, GooseAnalyticsBucket, GooseAnalyticsResult } from "@/lib/goose-model/types";

export const dynamic = "force-dynamic";

const DEFAULT_MIN_SAMPLE = 10;

// ── Bucket helpers ─────────────────────────────────────────────

function edgeBucket(edge: number | null): string | null {
  if (edge === null || edge === undefined) return null;
  if (edge < 3)   return null;          // below sandbox floor — skip
  if (edge < 5)   return "3–5%";
  if (edge < 7)   return "5–7%";
  if (edge < 10)  return "7–10%";
  return "10%+";
}

const EDGE_BUCKET_ORDER = ["3–5%", "5–7%", "7–10%", "10%+"];

function hitRateBucket(hr: number | null): string | null {
  if (hr === null || hr === undefined) return null;
  if (hr < 55) return null;
  if (hr < 60) return "55–60%";
  if (hr < 65) return "60–65%";
  if (hr < 70) return "65–70%";
  return "70%+";
}

const HR_BUCKET_ORDER = ["55–60%", "60–65%", "65–70%", "70%+"];

function signalsCountBucket(count: number | null): string | null {
  if (count === null || count === undefined || count < 1) return null;
  if (count === 1) return "1 signal";
  if (count === 2) return "2 signals";
  return "3+ signals";
}

const SIGNALS_COUNT_ORDER = ["1 signal", "2 signals", "3+ signals"];

// ── Aggregator ─────────────────────────────────────────────────

type BucketMap = Map<string, { wins: number; losses: number; pushes: number; count: number }>;

function addToBucket(map: BucketMap, key: string, result: string) {
  const existing = map.get(key) ?? { wins: 0, losses: 0, pushes: 0, count: 0 };
  existing.count++;
  if (result === "win")  existing.wins++;
  if (result === "loss") existing.losses++;
  if (result === "push") existing.pushes++;
  map.set(key, existing);
}

function bucketMapToArray(
  map: BucketMap,
  minSample: number,
  order?: string[],
): GooseAnalyticsBucket[] {
  const entries = Array.from(map.entries())
    .filter(([, v]) => v.count >= minSample)
    .map(([label, v]): GooseAnalyticsBucket => ({
      label,
      count: v.count,
      wins: v.wins,
      losses: v.losses,
      pushes: v.pushes,
      win_rate: v.wins + v.losses > 0 ? v.wins / (v.wins + v.losses) : 0,
    }));

  if (order) {
    const idx = Object.fromEntries(order.map((k, i) => [k, i]));
    entries.sort((a, b) => (idx[a.label] ?? 999) - (idx[b.label] ?? 999));
  } else {
    entries.sort((a, b) => b.win_rate - a.win_rate);
  }

  return entries;
}

// ── Recommendation engine ──────────────────────────────────────

function buildRecommendation(
  totalGraded: number,
  byEdge: GooseAnalyticsBucket[],
  bySport: GooseAnalyticsBucket[],
): string {
  if (totalGraded < DEFAULT_MIN_SAMPLE) {
    return `Not enough graded picks yet (${totalGraded} of ${DEFAULT_MIN_SAMPLE} minimum). Keep collecting data.`;
  }

  // Find the edge bucket with best win rate (min sample enforced upstream)
  const bestEdge = byEdge.sort((a, b) => b.win_rate - a.win_rate)[0];
  const bestSport = bySport.sort((a, b) => b.win_rate - a.win_rate)[0];

  const parts: string[] = [];
  parts.push(`Based on ${totalGraded} graded picks:`);

  if (bestEdge) {
    const pct = (bestEdge.win_rate * 100).toFixed(1);
    parts.push(`optimal edge threshold appears to be ${bestEdge.label} (${pct}% win rate, n=${bestEdge.count}).`);
  }

  if (bestSport && bestSport.win_rate > 0) {
    const pct = (bestSport.win_rate * 100).toFixed(1);
    parts.push(`Best-performing sport: ${bestSport.label} at ${pct}% (n=${bestSport.count}).`);
  }

  const overallWins = bySport.reduce((s, b) => s + b.wins, 0);
  const overallSettled = bySport.reduce((s, b) => s + b.wins + b.losses, 0);
  if (overallSettled > 0) {
    const overallWR = ((overallWins / overallSettled) * 100).toFixed(1);
    parts.push(`Overall win rate: ${overallWR}% across all sports.`);
  }

  return parts.join(" ");
}

// ── Route handler ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sportFilter    = (searchParams.get("sport") ?? "ALL").toUpperCase();
    const tagFilter      = searchParams.get("experiment_tag") ?? undefined;
    const minSample      = Math.max(1, parseInt(searchParams.get("min_sample") ?? String(DEFAULT_MIN_SAMPLE), 10));
    const pgaPickType    = searchParams.get("pga_pick_type") ?? "all"; // winner | placement | all

    // Fetch all graded picks (result != pending)
    const allPicks = await listGoosePicks({
      sport: sportFilter !== "ALL" ? sportFilter : undefined,
      limit: 5000,
    });

    // Filter to graded only
    let graded = allPicks.filter((p) => p.result === "win" || p.result === "loss" || p.result === "push");

    // Apply experiment_tag filter
    if (tagFilter) {
      graded = graded.filter((p) => p.experiment_tag === tagFilter);
    }

    // PGA pick type filter
    if (pgaPickType !== "all") {
      graded = graded.filter((p) => {
        if (p.sport !== "PGA") return true;
        const isWinner = p.pick_label?.toLowerCase().includes("to win") ||
          (p.pick_snapshot as any)?.propType === "Tournament Winner";
        return pgaPickType === "winner" ? isWinner : !isWinner;
      });
    }

    // ── Build buckets ───────────────────────────────────────────
    const edgeMap:   BucketMap = new Map();
    const hrMap:     BucketMap = new Map();
    const sigMap:    BucketMap = new Map();
    const sportMap:  BucketMap = new Map();
    const signalMap: BucketMap = new Map();

    for (const pick of graded) {
      const eb = edgeBucket(pick.edge_at_capture);
      const hb = hitRateBucket(pick.hit_rate_at_capture ?? pick.hit_rate_at_time);
      const sb = signalsCountBucket(pick.signals_count ?? pick.signals_present?.length ?? null);

      if (eb) addToBucket(edgeMap, eb, pick.result);
      if (hb) addToBucket(hrMap, hb, pick.result);
      if (sb) addToBucket(sigMap, sb, pick.result);

      addToBucket(sportMap, pick.sport, pick.result);

      for (const signal of pick.signals_present ?? []) {
        if (signal) addToBucket(signalMap, signal, pick.result);
      }
    }

    const byEdge       = bucketMapToArray(edgeMap,   minSample, EDGE_BUCKET_ORDER);
    const byHitRate    = bucketMapToArray(hrMap,      minSample, HR_BUCKET_ORDER);
    const bySignalsCt  = bucketMapToArray(sigMap,     minSample, SIGNALS_COUNT_ORDER);
    const bySport      = bucketMapToArray(sportMap,   minSample);
    const bySignal     = bucketMapToArray(signalMap,  minSample);

    const recommendation = buildRecommendation(graded.length, [...byEdge], [...bySport]);

    // Cohort breakdown (win rate per experiment_tag, no min sample)
    const cohortMap: BucketMap = new Map();
    for (const pick of graded) {
      const tag = pick.experiment_tag ?? "untagged";
      addToBucket(cohortMap, tag, pick.result);
    }
    const byCohort = bucketMapToArray(cohortMap, 1); // no min sample for cohorts

    const result: GooseAnalyticsResult & { by_cohort: GooseAnalyticsBucket[] } = {
      total_graded: graded.length,
      by_edge_bucket: byEdge,
      by_hit_rate_bucket: byHitRate,
      by_signals_count: bySignalsCt,
      by_sport: bySport,
      by_signal: bySignal,
      by_cohort: byCohort,
      recommendation,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/analytics] failed", error);
    return NextResponse.json({ error: "Analytics request failed" }, { status: 500 });
  }
}
