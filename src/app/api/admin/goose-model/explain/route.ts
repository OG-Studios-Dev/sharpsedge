/**
 * GET /api/admin/goose-model/explain?id=<pick_id>
 *
 * Returns a full "why this pick exists" explanation for a stored goose pick.
 * Surfaces the complete decision chain:
 *   - Which signals fired and from what context
 *   - Which priors were applied (vs live DB weights)
 *   - How the model score was computed (blending formula)
 *   - Context data behind each signal (park factor, goalie data, BvP stats, etc.)
 *   - Thin-sample decay applied to any signals (early-season MLB edge damping)
 *   - Snapshot fields at pick generation time
 *   - Pick result if graded
 *
 * This is the primary debug visibility tool for understanding any single pick.
 * Also supports ?dry_run=true&sport=MLB&team=NYY&opponent=BOS to explain
 * a hypothetical pick without a stored ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks } from "@/lib/goose-model/store";
import type { GooseModelPick } from "@/lib/goose-model/types";

export const dynamic = "force-dynamic";

interface SignalExplanation {
  signal: string;
  fired_from: "context_auto" | "reasoning_text" | "both";
  /** Prior weight used (may be decayed if thin sample) */
  prior_applied: number | null;
  /** Original prior before decay */
  prior_original: number | null;
  /** Whether thin-sample decay was applied */
  decay_applied: boolean;
  /** Human-readable reason this signal fired */
  reason: string;
  /** Key context data behind this signal */
  context_evidence: Record<string, unknown>;
}

interface ModelScoreBreakdown {
  base_hit_rate_score: number;
  model_signal_score: number;
  sport_feature_score: number | null;
  blended_score: number;
  blend_formula: string;
  top_signals_by_weight: string[];
}

interface PickExplanation {
  pick_id: string;
  pick_label: string;
  sport: string;
  team: string | null;
  opponent: string | null;
  date: string;
  result: string;
  integrity_status: string | null;
  actual_result: string | null;
  odds: number | null;
  book: string | null;
  experiment_tag: string | null;
  promoted: boolean;

  /** The core "why" — every signal that contributed to this pick */
  signals: SignalExplanation[];

  /** Model score computation breakdown */
  score_breakdown: ModelScoreBreakdown;

  /** Sport-specific context snapshot (MLB features, NHL features, etc.) */
  sport_context: Record<string, unknown> | null;

  /** Raw factors snapshot (everything frozen at pick generation time) */
  raw_factors: Record<string, unknown> | null;

  /** Pick-level context summary (human-readable) */
  summary: string;

  /** Any warnings from context fetch at generation time */
  context_warnings: string[];

  /** Thin-sample note if applicable */
  thin_sample_note: string | null;
}

// MLB prior baseline (for computing decay comparison)
const MLB_PRIORS: Record<string, number> = {
  handedness_advantage: 0.58,
  lineup_bvp_edge: 0.61,
  pitcher_command: 0.60,
  opponent_era_lucky: 0.61,
  team_era_unlucky: 0.60,
  park_factor: 0.61,
  weather_wind: 0.61,
  bullpen_fatigue: 0.60,
  probable_pitcher_weak: 0.63,
  probable_pitcher_ace: 0.62,
  home_away_edge: 0.57,
  umpire_pitcher_friendly: 0.58,
  umpire_hitter_friendly: 0.57,
};

const NHL_PRIORS: Record<string, number> = {
  goalie_news: 0.65, goalie_quality: 0.58, back_to_back: 0.42,
  three_in_four: 0.40, travel_fatigue: 0.44, rest_days: 0.61,
  home_away_split: 0.60, streak_form: 0.62, matchup_edge: 0.63,
  lineup_change: 0.59, odds_movement: 0.60, pp_efficiency_edge: 0.57,
  goalie_pp_weakness: 0.55, shot_danger_edge: 0.58,
  opponent_goalie_hd_weakness: 0.56, player_shot_quality_edge: 0.57,
};

const NBA_PRIORS: Record<string, number> = {
  dvp_advantage: 0.62, pace_matchup: 0.58, usage_surge: 0.64,
  opponent_3pt_rate: 0.57, minutes_floor: 0.60, home_court_edge: 0.55,
  recent_trend_over: 0.61, recent_trend_under: 0.58,
};

