// ============================================================
// Goose AI Picks Model — type definitions
// ============================================================

export type GoosePickResult = "pending" | "win" | "loss" | "push";
export type GoosePickSource = "captured" | "generated";
export type GoosePickType = "player" | "team";

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
  model_version: string;
  source: GoosePickSource;
  pick_snapshot: Record<string, unknown> | null;
  promoted_to_production: boolean;
  promotion_notes: string | null;
  created_at: string;
  updated_at: string;
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
