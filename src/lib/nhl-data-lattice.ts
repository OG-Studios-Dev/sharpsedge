/**
 * NHL Data Lattice — canonical schema and provenance types
 *
 * PURPOSE: Define the shared data contracts that all NHL ingestion,
 * analysis, output, and learning layers must use. If you ingest NHL
 * data, use these types. If you analyze NHL outcomes, use these types.
 * If you train a model on NHL picks, read from these types.
 *
 * This file is pure types + constants — zero runtime side effects.
 *
 * ─── Architecture ───────────────────────────────────────────────────
 *
 * Ingestion layer  → NHLIngestRecord (audit trail per fetch)
 * Context layer    → NHLContextBoardGame (per-game matchup board)
 * Feature layer    → NHLFeatureSnapshot (frozen at pick-generation time)
 * Outcome layer    → NHLOutcomeRecord (graded post-game result)
 * Backtest layer   → NHLBacktestRun + NHLBacktestResult (multi-season)
 *
 * ─── Source Map (what is available vs blocked) ──────────────────────
 *
 * SOURCE                 | RAIL                          | STATUS
 * ──────────────────────────────────────────────────────────────────
 * NHL schedule/standings | api-web.nhle.com/v1           | LIVE ✅
 * NHL PP/PK team stats   | api.nhle.com/stats/rest       | LIVE ✅
 * NHL goalie EV/PP/SH SV%| api.nhle.com/stats/rest       | LIVE ✅
 * NHL goalie HDSV%       | nhl-shot-events.ts (PBP agg.) | LIVE ✅ (2026-03-27)
 *   (high-danger zone)   | api-web.nhle.com/v1 PBP       | last 10 games, x/y coords
 * MoneyPuck xGoals%      | GitHub mirror (daily CSV)     | LIVE ✅ (30-team aggregate)
 * MoneyPuck HDCF%/HDSA%  | nhl-shot-events.ts (PBP agg.) | LIVE ✅ (2026-03-27)
 *   (zone danger %)      | api-web.nhle.com/v1 PBP       | replaces blocked MP path
 * Shot location / danger | nhl-shot-events.ts            | LIVE ✅ (2026-03-27)
 *   zone xG              | aggregateTeamShotProfile()    | HD/MD/LD + xG model
 * Injury/availability    | nhl.com team news links       | IMPROVED ✅ (2026-03-27)
 *   (player-level)       | + nhl-roster-api injuryStatus | IR/DTD structured; healthy scratches still blocked
 * Corsi/Fenwick (CF%/FF%)| nhl-shot-events.ts (PBP agg.) | LIVE ✅ (derived CF%)
 * Multiple seasons       | club-stats-season endpoint    | LIVE ✅ (any season)
 * Backtest outcomes      | Supabase goose_model_picks    | LIVE ✅ (this season+)
 *
 * ─── Source Gap Blockers ────────────────────────────────────────────
 *
 * 1. HIGH-DANGER ZONE SV% (HDSV%): ✅ RESOLVED 2026-03-27
 *    Implemented via nhl-shot-events.ts → aggregateTeamShotProfile().
 *    Source: api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play
 *    Each shot event has x/y coordinates + shotType + situationCode.
 *    Zone thresholds (NST convention): HD ≤ 20ft, MD ≤ 55ft, LD > 55ft.
 *    HDSV% is computed from HD shots on goal against / saves.
 *    Cache: 24hr per game PBP (data immutable after completion), 60min per profile.
 *
 * 2. ZONE-LEVEL xG: ✅ RESOLVED 2026-03-27
 *    Implemented via nhl-shot-events.ts → computeShotXG().
 *    xG model: logistic regression on distance + angle + shot type + situation.
 *    Coefficients aligned with MoneyPuck published methodology.
 *    xGF% per team computed from last 10 games PBP.
 *    New signals: shot_danger_edge (HDCF% diff ≥ 3.0), opponent_goalie_hd_weakness.
 *
 * 3. INJURY CERTAINTY: ✅ IMPROVED 2026-03-27
 *    Now uses NHL roster API (api-web.nhle.com/v1/roster/{abbrev}/current).
 *    The injuryStatus field on each player returns IR, DTD, IR-NR, LTIR, etc.
 *    IR/IR-NR/LTIR → confirmed_out (high certainty). DTD → day_to_day (uncertain).
 *    STILL BLOCKED: healthy scratches (coach decisions), day-of-game availability.
 *    Uncertainty is explicit in all outputs: certainty tier, likelyUnavailable flag,
 *    and railNote surface limitations to consumers. Never treat absent status as
 *    confirmed availability. Pre-game lineup (1hr pre) remains the only true source
 *    for day-of-game availability.
 *
 * 4. SHOT AGGREGATE PERSISTENCE: ✅ NEW 2026-03-27
 *    Team and per-player shot profiles now persist to Supabase (nhl_shot_aggregates,
 *    nhl_player_shot_profiles tables). Architecture: L1 in-memory → L2 Supabase →
 *    L3 fresh PBP computation. Staleness: rolling profiles 3hr, full_season 24hr.
 *    aggregateTeamShotProfileWithStorage() is the new primary entry point.
 *
 * 5. PER-PLAYER xG ATTRIBUTION: ✅ NEW 2026-03-27
 *    aggregatePlayerShotProfiles(teamAbbrev, limit) computes per-player shot profiles
 *    from NHL PBP play-by-play. shootingPlayerId is available on all shot events.
 *    Player names resolved from NHL roster API. Returns sorted by xG/game desc.
 *    Fields: totalShots, SOG, goals, HD/MD/LD breakdown, xG total, xG/game, xG/shot,
 *    HD xG, shot type distribution, 5v5/PP splits. Persisted to nhl_player_shot_profiles.
 */

