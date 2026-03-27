// ============================================================
// MLB Team Batting Handedness Splits Rail
//
// Purpose: Fetch a team's batting OPS vs left-handed pitchers (LHP)
// and vs right-handed pitchers (RHP) from the MLB Stats API season
// splits endpoint. Combine with the probable starter's throwing hand
// to determine whether the batting team has a handedness advantage
// in tonight's matchup.
//
// Source:
//   statsapi.mlb.com/api/v1/teams/{teamId}/stats
//     ?stats=vsLeft&group=hitting&season={year}
//   statsapi.mlb.com/api/v1/teams/{teamId}/stats
//     ?stats=vsRight&group=hitting&season={year}
//
//   These endpoints return cumulative season batting splits for the team.
//   Available from the first game of the season; null at true Opening Day.
//
// Handedness advantage logic:
//   - Pitcher hand "L" → team's OPS vs LHP is the relevant split
//   - Pitcher hand "R" → team's OPS vs RHP is the relevant split
//   - "strong_advantage"  : team OPS vs that hand >= STRONG_OPS_THRESHOLD (.750)
//   - "moderate_advantage": team OPS vs that hand >= MODERATE_OPS_THRESHOLD (.720)
//   - "neutral"           : team OPS within normal range
//   - "disadvantage"      : team OPS vs that hand <= DISADVANTAGE_THRESHOLD (.680)
//   - "unknown"           : pitcher hand not known or insufficient sample
//
// Signal generated:
//   handedness_advantage — fires when tier is "strong_advantage" or "moderate_advantage"
// ============================================================

import { MLB_TEAM_IDS } from "@/lib/mlb-api";
import { getCurrentMLBSeason } from "@/lib/mlb-api";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

// OPS thresholds (league average ~.720 vs both hands in a typical season)
const STRONG_OPS_THRESHOLD      = 0.750;
const MODERATE_OPS_THRESHOLD    = 0.720;
const DISADVANTAGE_OPS_THRESHOLD = 0.680;

// ── Types ────────────────────────────────────────────────────

export type HandednessAdvantage =
  | "strong_advantage"
  | "moderate_advantage"
  | "neutral"
  | "disadvantage"
  | "unknown";

export type MLBHandednessSplits = {
  teamAbbrev: string;
  season: number;
  /** Team OPS when facing left-handed starters this season */
  ops_vs_lhp: number | null;
  /** Team OPS when facing right-handed starters this season */
  ops_vs_rhp: number | null;
  /** At-bats vs LHP (sample size indicator) */
  ab_vs_lhp: number | null;
  /** At-bats vs RHP */
  ab_vs_rhp: number | null;
  source: {
    provider: string;
    fetchedAt: string;
    staleAfter: string;
    note: string;
  };
};

export type MLBHandednessMatchup = {
  /** Throwing hand of the opponent's probable starter */
  pitcher_hand: "L" | "R" | null;
  /** Relevant OPS for team against this pitcher's hand */
  team_ops_vs_hand: number | null;
  /** Matchup advantage tier */
  advantage_tier: HandednessAdvantage;
  /** Whether the handedness_advantage signal should fire */
  signal_fires: boolean;
  /** Human-readable note */
  note: string;
};

// ── Cache ─────────────────────────────────────────────────────

const SPLITS_CACHE_TTL_MS = 60 * 60 * 1000; // 60 min (season splits update infrequently)
const _splitsCache = new Map<string, { data: MLBHandednessSplits; expiresAt: number }>();

// ── API helpers ───────────────────────────────────────────────

