/**
 * GET  /api/admin/sandbox/auto-grade
 * POST /api/admin/sandbox/auto-grade   (body: { date?: "YYYY-MM-DD" })
 *
 * Cron-safe endpoint — safe to call multiple times (idempotent per pick).
 * Fetches all sandbox picks with outcome=pending and date < today, attempts
 * to resolve each one via the sport pick-resolver, sets outcome, and
 * propagates signal weight updates to the goose learning layer.
 *
 * Auth:
 *   GET  — Vercel cron (Authorization: Bearer <CRON_SECRET>) or admin session
 *   POST — admin session only (manual trigger)
 *
 * Response:
 * {
 *   date_cutoff: string;     // ISO date used as upper bound
 *   attempted: number;       // total picks fetched
 *   resolved: number;        // outcome set to win/loss/push
 *   propagated: number;      // goose weight updates applied
 *   still_pending: number;   // game not yet final
 *   errors: string[];
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import {
  fetchPendingSandboxPicks,
  setSandboxPickOutcome,
  applyOutcomeToGooseWeights,
} from "@/lib/sandbox/store";
import { resolvePick, normalizeIncomingPick } from "@/lib/pick-resolver";
import type { AIPick } from "@/lib/types";
import type { SandboxPickRecord } from "@/lib/sandbox/types";

export const dynamic = "force-dynamic";
// Give cron runs enough time for a full backlog sweep
export const maxDuration = 150;

// ── adapter: SandboxPickRecord → AIPick ────────────────────────────────────

/**
 * Convert a SandboxPickRecord into an AIPick so we can feed it through
 * the same sport resolvers without duplicating any resolver logic.
 */
function sandboxPickToAIPick(sp: SandboxPickRecord): AIPick {
  const base: AIPick = {
    id: sp.id,
    date: sp.date,
    type: sp.pick_type,
    playerName: sp.player_name ?? undefined,
    team: sp.team ?? "",
    teamColor: "#4a9eff",
    opponent: sp.opponent ?? "",
    isAway: false,
    pickLabel: sp.pick_label,
    edge: sp.edge ?? 0,
    hitRate: sp.hit_rate ?? 0,
    confidence: sp.confidence ?? 0,
    reasoning: sp.reasoning ?? "",
    result: "pending",
    units: 1,
    gameId: sp.game_id ?? undefined,
    odds: sp.odds ?? 0,
    book: sp.book ?? undefined,
    league: sp.league,
  };
  // Let normalizeIncomingPick parse line / direction / propType from pick_label
  return normalizeIncomingPick(base);
}

// ── resolve + grade one sandbox pick ──────────────────────────────────────

type GradeOutcome = {
  id: string;
  status: "resolved" | "still_pending" | "error";
  outcome?: "win" | "loss" | "push";
  propagated?: boolean;
  error?: string;
};

async function gradeOneSandboxPick(sp: SandboxPickRecord): Promise<GradeOutcome> {
  try {
    const aiPick = sandboxPickToAIPick(sp);
    const resolved = await resolvePick(aiPick);

    if (resolved.result === "pending") {
      // Game not final yet — leave as-is, retry on next cron run
      return { id: sp.id, status: "still_pending" };
    }

    // Map resolver result to SandboxOutcome
    const outcome = resolved.result as "win" | "loss" | "push";

    // Persist outcome to sandbox_pick_history
    const updatedPick = await setSandboxPickOutcome(
      sp.id,
      outcome,
      `auto-graded ${new Date().toISOString().slice(0, 10)}`,
    );

    let propagated = false;
    if (updatedPick) {
      try {
        await applyOutcomeToGooseWeights(updatedPick);
        propagated = true;
      } catch (err) {
        console.warn("[sandbox/auto-grade] goose propagation failed for", sp.id, err);
      }
    }

    return { id: sp.id, status: "resolved", outcome, propagated };
  } catch (err) {
    return {
      id: sp.id,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── core run logic ────────────────────────────────────────────────────────

async function runSandboxAutoGrade(beforeDate?: string): Promise<{
  date_cutoff: string;
  attempted: number;
  resolved: number;
  propagated: number;
  still_pending: number;
  errors: string[];
}> {
  const dateCutoff = beforeDate ?? new Date().toISOString().slice(0, 10);
  const pending = await fetchPendingSandboxPicks(dateCutoff);

  if (!pending.length) {
    return {
      date_cutoff: dateCutoff,
      attempted: 0,
      resolved: 0,
      propagated: 0,
      still_pending: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  let resolved = 0;
  let propagated = 0;
  let still_pending = 0;

  // Process sequentially to avoid overwhelming upstream APIs
  for (const pick of pending) {
    const result = await gradeOneSandboxPick(pick);

    if (result.status === "resolved") {
      resolved++;
      if (result.propagated) propagated++;
    } else if (result.status === "still_pending") {
      still_pending++;
    } else if (result.status === "error") {
      errors.push(`pick ${result.id}: ${result.error ?? "unknown error"}`);
    }
  }

  console.info("[sandbox/auto-grade] run complete", {
    date_cutoff: dateCutoff,
    attempted: pending.length,
    resolved,
    propagated,
    still_pending,
    errors: errors.length,
  });

  return {
    date_cutoff: dateCutoff,
    attempted: pending.length,
    resolved,
    propagated,
    still_pending,
    errors,
  };
}

// ── route handlers ─────────────────────────────────────────────────────────

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false; // dev — no cron secret configured
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/** GET — Vercel cron trigger. Also accepts an admin session for manual use. */
export async function GET(req: NextRequest) {
  const viewer = await getCurrentViewer().catch(() => null);
  const isAdmin = viewer?.profile?.role === "admin";

  if (!isCronAuthorized(req) && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await runSandboxAutoGrade();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sandbox/auto-grade] GET failed", error);
    return NextResponse.json({ error: "Auto-grade failed" }, { status: 500 });
  }
}

/** POST — Admin manual trigger with optional date override. */
export async function POST(req: NextRequest) {
  const viewer = await getCurrentViewer().catch(() => null);
  if (!viewer || viewer.profile?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: { date?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine
  }

  try {
    const result = await runSandboxAutoGrade(body.date);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[sandbox/auto-grade] POST failed", error);
    return NextResponse.json({ error: "Auto-grade failed" }, { status: 500 });
  }
}