const PGA_PRIORS: Record<string, number> = {
  dg_rank_elite: 0.58, dg_course_fit: 0.57, dg_form_surge: 0.61,
  dg_course_history: 0.59, dg_win_prob_edge: 0.62, course_good_conditions: 0.55,
};

const ALL_PRIORS: Record<string, number> = {
  ...MLB_PRIORS, ...NHL_PRIORS, ...NBA_PRIORS, ...PGA_PRIORS,
};

function buildSignalExplanation(
  signal: string,
  factors: Record<string, unknown>,
  sport: string,
): SignalExplanation {
  const contextAutoSignals = (factors.context_auto_signals as string[] | undefined) ?? [];
  const priorSignals = (factors.prior_signals as string[] | undefined) ?? [];
  const priorsApplied = (factors.signal_priors_applied as Record<string, number> | undefined) ?? {};
  const effectivePriors = (
    (factors[(sport.toLowerCase() + "_features")] as any)?.signal_effective_priors as Record<string, number> | undefined
  ) ?? {};

  const isAuto = contextAutoSignals.includes(signal);
  const isPriorSignal = priorSignals.includes(signal);

  const firedFrom: SignalExplanation["fired_from"] =
    isAuto && isPriorSignal ? "both" : isAuto ? "context_auto" : "reasoning_text";

  const priorApplied = priorsApplied[signal] ?? effectivePriors[signal] ?? null;
  const priorOriginal = ALL_PRIORS[signal] ?? null;
  const decayApplied = priorApplied !== null && priorOriginal !== null
    ? Math.abs(priorApplied - priorOriginal) > 0.001
    : false;

  // Build context evidence from the sport feature snapshot
  const sportKey = `${sport.toLowerCase()}_features`;
  const sportFeatures = factors[sportKey] as Record<string, unknown> | null ?? null;

  const contextEvidence: Record<string, unknown> = {};
  if (sportFeatures) {
    // Pull relevant fields for this signal
    const signalContextMap: Record<string, string[]> = {
      park_factor: ["park_runs_index", "venue_name"],
      weather_wind: ["wind_speed_mph", "wind_blowing_out", "temperature_f"],
      bullpen_fatigue: ["opponent_bullpen_score", "opponent_bullpen_level"],
      probable_pitcher_weak: ["opponent_starter_quality", "opponent_starter_era"],
      probable_pitcher_ace: ["team_starter_quality", "team_starter_era"],
      pitcher_command: ["team_starter_k_bb", "opponent_starter_k_bb"],
      handedness_advantage: ["opponent_pitcher_hand", "team_ops_vs_hand", "handedness_advantage_tier"],
      lineup_bvp_edge: ["lineup_avg_ops_vs_pitcher", "lineup_batters_with_history", "lineup_matchup_tier", "bvp_status"],
      opponent_era_lucky: ["opponent_era_fip_divergence", "opponent_starter_era", "opponent_starter_fip"],
      team_era_unlucky: ["team_era_fip_divergence", "team_starter_era", "team_starter_fip"],
      umpire_pitcher_friendly: ["hp_ump_name", "ump_zone_tier"],
      umpire_hitter_friendly: ["hp_ump_name", "ump_zone_tier"],
      home_away_edge: ["is_home", "team_home_win_rate", "opponent_away_win_rate", "home_away_edge_label"],
      goalie_news: ["team_goalie_is_backup", "opponent_goalie_is_backup"],
      goalie_quality: ["opponent_goalie_sv_pct", "opponent_goalie_gaa", "opponent_goalie_quality"],
      back_to_back: ["opponent_is_back_to_back", "team_is_back_to_back"],
      rest_days: ["team_rest_days"],
      pp_efficiency_edge: ["pp_efficiency_differential", "team_pp_pct", "opponent_pk_pct"],
      goalie_pp_weakness: ["opponent_goalie_pp_sv_pct"],
      shot_danger_edge: ["team_hdcf_pct", "opponent_hdcf_pct", "hd_edge"],
      opponent_goalie_hd_weakness: ["team_hd_save_pct", "opponent_hd_save_pct"],
      dvp_advantage: ["player_dvp_rank", "position_dvp_matchup"],
      pace_matchup: ["opponent_pace", "team_pace"],
      usage_surge: ["player_usage_pct", "team_missing_player"],
      recent_trend_over: ["player_l5_hit_rate", "player_avg_stat_l5"],
      recent_trend_under: ["player_l5_hit_rate", "player_avg_stat_l5"],
    };
    const relevantKeys = signalContextMap[signal] ?? [];
    for (const key of relevantKeys) {
      if (sportFeatures[key] !== undefined) contextEvidence[key] = sportFeatures[key];
    }
  }

  return {
    signal,
    fired_from: firedFrom,
    prior_applied: priorApplied,
    prior_original: priorOriginal,
    decay_applied: decayApplied,
    reason: buildSignalReason(signal, contextEvidence, sport),
    context_evidence: contextEvidence,
  };
}

