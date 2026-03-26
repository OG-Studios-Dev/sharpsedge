// ============================================================
// Goose AI Picks Model — NBA live context enricher
//
// Purpose: Pull real-time ESPN roster/injury data and produce
// NBAContextHints — a structured set of signals and metadata
// derived from live context (injuries, lineup status, minutes
// projections) that can auto-tag additional signals on a pick
// BEFORE the feature scorer runs.
//
// Design:
//   1. Given a player name + team + opponent (all optional), fetch
//      ESPN roster for both teams and check injury/status flags.
//   2. Return an NBAContextHints object with detected signals and
//      a structured snapshot for auditability.
//   3. Caller (generator.ts) merges these signals into the candidate
//      signals list before calling scoreNBAFeaturesWithSnapshot().
//
// This module is server-side only (calls ESPN / BallDontLie APIs).
// All fetches go through the cached layer in nba-api.ts so repeated
// calls in a single generation run are cheap.
//
// Limitations:
//   - Injury data quality depends on ESPN roster freshness (~1h cache).
//   - Minutes projections are estimated from season averages, not actual
//     pre-game notes (no free API provides those reliably).
//   - Player name matching is fuzzy (last name + first initial) to handle
//     minor ESPN vs. our pick label formatting differences.
// ============================================================

import {
  getNBATeamRosterEntries,
  getRecentNBAGames,
  getNBABoxscore,
  type NBARosterPlayer,
  type NBAGame,
} from "@/lib/nba-api";
import {
  getNBATeamDefenseContext,
  getNBAMatchupPaceContext,
  type NBADefenseStatKey,
} from "@/lib/nba-matchup";
import { findBestFuzzyNameMatch } from "@/lib/name-match";

// ── Types ─────────────────────────────────────────────────────

/**
 * Injury severity tier — derived from ESPN injuryStatus strings.
 * "out"       → Confirmed Out, IR, Suspended, DNP
 * "doubtful"  → Doubtful (75%+ chance of missing)
 * "questionable" → Questionable, Day-to-Day
 * "probable"  → Probable (likely to play)
 * "active"    → No injury flag / confirmed active
 * "unknown"   → Could not determine
 */
export type InjurySeverity =
  | "out"
  | "doubtful"
  | "questionable"
  | "probable"
  | "active"
  | "unknown";

/**
 * Structured injury context for a specific player.
 */
export type PlayerInjuryContext = {
  name: string;
  position: string;
  injuryStatus: string | null;
  severity: InjurySeverity;
  /** True if this player is key enough that their absence could boost a teammate's usage */
  isKeyPlayer: boolean;
};

/**
 * Live NBA context hints derived from roster/injury data and real boxscore statistics.
 * Attached to picks at generation time for enriching signal tags.
 */
export type NBAContextHints = {
  /** Extra signals that were auto-detected from live context */
  auto_signals: string[];

  /** Whether the target player was confirmed active/starter */
  player_confirmed_active: boolean | null;

  /** Whether any key teammate is out (triggers usage_surge potential) */
  key_teammate_out: boolean;

  /** Names of key teammates who are out/doubtful */
  key_teammates_out: string[];

  /** Whether the opponent has any key players out (could affect team ML / spread) */
  opponent_key_out: boolean;

  /** Names of key opponent players out */
  opponent_key_players_out: string[];

  /** The target player's injury severity (null if player not found) */
  player_severity: InjurySeverity | null;

  /** Whether we found the target player in the ESPN roster */
  player_found: boolean;

  /** Estimated minutes tier based on position role: "starter" | "rotation" | "bench" | "unknown" */
  estimated_minutes_tier: "starter" | "rotation" | "bench" | "unknown";

  /** ISO timestamp of when this context was fetched */
  fetched_at: string;

  /** Any errors/warnings from the fetch (non-fatal) */
  warnings: string[];

  // ── Real numeric features (from ESPN boxscore + league dataset) ────────────

  /**
   * Opponent's DvP rank for this position group + stat key.
   * 1=best defense (hardest to beat), 30=worst defense (most favorable).
   * Auto-derived from cached ESPN boxscore data via getLeagueDataset().
   */
  opponent_dvp_rank: number | null;

  /**
   * Average stat allowed per game by the opponent to this position group.
   * e.g. for a guard points prop: avg pts allowed to guards per game.
   */
  opponent_dvp_avg_allowed: number | null;

  /**
   * Pace proxy rank for the player's team (by average points scored per game).
   * 1 = highest-scoring team = best pace for counting stat props.
   */
  team_pace_rank: number | null;

  /**
   * Pace proxy rank for the opponent.
   * When both teams rank in top 10 scoring, expect more total possessions.
   */
  opponent_pace_rank: number | null;

  /**
   * Whether this game is a high-pace matchup (both teams rank top 10 by scoring avg).
   * Derived from real ESPN data — not reasoning-text patterns.
   */
  high_pace_game: boolean;

  /**
   * Player's average minutes over last 5 qualifying games (≥15 min threshold).
   * Null when fewer than 3 qualifying games found.
   */
  player_avg_minutes_l5: number | null;

  /**
   * Player's rolling average for the primary prop stat over last 5 qualifying games.
   * e.g. points avg for a points prop, rebounds avg for a rebounds prop.
   */
  player_avg_stat_l5: number | null;

  /**
   * Player's hit rate over the pick line in last 5 qualifying games (0.0–1.0).
   * Only populated when a propLine is passed in.
   */
  player_l5_hit_rate: number | null;

  // ── Data provenance ────────────────────────────────────────────────────────
  /**
   * Ordered list of data fetches performed to build these hints.
   * Traces the exact origin → ingestion path for every data point in the snapshot.
   * Passed through to NBAFeatureSnapshot.data_source_chain.
   */
  data_source_chain: import("@/lib/goose-model/nba-features").DataSourceEntry[];
};

