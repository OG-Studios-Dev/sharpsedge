export const GOOSE2_MARKET_TYPES = [
  "moneyline",
  "spread",
  "total",
  "first_five_moneyline",
  "first_five_total",
  "first_quarter_spread",
  "third_quarter_spread",
  "player_prop_points",
  "player_prop_rebounds",
  "player_prop_assists",
  "player_prop_shots_on_goal",
  "player_prop_goals",
  "player_prop_hits",
  "player_prop_total_bases",
  "player_prop_strikeouts",
  "golf_outright",
  "golf_top_5",
  "golf_top_10",
  "golf_top_20",
  "golf_matchup",
  "unknown",
] as const;

export type Goose2MarketType = (typeof GOOSE2_MARKET_TYPES)[number];

export const GOOSE2_PARTICIPANT_TYPES = ["team", "player", "golfer", "pairing", "field", "unknown"] as const;
export type Goose2ParticipantType = (typeof GOOSE2_PARTICIPANT_TYPES)[number];

export const GOOSE2_EVENT_STATUSES = ["scheduled", "in_progress", "final", "postponed", "cancelled", "unknown"] as const;
export type Goose2EventStatus = (typeof GOOSE2_EVENT_STATUSES)[number];

export const GOOSE2_RESULT_STATUSES = ["win", "loss", "push", "void", "pending", "ungradeable", "cancelled"] as const;
export type Goose2ResultStatus = (typeof GOOSE2_RESULT_STATUSES)[number];

export const GOOSE2_INTEGRITY_STATUSES = ["pending", "ok", "postponed", "void", "unresolvable", "cancelled", "manual_review"] as const;
export type Goose2IntegrityStatus = (typeof GOOSE2_INTEGRITY_STATUSES)[number];

export const GOOSE2_DECISION_TIERS = ["A", "B", "C", "shadow", "reject"] as const;
export type Goose2DecisionTier = (typeof GOOSE2_DECISION_TIERS)[number];

export type Goose2Side = string;

export interface Goose2MarketEvent {
  event_id: string;
  sport: string;
  league: string;
  event_date: string;
  commence_time: string | null;
  home_team: string | null;
  away_team: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  event_label: string;
  status: Goose2EventStatus;
  source: string;
  source_event_id: string | null;
  odds_api_event_id: string | null;
  venue: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Goose2MarketCandidate {
  candidate_id: string;
  event_id: string;
  sport: string;
  league: string;
  event_date: string;
  market_type: Goose2MarketType;
  submarket_type: string | null;
  participant_type: Goose2ParticipantType;
  participant_id: string | null;
  participant_name: string | null;
  opponent_id: string | null;
  opponent_name: string | null;
  side: Goose2Side;
  line: number | null;
  odds: number;
  book: string;
  sportsbook?: string;
  capture_ts: string;
  snapshot_id: string | null;
  event_snapshot_id: string | null;
  source: string;
  source_market_id: string | null;
  is_best_price: boolean;
  is_opening: boolean;
  is_closing: boolean;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
  created_at?: string;
}

export interface Goose2MarketResult {
  candidate_id: string;
  event_id: string;
  result: Goose2ResultStatus;
  actual_stat: number | null;
  actual_stat_text: string | null;
  closing_line: number | null;
  closing_odds: number | null;
  settlement_ts: string | null;
  grade_source: string | null;
  integrity_status: Goose2IntegrityStatus;
  grading_notes: string | null;
  source_payload: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Goose2FeatureRow {
  feature_row_id: string;
  candidate_id: string;
  event_id: string;
  sport: string;
  league: string;
  market_type: Goose2MarketType;
  feature_version: string;
  feature_payload: Record<string, unknown>;
  system_flags: Record<string, unknown>;
  source_chain: Array<Record<string, unknown>>;
  generated_ts: string;
  created_at?: string;
}

export interface Goose2DecisionLog {
  decision_id: string;
  candidate_id: string;
  event_id: string;
  feature_row_id: string | null;
  upstream_goose_model_pick_id: string | null;
  decision_ts: string;
  model_version: string | null;
  policy_version: string;
  bet_decision: boolean;
  recommended_tier: Goose2DecisionTier | null;
  stake_suggestion: number | null;
  edge: number | null;
  p_true: number | null;
  calibrated_p_true: number | null;
  confidence_band: string | null;
  reason_rejected: string | null;
  rejection_reasons: string[];
  explanation: Record<string, unknown>;
  source: string;
  created_at?: string;
}