function buildSignalReason(signal: string, ctx: Record<string, unknown>, sport: string): string {
  const reasons: Record<string, (ctx: Record<string, unknown>) => string> = {
    park_factor: (c) => `Park runs index: ${c.park_runs_index ?? "N/A"} at ${c.venue_name ?? "unknown venue"}`,
    weather_wind: (c) => `Wind ${c.wind_speed_mph ?? "?"}mph ${c.wind_blowing_out ? "blowing out (boosts HR/runs)" : ""}`,
    bullpen_fatigue: (c) => `Opponent bullpen fatigue score: ${c.opponent_bullpen_score ?? "N/A"}`,
    probable_pitcher_weak: (c) => `Opponent starter quality score: ${c.opponent_starter_quality ?? "N/A"} (ERA: ${c.opponent_starter_era ?? "N/A"})`,
    probable_pitcher_ace: (c) => `Team starter quality score: ${c.team_starter_quality ?? "N/A"} (ERA: ${c.team_starter_era ?? "N/A"})`,
    pitcher_command: (c) => `Team starter K/BB: ${c.team_starter_k_bb ?? "N/A"} (≥3.0 fires signal)`,
    handedness_advantage: (c) => `Team OPS vs ${c.opponent_pitcher_hand ?? "?"}-handed pitcher: ${c.team_ops_vs_hand ?? "N/A"} (tier: ${c.handedness_advantage_tier ?? "N/A"})`,
    lineup_bvp_edge: (c) => `Lineup avg OPS vs starter: ${c.lineup_avg_ops_vs_pitcher ?? "N/A"} (${c.lineup_batters_with_history ?? 0} batters with history, tier: ${c.lineup_matchup_tier ?? "N/A"})`,
    goalie_news: (c) => `Team backup goalie: ${c.team_goalie_is_backup ? "yes" : "no"} | Opponent backup: ${c.opponent_goalie_is_backup ? "yes" : "no"}`,
    goalie_quality: (c) => `Opponent goalie SV%: ${c.opponent_goalie_sv_pct ?? "N/A"}, GAA: ${c.opponent_goalie_gaa ?? "N/A"} (tier: ${c.opponent_goalie_quality ?? "N/A"})`,
    back_to_back: (c) => `Team B2B: ${c.team_is_back_to_back ? "yes" : "no"} | Opponent B2B: ${c.opponent_is_back_to_back ? "yes" : "no"}`,
    rest_days: (c) => `Team rest days since last game: ${c.team_rest_days ?? "N/A"}`,
    pp_efficiency_edge: (c) => `PP differential: ${c.pp_efficiency_differential ?? "N/A"} (team PP%: ${c.team_pp_pct ?? "N/A"}, opp PK%: ${c.opponent_pk_pct ?? "N/A"})`,
    shot_danger_edge: (c) => `HDCF% edge: team ${c.team_hdcf_pct ?? "N/A"} vs opp ${c.opponent_hdcf_pct ?? "N/A"} (diff: ${c.hd_edge ?? "N/A"})`,
    home_away_edge: (c) => `Home: ${c.is_home ? "yes" : "no"}, team home win rate: ${c.team_home_win_rate ?? "N/A"}, opp away win rate: ${c.opponent_away_win_rate ?? "N/A"} (${c.home_away_edge_label ?? "N/A"})`,
  };

  const builder = reasons[signal];
  if (builder) {
    try { return builder(ctx); } catch { /* fallback */ }
  }
  return `Signal '${signal}' present in ${sport} pick context`;
}