// ── Injury severity classifier ─────────────────────────────────

const OUT_PATTERNS = /\b(?:out|ir|injured reserve|suspended|dnp|did not play|inactive|ruled out)\b/i;
const DOUBTFUL_PATTERNS = /\bdoubtful\b/i;
const QUESTIONABLE_PATTERNS = /\b(?:questionable|day[\s-]?to[\s-]?day|dtd)\b/i;
const PROBABLE_PATTERNS = /\bprobable\b/i;

function classifyInjurySeverity(status: string | null | undefined): InjurySeverity {
  if (!status) return "active";
  if (OUT_PATTERNS.test(status)) return "out";
  if (DOUBTFUL_PATTERNS.test(status)) return "doubtful";
  if (QUESTIONABLE_PATTERNS.test(status)) return "questionable";
  if (PROBABLE_PATTERNS.test(status)) return "probable";
  return "active"; // any other status (e.g. "Available") = active
}

/**
 * Key positions whose absence typically creates usage/minutes bumps.
 * Guards and forwards who take the most shots/touches.
 */
const KEY_POSITIONS = new Set(["G", "F", "G-F", "F-G", "PG", "SG", "SF", "PF", "SF-SG", "PG-SG"]);

function isKeyPlayer(player: NBARosterPlayer): boolean {
  return KEY_POSITIONS.has(player.position.toUpperCase());
}

// ── Name matching helper ──────────────────────────────────────

/**
 * Fuzzy player name match:
 *   1. Exact match (case-insensitive)
 *   2. Last name + first initial match (handles "LeBron James" vs "L. James")
 *   3. Last name only match (loose fallback)
 */
function nameMatches(rosterName: string, pickName: string): boolean {
  const a = rosterName.toLowerCase().trim();
  const b = pickName.toLowerCase().trim();

  if (a === b) return true;

  // Parse last name and first initial
  const partsA = a.split(/\s+/);
  const partsB = b.split(/\s+/);

  const lastA = partsA[partsA.length - 1];
  const lastB = partsB[partsB.length - 1];

  if (lastA !== lastB) return false; // last names must match

  // Both have multiple parts: check first initial matches
  if (partsA.length >= 2 && partsB.length >= 2) {
    return partsA[0][0] === partsB[0][0];
  }

  // Last name only match (loose)
  return true;
}

// ── Position group normalizer ─────────────────────────────────

/**
 * Normalize a player's position string to the G/F/C groups used in DvP rankings.
 * Mirrors the logic in nba-matchup.ts (private there — duplicated here intentionally).
 */
function normalizePositionGroup(position: string): "G" | "F" | "C" {
  const upper = String(position || "").toUpperCase();
  if (upper.includes("C")) return "C";
  if (upper.includes("F")) return "F";
  return "G";
}

// ── Minutes tier classifier ───────────────────────────────────

/**
 * Classify a player's estimated minutes tier from their position.
 * We use position as a proxy (no free API gives pre-game minute projections).
 * Starters at core positions typically log 28–36 min.
 */
