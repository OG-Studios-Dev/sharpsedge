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
import { fetchNBAContextHints, emptyNBAContextHints } from "./nba-context";
import type { NBAContextHints } from "./nba-context";
import {
  scoreNHLFeaturesWithSnapshot,
  buildNHLWeightMap,
  fetchNHLContextHints,
  emptyNHLContextHints,
} from "./nhl-features";
import type { NHLFeatureSnapshot, NHLContextHints } from "./nhl-features";
import {
  scoreMLBFeaturesWithSnapshot,
  buildMLBWeightMap,
  fetchMLBContextHints,
  emptyMLBContextHints,
} from "./mlb-features";
import type { MLBFeatureSnapshot, MLBContextHints } from "./mlb-features";
import type { GooseSport } from "./types";
import { parsePropLine } from "./prop-parser";
import type { ParsedPropLine } from "./prop-parser";

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
  /** NHL-specific feature snapshot (only populated when sport === "NHL") */
  nhl_features: NHLFeatureSnapshot | null;
  /** MLB-specific feature snapshot (only populated when sport === "MLB") */
  mlb_features: MLBFeatureSnapshot | null;
  /** Prop type extracted from pick label */
  prop_type: string | null;
  /** Parsed prop line: numeric line value */
  prop_line: number | null;
  /** Parsed prop direction: over / under / null */
  prop_direction: "over" | "under" | null;
  /** True when this is a combo prop (PRA, Pts+Reb, etc.) */
  prop_is_combo: boolean;
  /** L5 hit rate from live context (0–1). Alias of nba_features.player_l5_hit_rate for quick access. */
  l5_hit_rate: number | null;
  /** Player's avg stat over last 5 games. Alias of nba_features.player_avg_stat_l5 for quick access. */
  l5_avg_stat: number | null;
}

