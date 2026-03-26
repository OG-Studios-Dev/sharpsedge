// ============================================================
// Goose AI Picks Model — model-driven picks generator
// Generates picks using learned signal weights instead of
// static rules. Targets NHL, NBA, MLB, PGA.
// ============================================================

import type { AIPick } from "@/lib/types";
import { tagSignals } from "./signal-tagger";
import { scorePickBySignals, listSignalWeights } from "./store";
import {
  scoreNBAFeaturesWithSnapshot,
  buildNBAWeightMap,
  detectNBAMarketType,
} from "./nba-features";
import type { NBAFeatureSnapshot } from "./nba-features";
import type { GooseSport } from "./types";

export const GOOSE_MODEL_VERSION = "goose-v1";

// ── Production thresholds ────────────────────────────────────
export const PROD_HIT_RATE_FLOOR = 65;
export const PROD_EDGE_FLOOR     = 5;
export const PROD_TOP_N          = 5;

// ── Sandbox thresholds (wider net — captures borderline picks so the
//    signal-weight engine learns what thresholds actually matter) ──────
export const SANDBOX_HIT_RATE_FLOOR  = 55;
export const SANDBOX_EDGE_FLOOR      = 3;
export const SANDBOX_TOP_N           = 10;
export const SANDBOX_EXPERIMENT_TAG  = "baseline-v1";
export const SANDBOX_MIN_PICKS_TARGET = 6; // "generate more" trigger

// ── HARD RULE: odds cap (applies to every sport, every threshold,
//    sandbox AND production — never generate a pick at worse than -200) ─
export const SANDBOX_ODDS_CAP = -200;

/** Returns true if odds are within the allowed range (no worse than -200). */
export function isWithinOddsCap(odds?: number | null): boolean {
  if (typeof odds !== "number") return true; // no odds data = allowed through
  return odds >= SANDBOX_ODDS_CAP; // -200, -150, +110 etc. all pass; -201 does not
}

// ── Factor snapshot ───────────────────────────────────────────
/** Rich capture-time snapshot of every measurable factor on a pick.
 *  Stored inside pick_snapshot.factors so outcomes can be fully audited. */
export interface PickFactors {
  edge_pct: number | null;
  hit_rate_pct: number | null;
  odds_at_capture: number | null;
  signals_count: number;
  signals: string[];
  model_score: number;
  is_home: boolean | null;
  team: string | null;
  opponent: string | null;
  book: string | null;
  pick_type: "player" | "team";
  player_name: string | null;
  game_id: string | null;
  sport: string;
  date: string;
  experiment_tag: string | null;
  /** Extracted from signals: rest advantage, streak length, matchup edge flag, etc. */
  rest_advantage: boolean;
  on_streak: boolean;
  has_matchup_edge: boolean;
  has_travel_penalty: boolean;
  /** NBA-specific feature snapshot (only populated when sport === "NBA") */
  nba_features: NBAFeatureSnapshot | null;
  /** Detected NBA market type (player_pts / player_reb / team_ml / total / etc.) */
  nba_market_type: string | null;
  /** Prop type extracted from pick label */
  prop_type: string | null;
}

function buildPickFactors(
  candidate: ScoredGooseCandidate,
  date: string,
  experimentTag: string | null,
): PickFactors {
  const sigs = candidate.signals_present ?? [];
  const isNBA = candidate.sport === "NBA";

  // Extract prop_type from pick_label (e.g. "LeBron James Over 25.5 Points" → "Points")
  const propTypeMatch = candidate.pick_label?.match(
    /\b(Points|Rebounds|Assists|3-Pointers Made|Pts\+Reb|Pts\+Ast|Pts\+Reb\+Ast|Blocks|Steals|PRA)\b/i,
  );
  const propType = propTypeMatch ? propTypeMatch[1] : null;

  // Build NBA feature snapshot if applicable
  const nbaMarketType = isNBA
    ? detectNBAMarketType(candidate.pick_label, candidate.prop_type ?? propType)
    : null;
  const nbaFeatures = (candidate as any)._nba_feature_snapshot as NBAFeatureSnapshot | null ?? null;

  return {
    edge_pct: typeof candidate.edge === "number" ? candidate.edge : null,
    hit_rate_pct: typeof candidate.hit_rate_at_time === "number" ? candidate.hit_rate_at_time : null,
    odds_at_capture: typeof candidate.odds === "number" ? candidate.odds : null,
    signals_count: sigs.length,
    signals: sigs,
    model_score: candidate.model_score,
    is_home: candidate.is_home ?? null,
    team: candidate.team ?? null,
    opponent: candidate.opponent ?? null,
    book: candidate.book ?? null,
    pick_type: candidate.pick_type,
    player_name: candidate.player_name ?? null,
    game_id: candidate.game_id ?? null,
    sport: candidate.sport,
    date,
    experiment_tag: experimentTag,
    rest_advantage: sigs.includes("rest_days"),
    on_streak: sigs.includes("streak_form"),
    has_matchup_edge: sigs.includes("matchup_edge"),
    has_travel_penalty: sigs.includes("travel_fatigue"),
    nba_features: nbaFeatures,
    nba_market_type: nbaMarketType,
    prop_type: propType,
  };
}