function buildExplanation(pick: GooseModelPick): PickExplanation {
  const factors = (pick.pick_snapshot as any)?.factors as Record<string, unknown> | null ?? null;
  const sport = pick.sport;

  const signals: SignalExplanation[] = [];
  for (const sig of pick.signals_present ?? []) {
    if (factors) {
      signals.push(buildSignalExplanation(sig, factors, sport));
    } else {
      signals.push({
        signal: sig,
        fired_from: "reasoning_text",
        prior_applied: ALL_PRIORS[sig] ?? null,
        prior_original: ALL_PRIORS[sig] ?? null,
        decay_applied: false,
        reason: `Signal '${sig}' tagged from reasoning text`,
        context_evidence: {},
      });
    }
  }

  // Score breakdown from stored factors
  const modelScore = (factors?.model_score as number | null) ?? pick.confidence ?? null;
  const hitRateScore = factors?.hit_rate_pct !== undefined
    ? (factors.hit_rate_pct as number) / 100
    : (pick.hit_rate_at_time ?? 50) / 100;

  const sportKey = `${sport.toLowerCase()}_features`;
  const sportFeatures = factors?.[sportKey] as Record<string, unknown> | null ?? null;
  const sportFeatureScore = sportFeatures
    ? (sportFeatures[`${sport.toLowerCase()}_feature_score`] as number | null ?? null)
    : null;

  const topSignals = signals
    .filter((s) => s.prior_applied !== null)
    .sort((a, b) => (b.prior_applied ?? 0) - (a.prior_applied ?? 0))
    .slice(0, 3)
    .map((s) => s.signal);

  const scoreBreakdown: ModelScoreBreakdown = {
    base_hit_rate_score: Math.round(hitRateScore * 100) / 100,
    model_signal_score: modelScore ?? 0,
    sport_feature_score: sportFeatureScore,
    blended_score: pick.confidence ? pick.confidence / 100 : (modelScore ?? 0),
    blend_formula: "0.8 × (base + model) + 0.2 × sport_feature",
    top_signals_by_weight: topSignals,
  };

  // Build summary
  const summaryParts: string[] = [
    `${pick.sport} pick: ${pick.pick_label}`,
    `Generated ${pick.date} for ${pick.team ?? "?"} vs ${pick.opponent ?? "?"}`,
    `${signals.length} signal(s): ${signals.map((s) => s.signal).join(", ")}`,
  ];
  if (pick.result !== "pending") {
    summaryParts.push(`Result: ${pick.result} (${pick.actual_result ?? "outcome not recorded"})`);
  }
  if (sportFeatures?.["thin_sample_decay_applied"]) {
    summaryParts.push(`⚠ Thin-sample decay applied (early-season edge damping)`);
  }

  const contextWarnings: string[] = [
    ...((sportFeatures?.["context_warnings"] as string[] | undefined) ?? []),
  ];

  const thinSampleNote = sportFeatures?.["sample_quality_note"] as string | null ?? null;

  return {
    pick_id: pick.id,
    pick_label: pick.pick_label,
    sport: pick.sport,
    team: pick.team,
    opponent: pick.opponent,
    date: pick.date,
    result: pick.result,
    integrity_status: pick.integrity_status,
    actual_result: pick.actual_result,
    odds: pick.odds,
    book: pick.book,
    experiment_tag: pick.experiment_tag,
    promoted: pick.promoted_to_production,
    signals,
    score_breakdown: scoreBreakdown,
    sport_context: sportFeatures,
    raw_factors: factors,
    summary: summaryParts.join(" | "),
    context_warnings: contextWarnings,
    thin_sample_note: thinSampleNote,
  };
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error: "id is required",
          usage: "GET /api/admin/goose-model/explain?id=<pick_id>",
          tip: "Use GET /api/admin/goose-model/analytics to list graded picks with their IDs",
        },
        { status: 400 },
      );
    }

    // Fetch all recent picks and find by ID
    const allPicks = await listGoosePicks({ limit: 5000 });
    const pick = allPicks.find((p) => p.id === id);

    if (!pick) {
      return NextResponse.json(
        { error: `Pick not found: ${id}` },
        { status: 404 },
      );
    }

    const explanation = buildExplanation(pick);
    return NextResponse.json(explanation);
  } catch (error) {
    console.error("[goose-model/explain] failed", error);
    return NextResponse.json({ error: "Explain request failed" }, { status: 500 });
  }
}
