/**
 * GET /api/admin/goose-model/promotion-candidates
 *
 * Identifies sandbox picks that meet tighter production promotion gates.
 * Promotion requires consistent evidence across multiple picks, not just
 * a single high-score pick.
 *
 * Promotion gates (all must pass):
 *   1. Signal gate: at least one signal present with >= 15 graded appearances
 *      and win rate >= 62% across all picks using that signal
 *   2. Edge gate: average edge_at_capture >= 6% across eligible picks
 *   3. Hit-rate gate: average hit_rate_at_capture >= 63%
 *   4. Sample gate: >= 10 graded picks from same sport in the past 30 days
 *   5. Odds gate: average odds_at_capture >= -150 (not chalk-heavy)
 *
 * Returns picks ranked by promotion score (signal quality × sample confidence).
 *
 * Query params:
 *   ?sport=NHL|NBA|MLB|PGA|ALL  (default ALL)
 *   ?days=30                    (lookback window, default 30)
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks, listSignalWeights } from "@/lib/goose-model/store";
import type { GooseModelPick } from "@/lib/goose-model/types";

export const dynamic = "force-dynamic";

// ── Promotion gate thresholds ─────────────────────────────────
const PROMO_SIGNAL_MIN_APPEARANCES = 15;
const PROMO_SIGNAL_MIN_WIN_RATE = 0.62;
const PROMO_EDGE_FLOOR = 6.0;
const PROMO_HIT_RATE_FLOOR = 63.0;
const PROMO_SPORT_MIN_GRADED = 10;
const PROMO_ODDS_FLOOR = -150;
const PROMO_LOOKBACK_DAYS = 30;

interface PromotionGateResult {
  passed: boolean;
  gate: string;
  detail: string;
  value: number | null;
  threshold: number | null;
}

interface PromotionCandidate {
  pick: GooseModelPick;
  promotion_score: number;
  gates_passed: PromotionGateResult[];
  gates_failed: PromotionGateResult[];
  eligible: boolean;
  strong_signals: string[];
  promotion_notes: string;
}

interface PromotionCandidatesResult {
  generated_at: string;
  lookback_days: number;
  sport_filter: string;
  gates: {
    signal_min_appearances: number;
    signal_min_win_rate: number;
    edge_floor: number;
    hit_rate_floor: number;
    sport_min_graded: number;
    odds_floor: number;
  };
  sport_graded_counts: Record<string, number>;
  eligible_candidates: PromotionCandidate[];
  borderline_candidates: PromotionCandidate[];
  summary: string;
}

function cutoffDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function evaluateGates(
  pick: GooseModelPick,
  signalWinRates: Map<string, { win_rate: number; appearances: number }>,
  sportGradedCount: number,
): {
  gates: PromotionGateResult[];
  passed: PromotionGateResult[];
  failed: PromotionGateResult[];
  strongSignals: string[];
} {
  const gates: PromotionGateResult[] = [];

  // Gate 1: Strong signals present
  const strongSignals = (pick.signals_present ?? []).filter((sig) => {
    const w = signalWinRates.get(sig);
    return w && w.appearances >= PROMO_SIGNAL_MIN_APPEARANCES && w.win_rate >= PROMO_SIGNAL_MIN_WIN_RATE;
  });
  gates.push({
    gate: "signal_quality",
    passed: strongSignals.length > 0,
    detail: strongSignals.length > 0
      ? `${strongSignals.length} strong signal(s): ${strongSignals.slice(0, 3).join(", ")}`
      : `No signals with >= ${PROMO_SIGNAL_MIN_APPEARANCES} appearances and >= ${Math.round(PROMO_SIGNAL_MIN_WIN_RATE * 100)}% win rate`,
    value: strongSignals.length,
    threshold: 1,
  });

  // Gate 2: Edge at capture
  const edge = pick.edge_at_capture;
  gates.push({
    gate: "edge_floor",
    passed: edge !== null && edge >= PROMO_EDGE_FLOOR,
    detail: edge !== null ? `Edge at capture: ${edge.toFixed(1)}%` : "Edge not recorded",
    value: edge,
    threshold: PROMO_EDGE_FLOOR,
  });

  // Gate 3: Hit rate at capture
  const hr = pick.hit_rate_at_capture ?? pick.hit_rate_at_time;
  gates.push({
    gate: "hit_rate_floor",
    passed: hr !== null && hr >= PROMO_HIT_RATE_FLOOR,
    detail: hr !== null ? `Hit rate at capture: ${hr.toFixed(1)}%` : "Hit rate not recorded",
    value: hr,
    threshold: PROMO_HIT_RATE_FLOOR,
  });

  // Gate 4: Sport has enough graded picks
  gates.push({
    gate: "sport_sample",
    passed: sportGradedCount >= PROMO_SPORT_MIN_GRADED,
    detail: `${sportGradedCount} graded ${pick.sport} picks in lookback window`,
    value: sportGradedCount,
    threshold: PROMO_SPORT_MIN_GRADED,
  });

  // Gate 5: Odds gate (not chalk-heavy)
  const odds = pick.odds_at_capture ?? pick.odds;
  gates.push({
    gate: "odds_gate",
    passed: odds === null || odds >= PROMO_ODDS_FLOOR,
    detail: odds !== null ? `Odds at capture: ${odds > 0 ? "+" : ""}${odds}` : "No odds recorded",
    value: odds,
    threshold: PROMO_ODDS_FLOOR,
  });

  const passed = gates.filter((g) => g.passed);
  const failed = gates.filter((g) => !g.passed);

  return { gates, passed, failed, strongSignals };
}

function computePromotionScore(pick: GooseModelPick, gatesPassed: number, strongSignals: string[]): number {
  // 0–100 composite score
  const gatePct = gatesPassed / 5; // 5 total gates
  const signalBonus = Math.min(strongSignals.length * 0.05, 0.20);
  const edgeBonus = pick.edge_at_capture ? Math.min(pick.edge_at_capture / 100, 0.15) : 0;
  return Math.round((gatePct + signalBonus + edgeBonus) * 100);
}

export async function GET(req: NextRequest) {
  try {
    const sport = req.nextUrl.searchParams.get("sport")?.toUpperCase() ?? "ALL";
    const days = parseInt(req.nextUrl.searchParams.get("days") ?? String(PROMO_LOOKBACK_DAYS), 10);

    const sinceDate = cutoffDate(days);
    const allPicks = await listGoosePicks({ limit: 5000 });

    // Filter to picks in the lookback window
    const windowPicks = allPicks.filter((p) => p.date >= sinceDate);
    const gradedPicks = windowPicks.filter((p) => p.result !== "pending");

    // Apply sport filter
    const filteredGraded = sport === "ALL" ? gradedPicks : gradedPicks.filter((p) => p.sport === sport);
    const filteredPending = windowPicks.filter(
      (p) => p.result === "pending" && !p.promoted_to_production && (sport === "ALL" || p.sport === sport),
    );

    // Graded counts per sport
    const sportGradedCounts: Record<string, number> = {};
    for (const pick of gradedPicks) {
      sportGradedCounts[pick.sport] = (sportGradedCounts[pick.sport] ?? 0) + 1;
    }

    // Fetch signal weights from DB
    const signalWeightRows = await listSignalWeights(sport === "ALL" ? undefined : sport);
    const signalWinRates = new Map(
      signalWeightRows.map((w) => [w.signal, { win_rate: w.win_rate, appearances: w.appearances }]),
    );

    // Evaluate promotion gates for pending picks (these are promotion candidates)
    // Also evaluate graded wins in case they should be flagged for retroactive production use
    const candidatePicks = [
      ...filteredPending,
      ...filteredGraded.filter((p) => p.result === "win" && !p.promoted_to_production),
    ];

    const evaluated: PromotionCandidate[] = candidatePicks.map((pick) => {
      const sportGraded = sportGradedCounts[pick.sport] ?? 0;
      const { gates, passed, failed, strongSignals } = evaluateGates(pick, signalWinRates, sportGraded);

      const score = computePromotionScore(pick, passed.length, strongSignals);
      const eligible = failed.length === 0;

      const notes: string[] = [];
      if (eligible) notes.push("All gates passed — eligible for promotion");
      if (strongSignals.length) notes.push(`Strong signals: ${strongSignals.join(", ")}`);
      if (failed.length) notes.push(`Failed gates: ${failed.map((g) => g.gate).join(", ")}`);

      return {
        pick,
        promotion_score: score,
        gates_passed: passed,
        gates_failed: failed,
        eligible,
        strong_signals: strongSignals,
        promotion_notes: notes.join(" | "),
      };
    });

    // Sort by score desc
    evaluated.sort((a, b) => b.promotion_score - a.promotion_score);

    const eligible = evaluated.filter((c) => c.eligible);
    const borderline = evaluated.filter((c) => !c.eligible && c.gates_failed.length === 1);

    const summary = [
      `${filteredGraded.length} graded picks in last ${days} days.`,
      `${eligible.length} fully eligible for promotion (all 5 gates passed).`,
      `${borderline.length} borderline (failed 1 gate).`,
      signalWeightRows.length === 0
        ? "No DB signal weights yet — run auto-grade to accumulate."
        : `${signalWeightRows.filter((w) => w.appearances >= PROMO_SIGNAL_MIN_APPEARANCES).length} signals with >= ${PROMO_SIGNAL_MIN_APPEARANCES} appearances.`,
    ].join(" ");

    const result: PromotionCandidatesResult = {
      generated_at: new Date().toISOString(),
      lookback_days: days,
      sport_filter: sport,
      gates: {
        signal_min_appearances: PROMO_SIGNAL_MIN_APPEARANCES,
        signal_min_win_rate: PROMO_SIGNAL_MIN_WIN_RATE,
        edge_floor: PROMO_EDGE_FLOOR,
        hit_rate_floor: PROMO_HIT_RATE_FLOOR,
        sport_min_graded: PROMO_SPORT_MIN_GRADED,
        odds_floor: PROMO_ODDS_FLOOR,
      },
      sport_graded_counts: sportGradedCounts,
      eligible_candidates: eligible,
      borderline_candidates: borderline,
      summary,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[promotion-candidates] failed", error);
    return NextResponse.json({ error: "Promotion candidates query failed" }, { status: 500 });
  }
}