// ── Candidate types ───────────────────────────────────────────

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
  /** Raw edge % (0–100 scale) captured from the live engine */
  edge?: number | null;
  confidence?: number | null;
  /** True if team is playing at home */
  is_home?: boolean | null;
  /** Prop type string from the source pick (e.g. "points", "rebounds") */
  prop_type?: string | null;
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

// ── Scoring ───────────────────────────────────────────────────

/**
 * Score a list of candidate picks using learned signal weights.
 * For sports without weight data yet, falls back to hit_rate_at_time.
 *
 * For NBA picks, applies NBA-specific feature priors (dvp_advantage,
 * pace_matchup, usage_surge, opponent_3pt_rate) when the live weight DB
 * doesn't yet have enough data for those signals.
 */
export async function scoreGooseCandidates(
  candidates: GooseModelCandidate[],
): Promise<ScoredGooseCandidate[]> {
  const scored: ScoredGooseCandidate[] = [];

  // Pre-fetch NBA weights once if any candidates are NBA (avoids N DB calls)
  const hasNBA = candidates.some((c) => c.sport === "NBA");
  const nbaWeightMap = hasNBA
    ? buildNBAWeightMap(await listSignalWeights("NBA"))
    : new Map<string, { win_rate: number; appearances: number }>();

  for (const candidate of candidates) {
    const signals = tagSignals(candidate.reasoning, candidate.pick_label);
    const modelScore = await scorePickBySignals(signals, candidate.sport);

    // Blend model score with hit rate as a fallback when weights are sparse
    const hitRateScore =
      typeof candidate.hit_rate_at_time === "number" ? candidate.hit_rate_at_time / 100 : 0;

    let blendedScore =
      modelScore > 0 ? modelScore * 0.7 + hitRateScore * 0.3 : hitRateScore;

    // ── NBA feature priors ───────────────────────────────────
    // When sport is NBA and the pick has NBA-specific signals, blend in
    // a prior score for signals not yet backed by live DB data.
    // Weight: 20% NBA prior, 80% existing blend — additive and conservative.
    // Also captures a full NBAFeatureSnapshot for pick_snapshot.factors.
    let nbaFeatureSnapshot = null;
    if (candidate.sport === "NBA" && signals.length > 0) {
      const { score: nbaFeatureScore, snapshot } = scoreNBAFeaturesWithSnapshot(
        signals,
        nbaWeightMap,
        candidate.pick_label,
        candidate.prop_type,
      );
      nbaFeatureSnapshot = snapshot;
      if (nbaFeatureScore > 0) {
        blendedScore = blendedScore * 0.8 + nbaFeatureScore * 0.2;
      }
    }

    scored.push({
      ...candidate,
      signals_present: signals,
      model_score: blendedScore,
      // Stash snapshot for buildPickFactors to consume (private field, not part of interface)
      _nba_feature_snapshot: nbaFeatureSnapshot,
    } as ScoredGooseCandidate & { _nba_feature_snapshot: typeof nbaFeatureSnapshot });
  }

  return scored.sort((a, b) => b.model_score - a.model_score);
}

// ── Conversion ────────────────────────────────────────────────

