import { buildGoose2DecisionId } from "@/lib/goose2/ids";
import type { Goose2DecisionLog, Goose2FeatureRow, Goose2MarketCandidate } from "@/lib/goose2/types";

export function buildShadowDecision(input: {
  candidate: Goose2MarketCandidate;
  featureRow: Goose2FeatureRow;
  policyVersion?: string;
  modelVersion?: string | null;
  decisionTs?: string;
}) : Goose2DecisionLog {
  const decisionTs = input.decisionTs ?? new Date().toISOString();
  const policyVersion = input.policyVersion ?? "phase1-shadow";
  const qualifierCount = Number((input.featureRow.system_flags as { qualifier_count?: unknown }).qualifier_count ?? 0);

  return {
    decision_id: buildGoose2DecisionId(input.candidate.candidate_id, policyVersion, decisionTs),
    candidate_id: input.candidate.candidate_id,
    event_id: input.candidate.event_id,
    feature_row_id: input.featureRow.feature_row_id,
    upstream_goose_model_pick_id: null,
    decision_ts: decisionTs,
    model_version: input.modelVersion ?? null,
    policy_version: policyVersion,
    bet_decision: false,
    recommended_tier: "shadow",
    stake_suggestion: null,
    edge: null,
    p_true: null,
    calibrated_p_true: null,
    confidence_band: null,
    reason_rejected: "shadow_only",
    rejection_reasons: qualifierCount > 0 ? [] : ["no_linked_system_qualifier"],
    explanation: {
      mode: "shadow",
      qualifier_count: qualifierCount,
      market_type: input.candidate.market_type,
      side: input.candidate.side,
      book: input.candidate.book,
    },
    source: "goose2",
  };
}