// ────────────────────────────────────────────────────────────────────
// Provenance / audit types
// ────────────────────────────────────────────────────────────────────

/**
 * Audit record for a single NHL data ingestion event.
 * Every time we fetch from an NHL data source, this record captures
 * what was fetched, when, and how healthy the source was.
 */
export type NHLIngestRecord = {
  /** Unique ingest event ID (uuid or timestamp-key) */
  ingestId: string;
  /** ISO timestamp when the fetch started */
  fetchedAt: string;
  /** ISO timestamp when the fetch completed */
  completedAt: string;
  /** NHL season string (e.g. "20252026") */
  season: string;
  /** Date this ingest covers (YYYY-MM-DD) */
  date: string;
  /** Source system being fetched */
  source: NHLDataSource;
  /** HTTP status code or "cache_hit" */
  status: number | "cache_hit" | "error";
  /** Error message if status is "error" */
  error: string | null;
  /** Number of entities returned (teams, games, players, etc.) */
  entityCount: number;
  /** Whether the data was considered degraded (partial/stale) */
  degraded: boolean;
  /** Free-text degradation reason */
  degradationReason: string | null;
  /** Milliseconds to fetch */
  latencyMs: number;
};

export type NHLDataSource =
  | "nhl-schedule"
  | "nhl-standings"
  | "nhl-club-schedule"
  | "nhl-gamecenter-landing"
  | "nhl-gamecenter-boxscore"
  | "nhl-gamecenter-pbp"         // play-by-play (shot x/y coordinates, event types)
  | "nhl-roster"                 // also provides injuryStatus for IR/DTD players
  | "nhl-player-game-log"
  | "nhl-stats-rest-pp"
  | "nhl-stats-rest-pk"
  | "nhl-stats-rest-goalie-strength"
  | "moneypuck-mirror"
  | "moneypuck-bundled"
  | "nhl-team-news"
  | "nhl-pbp-aggregate"          // aggregated from multiple PBP game files (team profiles)
  | "nhl-pbp-player-aggregate"   // per-player xG/shot aggregates from PBP
  | "nhl-shot-aggregate-db";     // persistent Supabase storage for shot aggregates

// ────────────────────────────────────────────────────────────────────
// Multi-season outcome storage
// ────────────────────────────────────────────────────────────────────

/**
 * Graded outcome for a single NHL pick.
 * Stored after game completion — references the frozen NHLFeatureSnapshot
 * that was captured at generation time.
 *
 * This is the primary record for model learning and backtesting.
 * Maps 1:1 to a GooseModelPick row in Supabase (by pickId).
 */
export type NHLOutcomeRecord = {
  /** References GooseModelPick.id */
  pickId: string;
  /** NHL season (e.g. "20252026") */
  season: string;
  /** Game date (YYYY-MM-DD) */
  gameDate: string;
  /** NHL game ID */
  gameId: string | null;
  /** Away team abbrev */
  awayTeam: string;
  /** Home team abbrev */
  homeTeam: string;
  /** Team picked */
  team: string;
  /** Result of the pick */
  result: "win" | "loss" | "push" | "void";
  /** Final score at game end */
  finalScore: { home: number; away: number } | null;
  /** Signals present at generation time (from pick_snapshot) */
  signalsPresent: string[];
  /** NHL feature snapshot frozen at generation time */
  nhlFeatureSnapshot: NHLPickFeatureReference;
  /** When outcome was graded */
  gradedAt: string;
};

/**
 * Compact reference to the NHL-specific features present at pick time.
 * Extracted from pick_snapshot.factors.nhl_features for fast query/analysis.
 */
