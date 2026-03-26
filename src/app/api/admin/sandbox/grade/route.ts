/**
 * POST /api/admin/sandbox/grade
 *
 * Grade one or more sandbox picks with an outcome (win / loss / push / void).
 * After recording the outcome, propagates signals to goose_signal_weights
 * so the goose-model learning layer picks up on sandbox results.
 *
 * Body:
 * {
 *   picks: Array<{
 *     id: string;         // sandbox pick id (sandbox_pick_history.id)
 *     outcome: "win" | "loss" | "push" | "void";
 *     outcome_notes?: string;
 *   }>;
 *   propagate_to_goose?: boolean;  // default true — set false to skip learning
 * }
 *
 * Returns:
 * {
 *   graded: number;     // picks successfully graded
 *   propagated: number; // signal-weight updates applied to goose model
 *   errors: string[];
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import {
  getSandboxPickById,
  setSandboxPickOutcome,
  applyOutcomeToGooseWeights,
} from "@/lib/sandbox/store";
import type { SandboxOutcome } from "@/lib/sandbox/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function isValidOutcome(v: string): v is SandboxOutcome {
  return ["win", "loss", "push", "void", "pending"].includes(v);
}

export async function POST(request: NextRequest) {
  const viewer = await getCurrentViewer();
  if (!viewer || viewer.profile?.role !== "admin") return unauthorized();

  let body: {
    picks?: Array<{ id: string; outcome: string; outcome_notes?: string }>;
    propagate_to_goose?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entries = Array.isArray(body?.picks) ? body.picks : [];
  if (!entries.length) {
    return NextResponse.json({ error: "picks array is required and must not be empty" }, { status: 400 });
  }

  const propagateToGoose = body?.propagate_to_goose !== false; // default true

  const errors: string[] = [];
  let graded = 0;
  let propagated = 0;

  for (const entry of entries) {
    const { id, outcome, outcome_notes } = entry;

    if (!id || typeof id !== "string") {
      errors.push(`Entry missing valid id: ${JSON.stringify(entry)}`);
      continue;
    }

    const normalizedOutcome = (typeof outcome === "string" ? outcome.trim().toLowerCase() : "") as SandboxOutcome;
    if (!isValidOutcome(normalizedOutcome)) {
      errors.push(`Pick ${id}: invalid outcome "${outcome}" — must be win | loss | push | void | pending`);
      continue;
    }

    try {
      // Persist outcome to sandbox_pick_history
      const updatedPick = await setSandboxPickOutcome(id, normalizedOutcome, outcome_notes ?? null);
      graded++;

      // Propagate to goose_signal_weights for learning
      if (propagateToGoose && updatedPick && normalizedOutcome !== "pending") {
        try {
          await applyOutcomeToGooseWeights(updatedPick);
          propagated++;
        } catch (err) {
          // Non-fatal — log but don't fail the grading
          errors.push(`Pick ${id}: graded ok but goose weight propagation failed — ${String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Pick ${id}: grading failed — ${String(err)}`);
    }
  }

  return NextResponse.json({
    graded,
    propagated,
    errors,
    propagate_to_goose: propagateToGoose,
  });
}
