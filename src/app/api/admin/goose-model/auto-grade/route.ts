/**
 * GET /api/admin/goose-model/auto-grade
 *
 * Daily cron endpoint (runs ~2am ET via Vercel cron).
 * Fetches all goose_model_picks from yesterday where result = 'pending'
 * and integrity_status IS NULL, then attempts to resolve each one using
 * the same sport resolvers as the main pick pipeline.
 *
 * Edge-case handling:
 *   - No game found after attempts → integrity_status = 'unresolvable'
 *   - Still pending (game not final) → left as pending, retried tomorrow
 *   - push result → result = 'push', units = 0, signal weights unchanged
 *   - void (DNP/player out) → integrity_status = 'void' (set manually or via future detection)
 *
 * Can also be triggered manually via POST for any date:
 *   POST { date: "2026-03-24" }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchUngradedYesterdayPicks,
  listGoosePicks,
  gradeGoosePick,
  setGoosePickIntegrity,
  updateSignalWeightsForPick,
} from "@/lib/goose-model/store";
import {
  resolvePick,
  normalizeIncomingPick,
} from "@/lib/pick-resolver";
import type { AIPick } from "@/lib/types";
import type { GooseModelPick } from "@/lib/goose-model/types";

export const dynamic = "force-dynamic";
// Give cron runs plenty of time (150s max on Vercel Pro)
export const maxDuration = 150;

// ── Signal outcome evidence accumulator ──────────────────────

/**
 * Tracks per-signal win/loss outcomes for this grading run.
 * Used to build signal-level evidence report in the response.
 * This surfaces which specific signals correlated with wins vs losses
 * in this batch — useful for validating prior calibration.
 */
class SignalOutcomeTracker {
  private map = new Map<string, { wins: number; losses: number; pushes: number }>();

  record(signals: string[], result: "win" | "loss" | "push") {
    for (const sig of signals) {
      const existing = this.map.get(sig) ?? { wins: 0, losses: 0, pushes: 0 };
      if (result === "win") existing.wins++;
      if (result === "loss") existing.losses++;
      if (result === "push") existing.pushes++;
      this.map.set(sig, existing);
    }
  }

