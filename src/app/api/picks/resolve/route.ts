/**
 * POST /api/picks/resolve
 * Takes an array of pending AIPick objects.
 * For each one, checks the correct league API for completed game results.
 * Returns the picks with result updated to "win", "loss", or "push" where resolvable.
 *
 * After picks are persisted, this route fires-and-forgets an auto-grade pass
 * for any matching goose_model_picks so the Goose AI model stays up to date
 * without any manual button clicks.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolvePick } from "@/lib/pick-resolver";
import { updatePickResultsInSupabase } from "@/lib/pick-history-store";
import { findPendingGoosePicks, gradeGoosePick, updateSignalWeightsForPick } from "@/lib/goose-model/store";
import { findBestFuzzyNameMatch } from "@/lib/name-match";
import type { AIPick } from "@/lib/types";
import type { GooseModelPick } from "@/lib/goose-model/types";

// ── persist helpers ──────────────────────────────────────────

async function persistResolvedPickResults(previous: AIPick[], resolved: AIPick[]) {
  const updates = resolved.filter((pick, index) => {
    const before = previous[index];
    return Boolean(
      before
      && pick.id === before.id
      && before.result === "pending"
      && pick.result !== "pending",
    );
  });

  if (!updates.length) return;

  try {
    await updatePickResultsInSupabase(updates);
  } catch (error) {
    console.warn("[picks-resolve] failed to persist resolved results", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── goose auto-grade hook ────────────────────────────────────

/**
 * Fuzzy-match a goose pick against a resolved AIPick.
 * Matches on player_name (player picks) or team (team picks).
 */
function goosePickMatchesAIPick(goose: GooseModelPick, ai: AIPick): boolean {
  if (goose.pick_type === "player") {
    if (!goose.player_name || !ai.playerName) return false;
    // Simple case-insensitive includes check — good enough for same-day same-game matching
    const gName = goose.player_name.toLowerCase();
    const aName = ai.playerName.toLowerCase();
    return gName === aName || gName.includes(aName) || aName.includes(gName);
  }
  // team pick
  if (!goose.team || !ai.team) return false;
  return goose.team.toUpperCase() === (ai.team || "").toUpperCase();
}

/**
 * After the main resolve pipeline settles picks, find matching goose_model_picks
 * and grade them automatically. Fire-and-forget — never blocks the main response.
 */
async function autoGradeMatchingGoosePicks(
  previous: AIPick[],
  resolved: AIPick[],
): Promise<void> {
  // Only care about picks that just flipped from pending → win/loss/push
  const newlySettled = resolved.filter((pick, i) => {
    const before = previous[i];
    return before?.result === "pending" && pick.result !== "pending";
  });

  if (!newlySettled.length) return;

  for (const aiPick of newlySettled) {
    try {
      const sport = (aiPick.league || "NHL").toUpperCase();
      const goosePicks = await findPendingGoosePicks({
        date: aiPick.date,
        sport,
        game_id: aiPick.gameId,
      });

      const matched = goosePicks.filter((gp) => goosePickMatchesAIPick(gp, aiPick));
      if (!matched.length) continue;

      for (const gp of matched) {
        const result = aiPick.result as "win" | "loss" | "push";

        // Grade the pick (handles regrade internally)
        await gradeGoosePick(gp.id, { result, integrity_status: "ok" });

        // Update signal weights
        if (gp.signals_present.length > 0) {
          await updateSignalWeightsForPick(gp.signals_present, gp.sport, result);
        }

        console.info("[picks-resolve] auto-graded goose pick", {
          gooseId: gp.id,
          aiPickId: aiPick.id,
          sport,
          result,
          player: gp.player_name ?? gp.team,
        });
      }
    } catch (err) {
      console.warn("[picks-resolve] auto-grade hook error", {
        aiPickId: aiPick.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── route handler ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let picks: AIPick[] = [];

  try {
    const body = await req.json() as { picks?: AIPick[] };
    picks = Array.isArray(body?.picks) ? body.picks : [];
    if (!picks.length) return NextResponse.json({ picks: [] });
    if (!picks.some((pick) => pick.result === "pending")) return NextResponse.json({ picks });

    const resolved = await Promise.all(picks.map(resolvePick));
    await persistResolvedPickResults(picks, resolved);

    // Fire-and-forget: grade matching goose picks (non-blocking)
    autoGradeMatchingGoosePicks(picks, resolved).catch((err) => {
      console.warn("[picks-resolve] autoGradeMatchingGoosePicks unhandled error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return NextResponse.json({ picks: resolved });
  } catch (error) {
    console.warn("[picks-resolve] request failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ picks });
  }
}