function estimateMinutesTier(
  player: NBARosterPlayer | null,
): "starter" | "rotation" | "bench" | "unknown" {
  if (!player) return "unknown";
  const pos = player.position.toUpperCase();
  const corePositions = new Set(["PG", "SG", "SF", "PF", "C", "G", "F"]);
  if (corePositions.has(pos)) return "starter";
  if (pos.includes("-")) return "rotation"; // dual-position often rotation player
  return "unknown";
}

// ── Main enricher ─────────────────────────────────────────────

/**
 * Map a prop type string to the DvP stat key used in nba-matchup's league dataset.
 * Returns a best-effort mapping for known prop types.
 */
function propTypeToDvpStatKey(propType?: string | null): NBADefenseStatKey {
  const pt = (propType ?? "").toLowerCase();
  if (pt.includes("rebound")) return "rebounds";
  if (pt.includes("assist")) return "assists";
  if (pt.includes("3") || pt.includes("three")) return "threes";
  if (pt.includes("block")) return "blocks";
  if (pt.includes("steal")) return "steals";
  return "points"; // default: points (most common prop type)
}

/**
 * Fetch live NBA context for a pick and return NBAContextHints.
 *
 * Called once per NBA candidate in the generator pipeline.
 * All network fetches go through the cached ESPN layer, so repeated
 * calls for the same team in a single generation run are fast.
 *
 * @param playerName      Target player name (from pick). Null for team picks.
 * @param teamAbbrev      Team abbreviation (e.g. "LAL", "BOS")
 * @param opponentAbbrev  Opponent team abbreviation (optional)
 * @param propType        Prop type string for DvP stat key lookup (e.g. "Points", "Rebounds")
 * @param propLine        The pick's prop line value (for L5 hit rate computation)
 */
