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
  // ── NHL-specific special teams signals ──────────────────────────
  /**
   * PP efficiency edge: team PP% meaningfully outperforms opponent PK%.
   * Fires when ppEfficiencyDifferential >= 0.02 (moderate) or >= 0.04 (strong).
   * Source: NHL stats REST API season aggregates.
   */
  "pp_efficiency_edge",
  /**
   * Opponent goalie is weak on the power-play (ppSavePct < 0.85 with >= 10 shots faced).
   * Most relevant for PP specialist player props.
   * Source: NHL stats REST API goalie/savesByStrength.
   */
  "goalie_pp_weakness",
  /**
   * Shot danger edge: team's HDCF% meaningfully higher than opponent's (>= 3.0 pp diff).
   * Fires when team generates more high-danger scoring chances (slot, crease area).
   * Source: nhl-pbp-aggregate (NHL play-by-play x/y coordinates, last 10 games).
   */
  "shot_danger_edge",
  /**
   * Opponent goalie high-danger weakness: opponent goalie's HDSV% < 0.80.
   * Fires when the goalie allows more than expected from the high-danger zone.
   * Source: nhl-pbp-aggregate (computed from PBP shot event coordinates).
   */
  "opponent_goalie_hd_weakness",
  /**
   * Player shot quality edge: team's top-3 xG/game generators average meaningfully
   * more expected goals per game than opponent's top-3 xG generators.
   * Fires when team_top3_avg_xg_per_game - opp_top3_avg_xg_per_game >= 0.025.
   * Measures concentration of shot quality in a team's best offensive players.
   * Source: nhl-pbp-aggregate (per-player xG attribution from PBP shootingPlayerId).
   */
  "player_shot_quality_edge",
  // ── MLB-specific signals ──────────────────────────────────────
  /**
   * Pitcher command edge: team's probable starter has K/BB ratio >= 3.0 (with >= 5 IP).
   * High K/BB = fewer free baserunners, harder for opponents to manufacture runs.
   * Source: MLB Stats API schedule hydrate (strikeOuts + baseOnBalls in season stats).
   */
  "pitcher_command",
  /**
   * Home/away split edge: team's home win rate significantly above .500 (playing at home),
   * or opponent's away win rate significantly below .500 (visiting team struggles on road).
   * Source: MLB Stats API standings splitRecords (homeRecord, awayRecord).
   */
  "home_away_edge",
  /**
   * Home plate umpire has a pitcher-friendly zone (tight zone → more called strikes,
   * fewer walks, suppressed run environment). Good for UNDER and pitcher ML picks.
   * Source: seeded UmpScorecards zone_tier 2019-2024 + MLB Stats API boxscore officials.
   */
  "umpire_pitcher_friendly",
  /**
   * Home plate umpire has a hitter-friendly zone (loose zone → more walks, more
   * baserunners, elevated run environment). Good for OVER and run-scoring picks.
   * Source: seeded UmpScorecards zone_tier 2019-2024 + MLB Stats API boxscore officials.
   */
  "umpire_hitter_friendly",
  /**
   * Team has a batting handedness advantage vs today's probable starter's throwing hand.
   * Team OPS >= .720 vs pitcher's hand (moderate) or >= .750 (strong) this season.
   * Source: MLB Stats API vsLeft/vsRight team batting splits (season cumulative).
   */
  "handedness_advantage",
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