async function fetchTeamSplitStats(
  teamId: number,
  vsHand: "vsLeft" | "vsRight",
  season: number,
): Promise<{ ops: number | null; atBats: number | null }> {
  const url =
    `${MLB_BASE}/teams/${teamId}/stats?stats=${vsHand}&group=hitting&season=${season}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return { ops: null, atBats: null };
    const data = await res.json();
    const splits = data?.stats?.[0]?.splits ?? [];
    const stat = splits[0]?.stat ?? {};
    const ops = stat.ops != null ? parseFloat(String(stat.ops)) : null;
    const atBats = stat.atBats != null ? parseInt(String(stat.atBats), 10) : null;
    return {
      ops: Number.isFinite(ops) ? ops : null,
      atBats: Number.isFinite(atBats) ? atBats : null,
    };
  } catch {
    return { ops: null, atBats: null };
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Fetch team batting splits vs LHP and RHP for the current season.
 * Uses MLB Stats API team stats endpoint (vsLeft / vsRight).
 * Results are cached for 60 min.
 *
 * Returns null values on Opening Day / insufficient sample — non-fatal.
 */
export async function getMLBHandednessSplits(
  teamAbbrev: string,
  season?: number,
): Promise<MLBHandednessSplits> {
  const abbrev = teamAbbrev.toUpperCase();
  const resolvedSeason = season ?? getCurrentMLBSeason();
  const cacheKey = `${abbrev}:${resolvedSeason}`;
  const now = Date.now();

  const cached = _splitsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  const teamId = MLB_TEAM_IDS[abbrev] ?? null;
  const fetchedAt = new Date().toISOString();
  const staleAfter = new Date(now + SPLITS_CACHE_TTL_MS).toISOString();

  const defaultResult: MLBHandednessSplits = {
    teamAbbrev: abbrev,
    season: resolvedSeason,
    ops_vs_lhp: null,
    ops_vs_rhp: null,
    ab_vs_lhp: null,
    ab_vs_rhp: null,
    source: {
      provider: "MLB Stats API vsLeft/vsRight team splits",
      fetchedAt,
      staleAfter,
      note: teamId ? "Fetched from MLB Stats API" : `No teamId mapping for ${abbrev}`,
    },
  };

  if (!teamId) {
    _splitsCache.set(cacheKey, { data: defaultResult, expiresAt: now + SPLITS_CACHE_TTL_MS });
    return defaultResult;
  }

  try {
    const [lhp, rhp] = await Promise.all([
      fetchTeamSplitStats(teamId, "vsLeft", resolvedSeason),
      fetchTeamSplitStats(teamId, "vsRight", resolvedSeason),
    ]);

    const result: MLBHandednessSplits = {
      teamAbbrev: abbrev,
      season: resolvedSeason,
      ops_vs_lhp: lhp.ops,
      ops_vs_rhp: rhp.ops,
      ab_vs_lhp: lhp.atBats,
      ab_vs_rhp: rhp.atBats,
      source: {
        provider: "MLB Stats API vsLeft/vsRight team splits",
        fetchedAt,
        staleAfter,
        note: `teamId=${teamId}, season=${resolvedSeason}. Null at season start (< enough AB) — expected, non-fatal.`,
      },
    };
    _splitsCache.set(cacheKey, { data: result, expiresAt: now + SPLITS_CACHE_TTL_MS });
    return result;
  } catch {
    _splitsCache.set(cacheKey, { data: defaultResult, expiresAt: now + SPLITS_CACHE_TTL_MS });
    return defaultResult;
  }
}

/**
 * Derive the handedness matchup advantage for a team against a specific pitcher.
 * Combines team batting OPS vs pitcher's hand with advantage tier thresholds.
 *
 * @param splits   Team's seasonal LHP/RHP batting splits
 * @param pitcherHand  Pitcher throwing hand ("L" | "R" | null | undefined)
 */
export function computeHandednessMatchup(
  splits: MLBHandednessSplits | null,
  pitcherHand: string | null | undefined,
): MLBHandednessMatchup {
  const hand: "L" | "R" | null =
    pitcherHand === "L" || pitcherHand === "R" ? pitcherHand : null;

  if (!splits || !hand) {
    return {
      pitcher_hand: hand,
      team_ops_vs_hand: null,
      advantage_tier: "unknown",
      signal_fires: false,
      note: hand
        ? "Team batting splits not yet available (season start or API gap)."
        : "Pitcher hand unknown — handedness matchup cannot be computed.",
    };
  }

  const ops = hand === "L" ? splits.ops_vs_lhp : splits.ops_vs_rhp;
  const ab = hand === "L" ? splits.ab_vs_lhp : splits.ab_vs_rhp;
  const minAB = 30; // require at least 30 AB for a meaningful split

  if (ops === null || (ab !== null && ab < minAB)) {
    return {
      pitcher_hand: hand,
      team_ops_vs_hand: ops,
      advantage_tier: "unknown",
      signal_fires: false,
      note: `Insufficient sample vs ${hand}HP this season (${ab ?? 0} AB — need >= ${minAB}).`,
    };
  }

  let advantage_tier: HandednessAdvantage;
  if (ops >= STRONG_OPS_THRESHOLD) {
    advantage_tier = "strong_advantage";
  } else if (ops >= MODERATE_OPS_THRESHOLD) {
    advantage_tier = "moderate_advantage";
  } else if (ops <= DISADVANTAGE_OPS_THRESHOLD) {
    advantage_tier = "disadvantage";
  } else {
    advantage_tier = "neutral";
  }

  const signal_fires =
    advantage_tier === "strong_advantage" || advantage_tier === "moderate_advantage";

  const opsStr = ops.toFixed(3);
  let note: string;
  if (advantage_tier === "strong_advantage") {
    note = `Team OPS .${opsStr.split(".")[1]} vs ${hand}HP (strong edge — above .750 threshold).`;
  } else if (advantage_tier === "moderate_advantage") {
    note = `Team OPS .${opsStr.split(".")[1]} vs ${hand}HP (moderate edge — above .720 threshold).`;
  } else if (advantage_tier === "disadvantage") {
    note = `Team OPS .${opsStr.split(".")[1]} vs ${hand}HP (disadvantage — below .680 threshold).`;
  } else {
    note = `Team OPS .${opsStr.split(".")[1]} vs ${hand}HP (neutral — within normal range).`;
  }

  return {
    pitcher_hand: hand,
    team_ops_vs_hand: ops,
    advantage_tier,
    signal_fires,
    note,
  };
}
