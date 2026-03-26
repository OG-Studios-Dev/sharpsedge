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
  type NBARosterPlayer,
} from "@/lib/nba-api";

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
 * Live NBA context hints derived from roster/injury data.
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
 * Fetch live NBA context for a pick and return NBAContextHints.
 *
 * Called once per NBA candidate in the generator pipeline.
 * All network fetches go through the cached ESPN layer, so repeated
 * calls for the same team in a single generation run are fast.
 *
 * @param playerName  Target player name (from pick). Null for team picks.
 * @param teamAbbrev  Team abbreviation (e.g. "LAL", "BOS")
 * @param opponentAbbrev  Opponent team abbreviation (optional)
 */
export async function fetchNBAContextHints(
  playerName: string | null | undefined,
  teamAbbrev: string | null | undefined,
  opponentAbbrev: string | null | undefined,
): Promise<NBAContextHints> {
  const warnings: string[] = [];
  const autoSignals: string[] = [];
  const fetchedAt = new Date().toISOString();

  let teamRoster: NBARosterPlayer[] = [];
  let opponentRoster: NBARosterPlayer[] = [];

  // Fetch rosters in parallel where possible
  const teamAbbrevNorm = teamAbbrev?.toUpperCase();
  const oppAbbrevNorm = opponentAbbrev?.toUpperCase();

  const [teamResult, oppResult] = await Promise.allSettled([
    teamAbbrevNorm ? getNBATeamRosterEntries(teamAbbrevNorm) : Promise.resolve([]),
    oppAbbrevNorm ? getNBATeamRosterEntries(oppAbbrevNorm) : Promise.resolve([]),
  ]);

  if (teamResult.status === "fulfilled") {
    teamRoster = teamResult.value;
  } else {
    warnings.push(`Could not fetch roster for ${teamAbbrevNorm ?? "unknown"}: ${teamResult.reason}`);
  }

  if (oppResult.status === "fulfilled") {
    opponentRoster = oppResult.value;
  } else {
    warnings.push(`Could not fetch roster for ${oppAbbrevNorm ?? "unknown"}: ${oppResult.reason}`);
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
  };
}
