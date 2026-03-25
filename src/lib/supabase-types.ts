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