export async function fetchNBAContextHints(
  playerName: string | null | undefined,
  teamAbbrev: string | null | undefined,
  opponentAbbrev: string | null | undefined,
  propType?: string | null,
  propLine?: number | null,
): Promise<NBAContextHints> {
  const warnings: string[] = [];
  const autoSignals: string[] = [];
  const fetchedAt = new Date().toISOString();
  // Track every data fetch for the provenance chain
  const dataSourceChain: import("@/lib/goose-model/nba-features").DataSourceEntry[] = [];

  let teamRoster: NBARosterPlayer[] = [];
  let opponentRoster: NBARosterPlayer[] = [];

  // Fetch rosters in parallel where possible
  const teamAbbrevNorm = teamAbbrev?.toUpperCase();
  const oppAbbrevNorm = opponentAbbrev?.toUpperCase();

  const rosterFetchStart = Date.now();
  const [teamResult, oppResult] = await Promise.allSettled([
    teamAbbrevNorm ? getNBATeamRosterEntries(teamAbbrevNorm) : Promise.resolve([]),
    oppAbbrevNorm ? getNBATeamRosterEntries(oppAbbrevNorm) : Promise.resolve([]),
  ]);

  if (teamResult.status === "fulfilled") {
    teamRoster = teamResult.value;
    dataSourceChain.push({
      source: "espn_roster",
      context: `team=${teamAbbrevNorm ?? "unknown"} players=${teamRoster.length}`,
      cached: true, // getNBATeamRosterEntries uses 1h cache; assume cache on warm runs
      fetched_at: fetchedAt,
      url: `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/roster`,
    });
  } else {
    warnings.push(`Could not fetch roster for ${teamAbbrevNorm ?? "unknown"}: ${teamResult.reason}`);
    dataSourceChain.push({
      source: "espn_roster",
      context: `team=${teamAbbrevNorm ?? "unknown"} FAILED`,
      cached: false,
      fetched_at: fetchedAt,
    });
  }

  if (oppResult.status === "fulfilled") {
    opponentRoster = oppResult.value;
    if (oppAbbrevNorm) {
      dataSourceChain.push({
        source: "espn_roster",
        context: `team=${oppAbbrevNorm} players=${opponentRoster.length}`,
        cached: true,
        fetched_at: fetchedAt,
        url: `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/roster`,
      });
    }
  } else {
    warnings.push(`Could not fetch roster for ${oppAbbrevNorm ?? "unknown"}: ${oppResult.reason}`);
    if (oppAbbrevNorm) {
      dataSourceChain.push({
        source: "espn_roster",
        context: `team=${oppAbbrevNorm} FAILED`,
        cached: false,
        fetched_at: fetchedAt,
      });
    }
  }

  // ── Target player lookup ────────────────────────────────────
  let targetPlayer: NBARosterPlayer | null = null;
  let playerFound = false;
  let playerSeverity: InjurySeverity | null = null;

  if (playerName && teamRoster.length > 0) {
    targetPlayer = teamRoster.find((p) => nameMatches(p.name, playerName)) ?? null;
    playerFound = targetPlayer !== null;
    if (targetPlayer) {
      playerSeverity = classifyInjurySeverity(targetPlayer.injuryStatus);
    } else {
      warnings.push(`Player "${playerName}" not found in ${teamAbbrevNorm} roster`);
    }
  }

  // ── Key teammate injury detection ──────────────────────────
  const keyTeammatesOut: string[] = [];
  for (const p of teamRoster) {
    if (targetPlayer && p.name === targetPlayer.name) continue; // skip target player
    const severity = classifyInjurySeverity(p.injuryStatus);
    if ((severity === "out" || severity === "doubtful") && isKeyPlayer(p)) {
      keyTeammatesOut.push(p.name);
    }
  }

  // ── Opponent key player injury detection ───────────────────
  const opponentKeyPlayersOut: string[] = [];
  for (const p of opponentRoster) {
    const severity = classifyInjurySeverity(p.injuryStatus);
    if ((severity === "out" || severity === "doubtful") && isKeyPlayer(p)) {
      opponentKeyPlayersOut.push(p.name);
    }
  }

  const keyTeammateOut = keyTeammatesOut.length > 0;
  const opponentKeyOut = opponentKeyPlayersOut.length > 0;

  // ── Estimated minutes tier ─────────────────────────────────
  const estimatedMinutesTier = estimateMinutesTier(targetPlayer);

  // ── Auto-signal detection ──────────────────────────────────

  // 1. injury_news: any key player is out/questionable
  const hasInjuryNews =
    (playerSeverity && playerSeverity !== "active" && playerSeverity !== "unknown") ||
    keyTeammateOut ||
    opponentKeyOut;
  if (hasInjuryNews) {
    autoSignals.push("injury_news");
  }

  // 2. usage_surge: target player's key teammates are out → they absorb the load
  if (keyTeammateOut && playerName) {
    autoSignals.push("usage_surge");
  }

  // 3. lineup_change: key teammate status changed (out or doubtful counts as lineup change)
  if (keyTeammateOut) {
    autoSignals.push("lineup_change");
  }

  // 4. minutes_floor: player is confirmed active starter with no injury flag
  if (
    playerFound &&
    playerSeverity === "active" &&
    estimatedMinutesTier === "starter"
  ) {
    autoSignals.push("minutes_floor");
  }

  // 5. home_court_edge is handled at the reasoning-text level by the signal tagger,
  //    not here (we don't have home/away context in the enricher).

  // ── Real numeric features: DvP + pace from league dataset ─────────────────
  // These use the same cached ESPN boxscore data as the matchup page.
  // All fetches are wrapped in try/catch so any failure only adds a warning.

  const dvpStatKey = propTypeToDvpStatKey(propType);
  const targetPosition = targetPlayer?.position ?? null;
  const positionGroup = normalizePositionGroup(targetPosition ?? "G");

  let opponentDvpRank: number | null = null;
  let opponentDvpAvgAllowed: number | null = null;
  let teamPaceRank: number | null = null;
  let opponentPaceRank: number | null = null;
  let highPaceGame = false;

  // Only fetch if we have both team + opponent info (avoids wasted calls for partial data)
  if (teamAbbrevNorm && oppAbbrevNorm) {
    const dvpPaceStart = new Date().toISOString();
    const [dvpResult, paceResult] = await Promise.allSettled([
      getNBATeamDefenseContext(oppAbbrevNorm, positionGroup, dvpStatKey),
      getNBAMatchupPaceContext(teamAbbrevNorm, oppAbbrevNorm),
    ]);

    if (dvpResult.status === "fulfilled") {
      opponentDvpRank = dvpResult.value.dvpRank;
      opponentDvpAvgAllowed = dvpResult.value.dvpAvgAllowed;
      dataSourceChain.push({
        source: "espn_boxscore_dvp",
        context: `opp=${oppAbbrevNorm} posGroup=${positionGroup} stat=${dvpStatKey} rank=${opponentDvpRank ?? "n/a"} avgAllowed=${opponentDvpAvgAllowed ?? "n/a"}`,
        cached: true, // league dataset is computed once and cached in nba-matchup.ts
        fetched_at: dvpPaceStart,
        url: `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard (aggregated)`,
      });
    } else {
      warnings.push(`DvP context fetch failed for ${oppAbbrevNorm}: ${dvpResult.reason}`);
      dataSourceChain.push({
        source: "espn_boxscore_dvp",
        context: `opp=${oppAbbrevNorm} FAILED`,
        cached: false,
        fetched_at: dvpPaceStart,
      });
    }

    if (paceResult.status === "fulfilled") {
      teamPaceRank = paceResult.value.teamPaceRank;
      opponentPaceRank = paceResult.value.opponentPaceRank;
      // High-pace game: both teams rank in top 10 by scoring avg (1=highest scorer)
      highPaceGame =
        typeof teamPaceRank === "number" &&
        typeof opponentPaceRank === "number" &&
        teamPaceRank <= 10 &&
        opponentPaceRank <= 10;
      dataSourceChain.push({
        source: "espn_boxscore_pace",
        context: `team=${teamAbbrevNorm} rank=${teamPaceRank ?? "n/a"} opp=${oppAbbrevNorm} rank=${opponentPaceRank ?? "n/a"} highPace=${highPaceGame}`,
        cached: true,
        fetched_at: dvpPaceStart,
        url: `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard (aggregated)`,
      });
    } else {
      warnings.push(`Pace context fetch failed: ${paceResult.reason}`);
      dataSourceChain.push({
        source: "espn_boxscore_pace",
        context: `team=${teamAbbrevNorm} opp=${oppAbbrevNorm} FAILED`,
        cached: false,
        fetched_at: dvpPaceStart,
      });
    }
  }

  // 6. dvp_advantage: opponent ranks 23rd or worse at defending this position/stat
  //    Triggered from REAL data, not text patterns — more reliable signal source
  if (opponentDvpRank !== null && opponentDvpRank >= 23) {
    autoSignals.push("dvp_advantage");
  }

  // 7. pace_matchup: both teams are in the top 10 scoring teams (high-volume game)
  if (highPaceGame) {
    autoSignals.push("pace_matchup");
  }

  // ── Player rolling averages from recent boxscores ─────────────────────────
  // Compute L5 avg minutes and the primary stat for this prop type.
  // Uses the same cached ESPN boxscore data as the stats engine.
  let playerAvgMinutesL5: number | null = null;
  let playerAvgStatL5: number | null = null;
  let playerL5HitRate: number | null = null;

  if (playerName && teamAbbrevNorm) {
    const statFetchStart = new Date().toISOString();
    try {
      const recentGames = await getRecentNBAGames(21);
      const teamGames = recentGames
        .filter(
          (g: NBAGame) =>
            g.status === "Final" &&
            (g.homeTeam.abbreviation === teamAbbrevNorm || g.awayTeam.abbreviation === teamAbbrevNorm),
        )
        .slice(0, 8); // check up to 8 games to find 5 qualifying

      const statLogs: { minutes: number; stat: number; gameId: string }[] = [];
      const boxscoreGameIds: string[] = [];

      for (const game of teamGames) {
        if (statLogs.length >= 5) break;
        try {
          const box = await getNBABoxscore(game.id);
          boxscoreGameIds.push(game.id);
          const isHome = game.homeTeam.abbreviation === teamAbbrevNorm;
          const teamPlayers = isHome ? box.home : box.away;
          const p = findBestFuzzyNameMatch(teamPlayers, playerName, (pl) => pl.name);
          if (!p) continue;
          const mins = parseFloat(p.minutes) || 0;
          if (mins < 15) continue; // skip DNP / garbage time

          // Map prop type to the boxscore stat
          let statVal = 0;
          const pt = (propType ?? "").toLowerCase();
          if (pt.includes("rebound")) statVal = p.rebounds;
          else if (pt.includes("assist")) statVal = p.assists;
          else if (pt.includes("3") || pt.includes("three")) {
            statVal = parseInt(String(p.threePointers || "0").split("-")[0], 10) || 0;
          } else if (pt.includes("block")) statVal = p.blocks;
          else if (pt.includes("steal")) statVal = p.steals;
          else statVal = p.points; // default: points

          statLogs.push({ minutes: mins, stat: statVal, gameId: game.id });
        } catch {
          // skip failed boxscore
        }
      }

      if (statLogs.length >= 3) {
        playerAvgMinutesL5 = Number(
          (statLogs.reduce((s, g) => s + g.minutes, 0) / statLogs.length).toFixed(1),
        );
        playerAvgStatL5 = Number(
          (statLogs.reduce((s, g) => s + g.stat, 0) / statLogs.length).toFixed(1),
        );

        // L5 hit rate: fraction of games where player exceeded the prop line
        if (typeof propLine === "number") {
          const hits = statLogs.filter((g) => g.stat > propLine).length;
          playerL5HitRate = Number((hits / statLogs.length).toFixed(3));

          // Auto-tag recent trend signals from real data when > 60% hit rate in L5
          if (playerL5HitRate >= 0.6 && !autoSignals.includes("recent_trend_over")) {
            autoSignals.push("recent_trend_over");
          } else if (playerL5HitRate <= 0.4 && !autoSignals.includes("recent_trend_under")) {
            autoSignals.push("recent_trend_under");
          }
        }

        // Upgrade minutes tier if real data suggests starter-level minutes
        if (playerAvgMinutesL5 >= 28 && estimatedMinutesTier !== "starter") {
          autoSignals.push("minutes_floor");
        }
      }

      dataSourceChain.push({
        source: "espn_boxscore_player_stats",
        context: `player=${playerName} team=${teamAbbrevNorm} gamesChecked=${teamGames.length} logsFound=${statLogs.length} avgMin=${playerAvgMinutesL5 ?? "n/a"} avgStat=${playerAvgStatL5 ?? "n/a"} l5HitRate=${playerL5HitRate ?? "n/a"} propType=${propType ?? "points"} gameIds=[${boxscoreGameIds.slice(0, 5).join(",")}]`,
        cached: true, // espn boxscore uses 15min cache
        fetched_at: statFetchStart,
        url: `site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={id}`,
      });
    } catch (err) {
      warnings.push(`Player stat fetch failed for ${playerName}: ${String(err)}`);
      dataSourceChain.push({
        source: "espn_boxscore_player_stats",
        context: `player=${playerName} team=${teamAbbrevNorm} FAILED: ${String(err)}`,
        cached: false,
        fetched_at: statFetchStart,
      });
    }
  }

  // Final provenance entry — marks this enricher run complete
  dataSourceChain.push({
    source: "nba_context_enricher",
    context: `player=${playerName ?? "n/a"} team=${teamAbbrevNorm ?? "n/a"} opp=${oppAbbrevNorm ?? "n/a"} autoSignals=[${Array.from(new Set(autoSignals)).join(",")}] warnings=${warnings.length}`,
    cached: false,
    fetched_at: new Date().toISOString(),
  });

  return {
    auto_signals: Array.from(new Set(autoSignals)),
    player_confirmed_active: playerFound ? playerSeverity === "active" || playerSeverity === "probable" : null,
    key_teammate_out: keyTeammateOut,
    key_teammates_out: keyTeammatesOut,
    opponent_key_out: opponentKeyOut,
    opponent_key_players_out: opponentKeyPlayersOut,
    player_severity: playerSeverity,
    player_found: playerFound,
    estimated_minutes_tier: estimatedMinutesTier,
    fetched_at: fetchedAt,
    warnings,
    // Real numeric features
    opponent_dvp_rank: opponentDvpRank,
    opponent_dvp_avg_allowed: opponentDvpAvgAllowed,
    team_pace_rank: teamPaceRank,
    opponent_pace_rank: opponentPaceRank,
    high_pace_game: highPaceGame,
    player_avg_minutes_l5: playerAvgMinutesL5,
    player_avg_stat_l5: playerAvgStatL5,
    player_l5_hit_rate: playerL5HitRate,
    data_source_chain: dataSourceChain,
  };
}

/**
 * Lightweight no-op hints — used when context fetch is skipped
 * (e.g. non-NBA picks, or when player/team info is missing).
 */
export function emptyNBAContextHints(): NBAContextHints {
  return {
    auto_signals: [],
    player_confirmed_active: null,
    key_teammate_out: false,
    key_teammates_out: [],
    opponent_key_out: false,
    opponent_key_players_out: [],
    player_severity: null,
    player_found: false,
    estimated_minutes_tier: "unknown",
    fetched_at: new Date().toISOString(),
    warnings: [],
    // Numeric fields — null = not available
    opponent_dvp_rank: null,
    opponent_dvp_avg_allowed: null,
    team_pace_rank: null,
    opponent_pace_rank: null,
    high_pace_game: false,
    player_avg_minutes_l5: null,
    player_avg_stat_l5: null,
    player_l5_hit_rate: null,
    data_source_chain: [],
  };
}
