import type { AIPick } from "@/lib/types";

export type ProfileRole = "user" | "admin";
export type ProfileTier = "free" | "pro" | "sharp" | "beta";
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "coming_soon";

export type ProfileRecord = {
  id: string;
  name: string;
  username: string | null;
  role: ProfileRole;
  tier: ProfileTier;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  created_at: string;
  last_login_at: string | null;
  email?: string | null;
};

export type PickHistoryProvenance = "original" | "reconstructed" | "manual_repair";
export type PickSlateStatus = "locked" | "incomplete";
export type PickHistoryIntegrityStatus = "ok" | "reconstructed" | "incomplete";

export type PickHistoryRecord = {
  id: string;
  date: string;
  league: string;
  pick_type: string;
  player_name: string | null;
  team: string;
  opponent: string | null;
  pick_label: string;
  hit_rate: number | null;
  edge: number | null;
  odds: number | null;
  book: string | null;
  sportsbook: string | null;
  result: "pending" | "win" | "loss" | "push";
  game_id: string | null;
  reasoning: string | null;
  confidence: number | null;
  units: number;
  created_at: string;
  provenance: PickHistoryProvenance;
  provenance_note: string | null;
  pick_snapshot: AIPick | null;
  updated_at: string | null;
};

export type PickSlateRecord = {
  date: string;
  league: string;
  status: PickSlateStatus;
  provenance: PickHistoryProvenance;
  provenance_note: string | null;
  expected_pick_count: number;
  pick_count: number;
  status_note: string | null;
  integrity_status: PickHistoryIntegrityStatus;
  locked_at: string;
  created_at: string;
  updated_at: string | null;
};

export type UserPickSourceType = "ai_pick" | "prop" | "team_trend" | "manual" | "parlay";
export type UserPickKind = "single" | "parlay_leg" | "parlay";
export type UserPickStatus = "pending" | "win" | "loss" | "push" | "void" | "cancelled";

export type UserPickRecord = {
  id: string;
  user_id: string;
  source_type: UserPickSourceType;
  source_id: string | null;
  parent_pick_id: string | null;
  kind: UserPickKind;
  status: UserPickStatus;
  league: string;
  game_date: string | null;
  game_id: string | null;
  team: string | null;
  opponent: string | null;
  player_name: string | null;
  pick_label: string;
  detail: string | null;
  bet_type: string | null;
  market_type: string | null;
  line: number | null;
  odds: number | null;
  book: string | null;
  units: number;
  risk_amount: number | null;
  to_win_amount: number | null;
  profit_units: number;
  result_settled_at: string | null;
  placed_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
  locked_snapshot: Record<string, unknown> | null;
};

export type UserPickStatsRecord = {
  user_id: string;
  total_picks: number;
  settled_picks: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  win_rate: number;
  profit_units: number;
  roi: number;
  current_streak: number;
  best_win_streak: number;
  updated_at: string;
};

export type MarketEventRecord = {
  id: string;
  league: string;
  event_date: string | null;
  game_id: string | null;
  commence_time: string | null;
  home_team: string | null;
  away_team: string | null;
  event_label: string | null;
  status: string | null;
  result_payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type MarketPickRecord = {
  id: string;
  event_id: string | null;
  source_type: "model" | "user" | "manual" | "imported";
  source_system: string;
  source_pick_id: string | null;
  league: string;
  game_date: string | null;
  game_id: string | null;
  pick_type: string;
  market_type: string | null;
  bet_type: string | null;
  player_name: string | null;
  team: string | null;
  opponent: string | null;
  pick_label: string;
  line: number | null;
  direction: string | null;
  book: string | null;
  odds: number | null;
  confidence: number | null;
  hit_rate: number | null;
  edge: number | null;
  reasoning: string | null;
  status: "pending" | "win" | "loss" | "push" | "void" | "cancelled" | "ungraded";
  grading_status: "pending" | "graded" | "manual_review" | "ungradeable";
  graded_at: string | null;
  grading_source: string | null;
  grading_notes: string | null;
  result_value: number | null;
  result_text: string | null;
  settled_at: string | null;
  snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type UserPickEntryRecord = {
  id: string;
  user_id: string;
  user_pick_id: string | null;
  market_pick_id: string | null;
  entry_kind: "single" | "parlay" | "parlay_leg";
  entry_status: "pending" | "win" | "loss" | "push" | "void" | "cancelled";
  display_order: number;
  placed_at: string;
  settled_at: string | null;
  profit_units: number;
  locked_odds: number | null;
  locked_line: number | null;
  locked_book: string | null;
  locked_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  last_sign_in_at?: string | null;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: AuthUser;
};

export type BrowserSession = {
  user: AuthUser;
  expires_at: number | null;
};

export type AuthEnvelope = {
  session: BrowserSession | null;
  user: AuthUser | null;
  profile: ProfileRecord | null;
};

export type AuthResponse = {
  data: AuthEnvelope;
  error: { message: string } | null;
};

export type SystemHealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
  statusCode?: number;
  status?: "healthy" | "stale" | "degraded" | "missing";
  checkedAt?: string;
  lastSuccessAt?: string | null;
  freshnessSummary?: string | null;
};