export type NHLPickFeatureReference = {
  /** PP efficiency differential at pick time */
  ppEfficiencyDifferential: number | null;
  /** Net special teams differential at pick time */
  netSTDifferential: number | null;
  /** MoneyPuck xGoals% differential (team - opp) */
  xGoalsPctDifferential: number | null;
  /** Whether opponent ran a backup goalie */
  goalieNewsActive: boolean;
  /** Whether team was on back-to-back */
  backToBackActive: boolean;
  /** Whether team had 3-in-4-day fatigue */
  threeInFourActive: boolean;
  /** Opponent goalie quality tier */
  opponentGoalieQuality: "elite" | "average" | "weak" | "unknown";
  /** Team rest days */
  teamRestDays: number | null;
  /** Team playoff pressure tier */
  teamPlayoffPressure: "high" | "medium" | "low" | "none";
};

// ────────────────────────────────────────────────────────────────────
// Backtest schema
// ────────────────────────────────────────────────────────────────────

/**
 * Configuration for a multi-season NHL backtest run.
 * A backtest replays historical picks against stored outcomes to
 * evaluate signal priors, feature weights, or model configurations.
 */
export type NHLBacktestConfig = {
  /** Human-readable name for this backtest run */
  name: string;
  /** Seasons to include (e.g. ["20232024", "20242025", "20252026"]) */
  seasons: string[];
  /** Date range filter within seasons */
  dateRange?: { from: string; to: string };
  /** Filter to specific signals (null = all signals) */
  signalFilter?: string[];
  /** Minimum edge % threshold for picks to include */
  minEdgePct?: number;
  /** Experiment tag filter (null = all) */
  experimentTag?: string | null;
  /**
   * Feature snapshot fields to stratify results by.
   * e.g. ["ppEfficiencyDifferential", "goalieNewsActive"]
   */
  stratifyBy?: Array<keyof NHLPickFeatureReference>;
};

/**
 * Results for a single backtest stratum (group of picks sharing a feature value).
 */
export type NHLBacktestStratum = {
  /** What this stratum represents (e.g. "goalieNewsActive=true") */
  label: string;
  totalPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  /** Average edge at capture for picks in this stratum */
  avgEdgeAtCapture: number | null;
  /** Average odds at capture */
  avgOddsAtCapture: number | null;
  /** ROI estimate (units won / units risked) */
  roiEstimate: number | null;
};

/**
 * Full backtest run result.
 * Covers all seasons in config, broken down by stratum.
 */
export type NHLBacktestResult = {
  /** Reference to the config that produced this result */
  config: NHLBacktestConfig;
  /** When this backtest was run */
  runAt: string;
  /** Total picks evaluated */
  totalPicks: number;
  /** Overall win rate */
  overallWinRate: number;
  /** Overall ROI estimate */
  overallROI: number | null;
  /** Strata (one per stratifyBy dimension value) */
  strata: NHLBacktestStratum[];
  /** Seasons with insufficient data (< 10 graded picks) */
  degradedSeasons: string[];
  /** Signals with fewest appearances (candidates for prior tuning) */
  underrepresentedSignals: Array<{ signal: string; appearances: number }>;
  /** Source provenance for each season's data */
  seasonProvenance: Array<{
    season: string;
    picksGraded: number;
    picksVoid: number;
    dataSource: "supabase" | "local-file" | "unavailable";
  }>;
};

// ────────────────────────────────────────────────────────────────────
// Shot danger zone schema (blocked / future)
// ────────────────────────────────────────────────────────────────────

/**
 * Zone-level shot danger context — LIVE ✅ (2026-03-27)
 *
 * Source: api-web.nhle.com/v1/gamecenter/{gameId}/play-by-play
 * Implemented in nhl-shot-events.ts → aggregateTeamShotProfile()
 *
 * Three tiers follow Natural Stat Trick convention:
 *   High danger  = ≤ 20 ft to net (slot area, crease, directly in front)
 *   Medium danger = 20–55 ft (inside blue line)
 *   Low danger   = > 55 ft (outside blue line, point shots)
 *
 * Coordinates: NHL PBP provides xCoord + yCoord per event.
 * homeTeamDefendingSide per event handles period-to-period side changes.
 * Distance computed via sqrt((netX - x)^2 + (netY - y)^2) where net is at (±89, 0).
 * Data is aggregated from last 10 regular season completed games per team.
 */
