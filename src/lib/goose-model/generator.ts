// ============================================================
// Goose AI Picks Model — model-driven picks generator
// Generates picks using learned signal weights instead of
// static rules. Targets NHL, NBA, MLB, PGA.
// ============================================================

import type { AIPick } from "@/lib/types";
import { tagSignals } from "./signal-tagger";
import { scorePickBySignals } from "./store";
import type { GooseSport } from "./types";

export const GOOSE_MODEL_VERSION = "goose-v1";

export interface GooseModelCandidate {
  pick_label: string;
  pick_type: "player" | "team";
  player_name?: string | null;
  team?: string | null;
  opponent?: string | null;
  game_id?: string | null;
  reasoning?: string | null;
  odds?: number | null;
  book?: string | null;
  hit_rate_at_time?: number | null;
  confidence?: number | null;
  sport: GooseSport;
  pick_snapshot?: Record<string, unknown>;
}

export interface ScoredGooseCandidate extends GooseModelCandidate {
  signals_present: string[];
  model_score: number;
}

export interface GooseGeneratorResult {
  date: string;
  sport: GooseSport;
  scored_candidates: ScoredGooseCandidate[];
  selected: ScoredGooseCandidate[];
  model_version: string;
}

/**
 * Score a list of candidate picks using learned signal weights.
 * For sports without weight data yet, falls back to hit_rate_at_time.
 */
export async function scoreGooseCandidates(
  candidates: GooseModelCandidate[],
): Promise<ScoredGooseCandidate[]> {
  const scored: ScoredGooseCandidate[] = [];

  for (const candidate of candidates) {
    const signals = tagSignals(candidate.reasoning, candidate.pick_label);
    const modelScore = await scorePickBySignals(signals, candidate.sport);

    // Blend model score with hit rate as a fallback when weights are sparse
    const hitRateScore =
      typeof candidate.hit_rate_at_time === "number" ? candidate.hit_rate_at_time / 100 : 0;

    const blendedScore =
      modelScore > 0 ? modelScore * 0.7 + hitRateScore * 0.3 : hitRateScore;

    scored.push({
      ...candidate,
      signals_present: signals,
      model_score: blendedScore,
    });
  }

  return scored.sort((a, b) => b.model_score - a.model_score);
}

/**
 * Convert existing AIPick objects (from live pipeline) into GooseModelCandidate format.
 */
export function aiPicksToGooseCandidates(
  picks: AIPick[],
  sport: GooseSport,
): GooseModelCandidate[] {
  return picks.map((pick) => ({
    pick_label: pick.pickLabel,
    pick_type: pick.type,
    player_name: pick.playerName ?? null,
    team: pick.team ?? null,
    opponent: pick.opponent ?? null,
    game_id: pick.gameId ?? null,
    reasoning: pick.reasoning ?? null,
    odds: typeof pick.odds === "number" ? pick.odds : null,
    book: pick.book ?? null,
    hit_rate_at_time: typeof pick.hitRate === "number" ? pick.hitRate : null,
    confidence: typeof pick.confidence === "number" ? pick.confidence : null,
    sport,
    pick_snapshot: pick as unknown as Record<string, unknown>,
  }));
}

/**
 * Run the full Goose Model generator pipeline for a sport.
 * Takes candidates (e.g. from the live engine), scores them,
 * and selects the top N picks by model score.
 */
export async function generateGoosePicks(opts: {
  date: string;
  sport: GooseSport;
  candidates: GooseModelCandidate[];
  topN?: number;
}): Promise<GooseGeneratorResult> {
  const { date, sport, topN = 5 } = opts;

  const scored = await scoreGooseCandidates(opts.candidates);
  const selected = scored.slice(0, topN);

  return {
    date,
    sport,
    scored_candidates: scored,
    selected,
    model_version: GOOSE_MODEL_VERSION,
  };
}

/**
 * Convert a ScoredGooseCandidate into a row ready for captureGoosePicks.
 */
export function scoredCandidateToPickRow(
  candidate: ScoredGooseCandidate,
  date: string,
) {
  return {
    pick_label: candidate.pick_label,
    pick_type: candidate.pick_type,
    player_name: candidate.player_name,
    team: candidate.team,
    opponent: candidate.opponent,
    game_id: candidate.game_id,
    reasoning: candidate.reasoning,
    signals_present: candidate.signals_present,
    odds: candidate.odds,
    book: candidate.book,
    hit_rate_at_time: candidate.hit_rate_at_time,
    confidence:
      candidate.confidence ??
      Math.round(Math.min(Math.max(candidate.model_score * 100, 0), 100)),
    model_version: GOOSE_MODEL_VERSION,
    source: "generated" as const,
    pick_snapshot: candidate.pick_snapshot ?? null,
  };
}