/**
 * Convert existing AIPick objects (from live pipeline) into GooseModelCandidate format.
 * Captures edge, home/away, and odds for later analytics.
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
    edge: typeof pick.edge === "number" ? pick.edge : null,
    confidence: typeof pick.confidence === "number" ? pick.confidence : null,
    is_home: pick.isAway === false ? true : pick.isAway === true ? false : null,
    prop_type: pick.propType ?? null,
    sport,
    pick_snapshot: pick as unknown as Record<string, unknown>,
  }));
}

// ── Generator ─────────────────────────────────────────────────

export interface GooseGenerateOptions {
  date: string;
  sport: GooseSport;
  candidates: GooseModelCandidate[];
  topN?: number;
  /** If true, apply sandbox thresholds (lower hit-rate / edge floors, wider pool) */
  sandbox?: boolean;
  /** Override hit-rate floor (0–100) */
  hitRateFloor?: number;
  /** Override edge floor (%) */
  edgeFloor?: number;
  /** Experiment tag attached to all selected picks */
  experimentTag?: string | null;
}

/**
 * Run the full Goose Model generator pipeline for a sport.
 * Takes candidates (e.g. from the live engine), scores them,
 * applies threshold filters, and selects the top N picks by model score.
 *
 * HARD RULE: candidates with odds worse than -200 are always excluded
 * regardless of sandbox mode or threshold settings.
 */
export async function generateGoosePicks(
  opts: GooseGenerateOptions,
): Promise<GooseGeneratorResult> {
  const {
    date,
    sport,
    sandbox = false,
    experimentTag = null,
  } = opts;

  const topN = opts.topN ?? (sandbox ? SANDBOX_TOP_N : PROD_TOP_N);
  const hitRateFloor = opts.hitRateFloor ?? (sandbox ? SANDBOX_HIT_RATE_FLOOR : PROD_HIT_RATE_FLOOR);
  const edgeFloor = opts.edgeFloor ?? (sandbox ? SANDBOX_EDGE_FLOOR : PROD_EDGE_FLOOR);

  // ── HARD FILTER: -200 odds cap (always applied) ──────────────
  const withinOddsCap = opts.candidates.filter((c) => isWithinOddsCap(c.odds));

  // ── Threshold filter ─────────────────────────────────────────
  const qualifying = withinOddsCap.filter((c) => {
    const hr = typeof c.hit_rate_at_time === "number" ? c.hit_rate_at_time : 0;
    const edge = typeof c.edge === "number" ? c.edge : 0;
    return hr >= hitRateFloor && edge >= edgeFloor;
  });

  const scored = await scoreGooseCandidates(qualifying);

  // Attach experiment tag to each scored candidate for downstream use
  const taggedScored = scored.map((c) => ({ ...c, _experimentTag: experimentTag }));
  const selected = taggedScored.slice(0, topN);

  return {
    date,
    sport,
    scored_candidates: taggedScored,
    selected,
    model_version: GOOSE_MODEL_VERSION,
  };
}

// ── Row builder ────────────────────────────────────────────────

/**
 * Convert a ScoredGooseCandidate into a row ready for captureGoosePicks.
 * Includes all capture-time analytics fields and a full factors snapshot.
 */
export function scoredCandidateToPickRow(
  candidate: ScoredGooseCandidate & { _experimentTag?: string | null },
  date: string,
  experimentTag?: string | null,
) {
  const tag = experimentTag ?? (candidate as any)._experimentTag ?? null;

  const factors = buildPickFactors(candidate, date, tag);

  // Merge factors into pick_snapshot for full auditability
  const enrichedSnapshot: Record<string, unknown> = {
    ...(candidate.pick_snapshot ?? {}),
    factors,
  };

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
    pick_snapshot: enrichedSnapshot,
    // ── Capture-time analytics fields ────────────────────────
    edge_at_capture: typeof candidate.edge === "number" ? candidate.edge : null,
    hit_rate_at_capture:
      typeof candidate.hit_rate_at_time === "number" ? candidate.hit_rate_at_time : null,
    odds_at_capture: typeof candidate.odds === "number" ? candidate.odds : null,
    signals_count: candidate.signals_present.length,
    experiment_tag: tag,
  };
}