export type NHLShotDangerContext = {
  teamAbbrev: string;
  season: string;
  /** Source: "nhl-pbp-aggregate" (implemented) | "moneypuck" | "nst" */
  source: "nhl-pbp-aggregate" | "moneypuck" | "nst";
  asOf: string;
  /** High-danger chances for (HDCF) — team offensive zone pressure */
  hdChancesFor: number | null;
  /** High-danger chances against (HDCA) — team defensive vulnerability */
  hdChancesAgainst: number | null;
  /** HDCF% = hdFor / (hdFor + hdAgainst) — overall danger zone dominance */
  hdChancesForPct: number | null;
  /** High-danger save % for the team's goalie (HDSV%) */
  hdSavePct: number | null;
  /** Medium-danger save % */
  mdSavePct: number | null;
  /** Low-danger save % */
  ldSavePct: number | null;
  /** Score-adjusted HDCF% (removes score state bias) */
  scoreAdjustedHDCFPct: number | null;
};

/**
 * xG-by-zone context for a specific matchup — derived from season averages.
 * Allows the model to estimate expected goals scored given penalty draw rates
 * and zone entry quality.
 *
 * BLOCKED: Requires zone-level data above. Not yet implementable.
 */
export type NHLMatchupXGByZone = {
  gameId: number;
  awayTeam: string;
  homeTeam: string;
  season: string;
  /**
   * Estimated xG for away team based on:
   * - 5v5 xGoalsFor (MoneyPuck aggregate)
   * - PP efficiency vs opponent PK
   * - High-danger chance rate (BLOCKED)
   */
  awayXGEstimate: number | null;
  homeXGEstimate: number | null;
  /** Whether zone-level danger data contributed to the estimate */
  usedZoneData: boolean;
  /** Data provenance for this estimate */
  sources: string[];
  /** Gaps that prevented zone-level calculation */
  sourceGaps: string[];
};

// ────────────────────────────────────────────────────────────────────
// Goalie zone save schema (partial — strength splits available)
// ────────────────────────────────────────────────────────────────────

/**
 * Full goalie context for a game — combining what is available now
 * with the blocked zone-level fields for future implementation.
 */
export type NHLGoalieGameContext = {
  playerId: number;
  goalieFullName: string;
  teamAbbrev: string;
  season: string;
  /** Pre-game status (confirmed / probable / unconfirmed) */
  status: "confirmed" | "probable" | "unconfirmed";
  /** Season record */
  seasonRecord: { wins: number; losses: number; otLosses: number };
  /** Season overall SV% */
  savePct: number | null;
  /** Season GAA */
  gaa: number | null;
  /** Quality tier derived from SV% + GAA */
  qualityTier: "elite" | "average" | "weak" | "unknown";

  // ── Available NOW: Strength-situation splits ─────────────────────
  /** Even-strength SV% (5v5). From NHL stats REST API. */
  evSavePct: number | null;
  /** Power-play SV% (opponent on PP). From NHL stats REST API. */
  ppSavePct: number | null;
  /** Short-handed SV% (team on PP). From NHL stats REST API. */
  shSavePct: number | null;

  // ── Zone-level danger splits — LIVE via nhl-pbp-aggregate ──────────
  /**
   * High-danger SV% — derived from NHL PBP shot x/y coordinates.
   * Source: nhl-shot-events.ts → aggregateTeamShotProfile() (last 10 games).
   * Computed as HD saves / HD shots on goal against.
   */
  hdSavePct: number | null;
  /**
   * Medium-danger SV% — STILL BLOCKED (not computed in current implementation).
   * Could be added to aggregateTeamShotProfile() if needed.
   */
  mdSavePct: number | null;
  /**
   * Low-danger SV% — STILL BLOCKED (not computed in current implementation).
   */
  ldSavePct: number | null;

  /** Source flags for each field */
  provenance: {
    seasonStats: "nhl-api";
    strengthSplits: "nhl-stats-rest" | null;
    zoneSplits: "nhl-pbp-aggregate" | "moneypuck" | "nst" | null;
  };
};

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

/** League-average SV% for current season (approximate). Updated seasonally. */
export const NHL_LEAGUE_AVG_SV_PCT = 0.905;

/** League-average PP% for current season (approximate). */
export const NHL_LEAGUE_AVG_PP_PCT = 0.214;

/** League-average PK% for current season (approximate). */
export const NHL_LEAGUE_AVG_PK_PCT = 0.786;

/**
 * PP efficiency signal threshold.
 * Fires "strong" pp_efficiency_edge when team PP% - opp PK% >= this value.
 */
export const NHL_PP_EFFICIENCY_STRONG_THRESHOLD = 0.04;

/**
 * Minimum game-log sample before trusting rolling averages for player props.
 * Props with fewer than this many games use a penalty to confidence.
 */
export const NHL_PLAYER_PROP_MIN_SAMPLE = 5;

/**
 * Multi-season config for default backtest runs.
 * Update each season start.
 */
export const NHL_BACKTEST_DEFAULT_SEASONS = ["20242025", "20252026"] as const;
export const NHL_CURRENT_SEASON = "20252026";