  toArray(): Array<{
    signal: string;
    appearances: number;
    wins: number;
    losses: number;
    pushes: number;
    win_rate: number;
  }> {
    return Array.from(this.map.entries())
      .map(([signal, { wins, losses, pushes }]) => {
        const settled = wins + losses;
        return {
          signal,
          appearances: wins + losses + pushes,
          wins,
          losses,
          pushes,
          win_rate: settled > 0 ? Math.round((wins / settled) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.appearances - a.appearances);
  }
}

// ── adapter: GooseModelPick → AIPick ────────────────────────

/**
 * Convert a GooseModelPick into an AIPick so we can feed it through
 * the existing sport resolvers without duplicating any resolver logic.
 */
function goosePickToAIPick(gp: GooseModelPick): AIPick {
  const base: AIPick = {
    id: gp.id,
    date: gp.date,
    type: gp.pick_type,
    playerName: gp.player_name ?? undefined,
    team: gp.team ?? "",
    teamColor: "#4a9eff",
    opponent: gp.opponent ?? "",
    isAway: false,
    pickLabel: gp.pick_label,
    edge: 0,
    hitRate: gp.hit_rate_at_time ?? 0,
    confidence: gp.confidence ?? 0,
    reasoning: gp.reasoning ?? "",
    result: "pending",
    units: 1,
    gameId: gp.game_id ?? undefined,
    odds: gp.odds ?? 0,
    book: gp.book ?? undefined,
    league: gp.sport,
  };
  // Let normalizeIncomingPick parse line / direction / propType from pick_label
  return normalizeIncomingPick(base);
}

// ── grade one pick ───────────────────────────────────────────

async function gradeOnePick(gp: GooseModelPick): Promise<{
  id: string;
  status: "graded" | "pending" | "unresolvable" | "error";
  result?: string;
  error?: string;
}> {
  try {
    const aiPick = goosePickToAIPick(gp);
    const resolved = await resolvePick(aiPick);

    if (resolved.result === "pending") {
      // Resolver returned pending — game not final yet. Leave as-is.
      // After a configurable number of missed days we could mark 'unresolvable',
      // but for now we only do that when explicitly flagged.
      return { id: gp.id, status: "pending" };
    }

    const result = resolved.result as "win" | "loss" | "push";

    // Grade the pick (handles regrading internally)
    await gradeGoosePick(gp.id, { result, integrity_status: "ok" });

    // Update signal weights (pushes are skipped inside updateSignalWeightsForPick)
    if (gp.signals_present.length > 0) {
      await updateSignalWeightsForPick(gp.signals_present, gp.sport, result);
    }

    return { id: gp.id, status: "graded", result };
  } catch (err) {
    return {
      id: gp.id,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── mark stale picks as unresolvable ────────────────────────

/**
 * Picks from >2 days ago that are still pending get permanently flagged
 * as unresolvable so they never pollute future grading runs.
 */
async function markStalePicksUnresolvable(date: string): Promise<number> {
  try {
    const picks = await listGoosePicks({ date, result: "pending", limit: 200 });
    // Filter to those with no integrity_status set
    const stale = picks.filter((p) => p.integrity_status === null);
    await Promise.allSettled(
      stale.map((p) => setGoosePickIntegrity(p.id, "unresolvable")),
    );
    return stale.length;
  } catch {
    return 0;
  }
}

// ── cron / manual handler ────────────────────────────────────

async function runAutoGrade(targetDate?: string): Promise<{
  date: string;
  total: number;
  graded: number;
  pending: number;
  errors: number;
  details: Array<{ id: string; status: string; result?: string; error?: string }>;
  /** Per-signal outcome evidence for this grading run */
  signal_outcome_evidence: ReturnType<SignalOutcomeTracker["toArray"]>;
  /** Summary note for review */
  grading_summary: string;
}> {
  let picks: GooseModelPick[];

  if (targetDate) {
    // Manual mode: fetch pending picks for specified date
    const all = await listGoosePicks({ date: targetDate, result: "pending", limit: 200 });
    picks = all.filter((p) => p.integrity_status === null);
  } else {
    // Cron mode: yesterday's ungraded picks
    picks = await fetchUngradedYesterdayPicks();
  }

  const date = targetDate ?? (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const signalTracker = new SignalOutcomeTracker();

  if (!picks.length) {
    return {
      date,
      total: 0,
      graded: 0,
      pending: 0,
      errors: 0,
      details: [],
      signal_outcome_evidence: [],
      grading_summary: "No pending picks found for this date.",
    };
  }

  // Process sequentially to avoid overwhelming upstream APIs
  const details: Array<{ id: string; status: string; result?: string; error?: string }> = [];
  for (const pick of picks) {
    const outcome = await gradeOnePick(pick);
    details.push(outcome);

    // Accumulate signal outcome evidence for picks that resolved
    if (outcome.status === "graded" && outcome.result && outcome.result !== "push") {
      const result = outcome.result as "win" | "loss" | "push";
      if (pick.signals_present.length > 0) {
        signalTracker.record(pick.signals_present, result);
      }
    }
  }

  // Mark anything from 3+ days ago that is still pending as unresolvable
  const twoDaysAgo = new Date();
  twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 3);
  const staleDate = twoDaysAgo.toISOString().slice(0, 10);
  if (!targetDate || targetDate <= staleDate) {
    await markStalePicksUnresolvable(staleDate);
  }

  const gradedCount = details.filter((d) => d.status === "graded").length;
  const winCount = details.filter((d) => d.result === "win").length;
  const lossCount = details.filter((d) => d.result === "loss").length;
  const signalEvidence = signalTracker.toArray();

  const gradingSummary = [
    `Graded ${gradedCount}/${picks.length} picks (${winCount}W / ${lossCount}L).`,
    signalEvidence.length > 0
      ? `Top signal this run: ${signalEvidence[0]?.signal} (${signalEvidence[0]?.win_rate}% WR in ${signalEvidence[0]?.appearances} picks).`
      : "No signal evidence accumulated (insufficient settled picks).",
    "Signal weights updated in DB. Run /api/admin/goose-model/analytics for cumulative scorecard.",
  ].join(" ");

  return {
    date,
    total: picks.length,
    graded: gradedCount,
    pending: details.filter((d) => d.status === "pending").length,
    errors: details.filter((d) => d.status === "error").length,
    details,
    signal_outcome_evidence: signalEvidence,
    grading_summary: gradingSummary,
  };
}

// ── route handlers ───────────────────────────────────────────

/** GET — Vercel cron trigger (no body) */
export async function GET(req: NextRequest) {
  // Vercel cron passes Authorization: Bearer <CRON_SECRET>
  // We check it but don't block on missing cron secret in dev.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoGrade();
    console.info("[goose-model/auto-grade] cron completed", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/auto-grade] cron failed", error);
    return NextResponse.json({ error: "Auto-grade failed" }, { status: 500 });
  }
}

/** POST — manual trigger with optional date override */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { date?: string };
    const result = await runAutoGrade(body.date);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/auto-grade] manual run failed", error);
    return NextResponse.json({ error: "Auto-grade failed" }, { status: 500 });
  }
}