function buildPickFactors(
  candidate: ScoredGooseCandidate,
  date: string,
  experimentTag: string | null,
): PickFactors {
  const sigs = candidate.signals_present ?? [];
  const isNBA = candidate.sport === "NBA";

  // Parse prop line using the dedicated parser (handles direction, combo, line value)
  const parsed: ParsedPropLine = parsePropLine(candidate.pick_label);
  const propType = candidate.prop_type ?? parsed.propType;

  // Build NBA feature snapshot if applicable
  const nbaMarketType = isNBA
    ? detectNBAMarketType(candidate.pick_label, propType)
    : null;
  const nbaFeatures = (candidate as any)._nba_feature_snapshot as NBAFeatureSnapshot | null ?? null;

  // Build NHL feature snapshot if applicable
  const nhlFeatures = (candidate as any)._nhl_feature_snapshot as NHLFeatureSnapshot | null ?? null;

  // Build MLB feature snapshot if applicable
  const mlbFeatures = (candidate as any)._mlb_feature_snapshot as MLBFeatureSnapshot | null ?? null;

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
    nhl_features: nhlFeatures,
    mlb_features: mlbFeatures,
    prop_type: propType,
    prop_line: parsed.line,
    prop_direction: parsed.direction,
    prop_is_combo: parsed.isCombo,
    l5_hit_rate: nbaFeatures?.player_l5_hit_rate ?? null,
    l5_avg_stat: nbaFeatures?.player_avg_stat_l5 ?? null,
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

  // Pre-fetch NHL weights once if any candidates are NHL
  const hasNHL = candidates.some((c) => c.sport === "NHL");
  const nhlWeightMap = hasNHL
    ? buildNHLWeightMap(await listSignalWeights("NHL"))
    : new Map<string, { win_rate: number; appearances: number }>();

  // Pre-fetch MLB weights once if any candidates are MLB
  const hasMLB = candidates.some((c) => c.sport === "MLB");
  const mlbWeightMap = hasMLB
    ? buildMLBWeightMap(await listSignalWeights("MLB"))
    : new Map<string, { win_rate: number; appearances: number }>();

  // Pre-fetch NBA context hints for all NBA candidates in parallel.
  // We batch these up front so each candidate doesn't make separate network
  // calls — the cached fetch layer in nba-api.ts deduplicates team lookups.
  const nbaContextMap = new Map<number, NBAContextHints>();
  if (hasNBA) {
    const nbaIndices = candidates
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.sport === "NBA");

    const contextResults = await Promise.allSettled(
      nbaIndices.map(({ c }) => {
        // Parse prop line via dedicated parser (handles Over/Under/combo formats)
        const { line: propLine } = parsePropLine(c.pick_label);
        return fetchNBAContextHints(
          c.player_name,
          c.team,
          c.opponent,
          c.prop_type,
          propLine,
        ).catch(() => emptyNBAContextHints());
      }),
    );

    nbaIndices.forEach(({ i }, idx) => {
      const result = contextResults[idx];
      nbaContextMap.set(
        i,
        result.status === "fulfilled" ? result.value : emptyNBAContextHints(),
      );
    });
  }

  // Pre-fetch NHL context hints for all NHL candidates in parallel.
  // The context board is fetched once and cached — individual lookups are cheap.
  const nhlContextMap = new Map<number, NHLContextHints>();
  if (hasNHL) {
    const nhlIndices = candidates
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.sport === "NHL");

    const nhlContextResults = await Promise.allSettled(
      nhlIndices.map(({ c }) =>
        fetchNHLContextHints(c.team, c.opponent).catch(() => emptyNHLContextHints()),
      ),
    );

    nhlIndices.forEach(({ i }, idx) => {
      const result = nhlContextResults[idx];
      nhlContextMap.set(
        i,
        result.status === "fulfilled" ? result.value : emptyNHLContextHints(),
      );
    });
  }

  // Pre-fetch MLB context hints for all MLB candidates in parallel.
  // The enrichment board is fetched once and cached — individual game lookups are cheap.
  const mlbContextMap = new Map<number, MLBContextHints>();
  if (hasMLB) {
    const mlbIndices = candidates
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.sport === "MLB");

    const mlbContextResults = await Promise.allSettled(
      mlbIndices.map(({ c }) =>
        fetchMLBContextHints(c.team, c.opponent).catch(() => emptyMLBContextHints()),
      ),
    );

    mlbIndices.forEach(({ i }, idx) => {
      const result = mlbContextResults[idx];
      mlbContextMap.set(
        i,
        result.status === "fulfilled" ? result.value : emptyMLBContextHints(),
      );
    });
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const signals = tagSignals(candidate.reasoning, candidate.pick_label);
    const modelScore = await scorePickBySignals(signals, candidate.sport);

    // Blend model score with hit rate as a fallback when weights are sparse
    const hitRateScore =
      typeof candidate.hit_rate_at_time === "number" ? candidate.hit_rate_at_time / 100 : 0;

    let blendedScore =
      modelScore > 0 ? modelScore * 0.7 + hitRateScore * 0.3 : hitRateScore;

    // ── NBA feature priors + live context enrichment ─────────
    // For NBA picks: merge live context auto-signals with reasoning-tagged signals,
    // then score with market-type-aware priors.
    // Weight: 20% NBA prior, 80% existing blend — additive and conservative.
    // Context hints are pre-fetched above and keyed by candidate index.
    let nbaFeatureSnapshot = null;
    if (candidate.sport === "NBA" && signals.length > 0) {
      const contextHints = nbaContextMap.get(i) ?? null;
      const { score: nbaFeatureScore, snapshot } = scoreNBAFeaturesWithSnapshot(
        signals,
        nbaWeightMap,
        candidate.pick_label,
        candidate.prop_type,
        contextHints,
      );
      nbaFeatureSnapshot = snapshot;
      if (nbaFeatureScore > 0) {
        blendedScore = blendedScore * 0.8 + nbaFeatureScore * 0.2;
      }
    }

    // ── NHL feature priors + live context enrichment ─────────
    // For NHL picks: merge live context auto-signals (goalie news, rest, travel)
    // with reasoning-tagged signals, then score with NHL-specific priors.
    // Weight: 20% NHL prior, 80% existing blend — same conservative blend as NBA.
    let nhlFeatureSnapshot = null;
    if (candidate.sport === "NHL" && signals.length > 0) {
      const contextHints = nhlContextMap.get(i) ?? null;
      const { score: nhlFeatureScore, snapshot } = scoreNHLFeaturesWithSnapshot(
        signals,
        nhlWeightMap,
        contextHints,
      );
      nhlFeatureSnapshot = snapshot;
      if (nhlFeatureScore > 0) {
        blendedScore = blendedScore * 0.8 + nhlFeatureScore * 0.2;
      }
    }

    // ── MLB feature priors + live context enrichment ─────────
    // For MLB picks: merge live context auto-signals (park factor, weather, bullpen,
    // probable pitchers) with reasoning-tagged signals, then score with MLB priors.
    // Weight: 20% MLB prior, 80% existing blend — same conservative blend as NBA/NHL.
    let mlbFeatureSnapshot = null;
    if (candidate.sport === "MLB" && signals.length > 0) {
      const contextHints = mlbContextMap.get(i) ?? null;
      const { score: mlbFeatureScore, snapshot } = scoreMLBFeaturesWithSnapshot(
        signals,
        mlbWeightMap,
        contextHints,
      );
      mlbFeatureSnapshot = snapshot;
      if (mlbFeatureScore > 0) {
        blendedScore = blendedScore * 0.8 + mlbFeatureScore * 0.2;
      }
    }

    scored.push({
      ...candidate,
      signals_present: signals,
      model_score: blendedScore,
      // Stash snapshots for buildPickFactors to consume (private fields, not part of interface)
      _nba_feature_snapshot: nbaFeatureSnapshot,
      _nhl_feature_snapshot: nhlFeatureSnapshot,
      _mlb_feature_snapshot: mlbFeatureSnapshot,
    } as ScoredGooseCandidate & {
      _nba_feature_snapshot: typeof nbaFeatureSnapshot;
      _nhl_feature_snapshot: typeof nhlFeatureSnapshot;
      _mlb_feature_snapshot: typeof mlbFeatureSnapshot;
    });
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
