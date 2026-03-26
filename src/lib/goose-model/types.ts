// ============================================================
// Goose AI Picks Model — type definitions
// ============================================================

export type GoosePickResult = "pending" | "win" | "loss" | "push";
export type GoosePickSource = "captured" | "generated";
export type GoosePickType = "player" | "team";

/**
 * integrity_status tracks resolution quality for a goose pick.
 * null = not yet assessed
 * ok   = resolved cleanly
 * unresolvable = no game found after retries; permanently skipped
 * postponed    = game postponed; will retry next day
 * void         = DNP / player scratch; units = 0, no weight update
 */
export type GooseIntegrityStatus = "ok" | "unresolvable" | "postponed" | "void";

export type GooseSport = "NHL" | "NBA" | "MLB" | "PGA" | string;

export const GOOSE_SIGNALS = [
  "home_away_split",
  "rest_days",
  "travel_fatigue",
  "back_to_back",
  "streak_form",
  "goalie_news",
  "lineup_change",
  "odds_movement",
  "public_vs_sharp",
  "matchup_edge",
  "weather",
  "park_factor",
  "bullpen_strength",
  "injury_news",
  // ── NBA-specific signals ─────────────────────────────────
  /** Defense vs Position: opponent is weak at defending this player's primary stat */
  "dvp_advantage",
  /** Pace matchup: high-pace game means more possessions / stat opportunities */
  "pace_matchup",
  /** Usage surge: teammate out or role expanded, player's usage/minutes up */
  "usage_surge",
  /** Opponent concedes high 3-point attempt rate — shooter benefits */
  "opponent_3pt_rate",
  /** Player has a guaranteed minutes floor (starter confirmed, heavy rotation) */
  "minutes_floor",
  /** NBA home-court advantage: meaningful for player props and team MLs */
  "home_court_edge",
  /** Recent games: player has been trending OVER the prop line in last 3+ games */
  "recent_trend_over",
  /** Recent games: player has been trending UNDER the prop line in last 3+ games */
  "recent_trend_under",
] as const;

export type GooseSignal = (typeof GOOSE_SIGNALS)[number];

export interface GooseModelPick {
  id: string;
  date: string;
  sport: GooseSport;
  pick_label: string;
  pick_type: GoosePickType;
  player_name: string | null;
  team: string | null;
  opponent: string | null;
  game_id: string | null;
  reasoning: string | null;
  signals_present: string[];
  odds: number | null;
  book: string | null;
  hit_rate_at_time: number | null;
  confidence: number | null;
  result: GoosePickResult;
  /** Resolution quality — null means not yet assessed */
  integrity_status: GooseIntegrityStatus | null;
  /** Free-text description of what actually happened (score, stat, etc.) */
  actual_result: string | null;
  model_version: string;
  source: GoosePickSource;
  pick_snapshot: Record<string, unknown> | null;
  promoted_to_production: boolean;
  promotion_notes: string | null;
  created_at: string;
  updated_at: string;
  // ── Sandbox / analytics capture fields ─────────────────────
  /** Exact edge % frozen at the moment the pick was generated */
  edge_at_capture: number | null;
  /** Exact hitRate frozen at the moment the pick was generated */
  hit_rate_at_capture: number | null;
  /** Exact odds frozen at the moment the pick was generated */
  odds_at_capture: number | null;
  /** How many signals were present at generation time */
  signals_count: number | null;
  /** Experiment cohort tag — e.g. "baseline-v1", "edge-7plus" */
  experiment_tag: string | null;
}

export interface GooseAnalyticsBucket {
  label: string;
  count: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
}

export interface GooseAnalyticsResult {
  total_graded: number;
  by_edge_bucket: GooseAnalyticsBucket[];
  by_hit_rate_bucket: GooseAnalyticsBucket[];
  by_signals_count: GooseAnalyticsBucket[];
  by_sport: GooseAnalyticsBucket[];
  by_signal: GooseAnalyticsBucket[];
  recommendation: string;
}

export interface GooseSignalWeight {
  id: string;
  signal: string;
  sport: GooseSport | "ALL";
  appearances: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  last_updated: string;
}

export interface GooseModelStats {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  win_rate: number;
}

export interface GooseSignalLeaderboardEntry extends GooseSignalWeight {
  delta_from_baseline: number;
}
