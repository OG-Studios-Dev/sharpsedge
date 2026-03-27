/**
 * MLB Batter vs. Pitcher (BvP) matchup rail.
 *
 * Source: MLB Stats API
 *   - Individual BvP: GET /api/v1/people/{batterId}/stats?stats=vsPlayer&group=hitting&opposingPlayerId={pitcherId}
 *   - Returns career-to-date PA/AB/H/HR/BB/AVG/OBP/SLG/OPS for this specific matchup
 *
 * Design:
 *   - Only fires when lineup is confirmed (official status, 9 players).
 *   - Fetches top-5 batting-order batters vs opposing starter in parallel.
 *   - Aggregates OPS weighted by sample size — low-sample pairs contribute less.
 *   - Falls back gracefully: if < 3 batters have usable history (>= 3 PA),
 *     status = "insufficient_bvp_history" and signal does not fire.
 *   - Cache: 24hr per (batterId, pitcherId) pair — career BvP won't change during a game day.
 *
 * Provenance:
 *   provider: "MLB Stats API vsPlayer"
 *   endpoint: https://statsapi.mlb.com/api/v1/people/{id}/stats?stats=vsPlayer&group=hitting&opposingPlayerId={pitcherId}
 */

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const BVP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24hr
const TOP_ORDER_SIZE = 5; // top batting-order positions sampled
const MIN_PA_FOR_SIGNAL = 3; // minimum PA to count a batter's BvP record
const MIN_BATTERS_WITH_HISTORY = 3; // minimum batters with >= MIN_PA_FOR_SIGNAL
const SIGNAL_OPS_THRESHOLD = 0.750; // avg OPS >= .750 → lineup_bvp_edge fires
const STRONG_OPS_THRESHOLD = 0.850; // strong tier

type CacheEntry<T> = { data: T; timestamp: number };
const bvpCache = new Map<string, CacheEntry<RawBvpStats | null>>();

// ── Types ─────────────────────────────────────────────────────

type RawBvpStats = {
  atBats: number;
  plateAppearances: number;
  hits: number;
  homeRuns: number;
  rbi: number;
  baseOnBalls: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
};

export type BatterVsPitcherRecord = {
  batterId: string;
  batterName: string;
  battingOrder: number;
  pitcherId: string;
  pitcherName: string;
  atBats: number;
  plateAppearances: number;
  hits: number;
  homeRuns: number;
  rbi: number;
  walks: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  /** Sample size tier for confidence weighting */
  sampleTier: "large" | "medium" | "small" | "minimal";
  /** Whether this record is trusted (>= MIN_PA_FOR_SIGNAL) */
  trusted: boolean;
};

export type LineupMatchupQuality = {
  /**
   * Whether a meaningful matchup layer was computed.
   * - "computed": lineup confirmed + starter known + >= 3 batters have BvP history
   * - "insufficient_lineup": lineup not official (unconfirmed/partial)
   * - "no_pitcher": opposing pitcher ID not available
   * - "insufficient_bvp_history": < 3 of top-5 batters have >= 3 PA vs this pitcher
   */
  status: "computed" | "insufficient_lineup" | "no_pitcher" | "insufficient_bvp_history";
  /** Whether lineup was in official confirmed state when computed */
  lineup_confirmed: boolean;
  /** Opposing pitcher ID used for this computation */
  pitcher_id: string | null;
  pitcher_name: string | null;
  pitcher_hand: string | null;
  /** Number of top-order batters sampled (up to TOP_ORDER_SIZE) */
  batters_sampled: number;
  /** Number of batters with trusted BvP history (>= MIN_PA_FOR_SIGNAL PA) */
  batters_with_history: number;
  /**
   * Aggregate OPS of trusted top-order batters vs this pitcher.
   * Weighted by plate appearance count (larger sample = more weight).
   * Null when fewer than MIN_BATTERS_WITH_HISTORY have usable history.
   */
  avg_ops_vs_pitcher: number | null;
  /** Raw BvP records for all sampled batters (including low-sample) */
  bvp_records: BatterVsPitcherRecord[];
  /**
   * Matchup quality classification based on avg OPS vs pitcher:
   * - strong_edge:      avg OPS >= .850
   * - moderate_edge:    avg OPS >= .750
   * - neutral:          avg OPS .650–.749
   * - slight_disadvantage: avg OPS < .650
   * - insufficient_data: no OPS computed
   */
  matchup_tier: "strong_edge" | "moderate_edge" | "neutral" | "slight_disadvantage" | "insufficient_data";
  /** Whether the lineup_bvp_edge signal fires (avg OPS >= .750 with enough history) */
  signal_fires: boolean;
  /** Human-readable summary for pick reasoning */
  note: string;
  source: {
    provider: string;
    fetchedAt: string;
    staleAfter: string;
  };
};

// ── API fetch ─────────────────────────────────────────────────

function sampleTierFromPA(pa: number): BatterVsPitcherRecord["sampleTier"] {
  if (pa >= 20) return "large";
  if (pa >= 10) return "medium";
  if (pa >= MIN_PA_FOR_SIGNAL) return "small";
  return "minimal";
}

function parseFloatOrNull(value: unknown): number | null {
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch career BvP stats for a single batter vs a single pitcher.
 * Returns null when:
 *   - API error or non-200 response
 *   - No vsPlayer splits found (batters/pitcher have never faced each other)
 *   - Empty stats object
 *
 * Cache: 24hr per (batterId, pitcherId) — career stats stable within a game day.
 */
async function fetchBatterVsPitcher(
  batterId: string,
  pitcherId: string,
): Promise<RawBvpStats | null> {
  const key = `${batterId}:${pitcherId}`;
  const cached = bvpCache.get(key);
  if (cached && Date.now() - cached.timestamp < BVP_CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${MLB_API_BASE}/people/${batterId}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${pitcherId}&sportId=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      bvpCache.set(key, { data: null, timestamp: Date.now() });
      return null;
    }

    const payload = await res.json() as {
      stats?: Array<{
        splits?: Array<{
          stat?: Record<string, unknown>;
        }>;
      }>;
    };

    const splits = payload.stats?.[0]?.splits ?? [];
    if (splits.length === 0) {
      bvpCache.set(key, { data: null, timestamp: Date.now() });
      return null;
    }

    // Aggregate across all split rows (MLB API returns one row for career vsPlayer)
    // Prefer the first (and usually only) split
    const stat = splits[0]?.stat ?? {};

    const result: RawBvpStats = {
      atBats: Number(stat.atBats ?? 0),
      plateAppearances: Number(stat.plateAppearances ?? stat.atBats ?? 0),
      hits: Number(stat.hits ?? 0),
      homeRuns: Number(stat.homeRuns ?? 0),
      rbi: Number(stat.rbi ?? 0),
      baseOnBalls: Number(stat.baseOnBalls ?? 0),
      avg: parseFloatOrNull(stat.avg),
      obp: parseFloatOrNull(stat.obp),
      slg: parseFloatOrNull(stat.slg),
      ops: parseFloatOrNull(stat.ops),
    };

    bvpCache.set(key, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    bvpCache.set(key, { data: null, timestamp: Date.now() });
    return null;
  }
}

// ── Matchup computation ───────────────────────────────────────

/**
 * Compute lineup matchup quality for a confirmed lineup vs an opposing starter.
 *
 * @param lineupPlayers  Top-order batters from the confirmed lineup (sorted by battingOrder)
 * @param pitcherId      Opposing starter's MLB player ID
 * @param pitcherName    Opposing starter's name (for display)
 * @param pitcherHand    Opposing starter's throwing hand (L/R/null)
 */
export async function computeLineupMatchupQuality(
  lineupPlayers: Array<{
    playerId: string;
    name: string;
    battingOrder: number;
    bats?: string;
  }>,
  pitcherId: string | null | undefined,
  pitcherName: string | null | undefined,
  pitcherHand: string | null | undefined,
): Promise<LineupMatchupQuality> {
  const fetchedAt = new Date().toISOString();
  const staleAfter = new Date(Date.now() + BVP_CACHE_TTL_MS).toISOString();

  const source = {
    provider: "MLB Stats API vsPlayer",
    fetchedAt,
    staleAfter,
  };

  // Guard: need at least 9-batter official lineup
  if (!lineupPlayers || lineupPlayers.length < 9) {
    return {
      status: "insufficient_lineup",
      lineup_confirmed: false,
      pitcher_id: pitcherId ?? null,
      pitcher_name: pitcherName ?? null,
      pitcher_hand: pitcherHand ?? null,
      batters_sampled: 0,
      batters_with_history: 0,
      avg_ops_vs_pitcher: null,
      bvp_records: [],
      matchup_tier: "insufficient_data",
      signal_fires: false,
      note: `Lineup not confirmed (${lineupPlayers?.length ?? 0} players in feed); BvP matchup rail requires official batting order.`,
      source,
    };
  }

  // Guard: need opponent starter ID
  if (!pitcherId) {
    return {
      status: "no_pitcher",
      lineup_confirmed: true,
      pitcher_id: null,
      pitcher_name: pitcherName ?? null,
      pitcher_hand: pitcherHand ?? null,
      batters_sampled: 0,
      batters_with_history: 0,
      avg_ops_vs_pitcher: null,
      bvp_records: [],
      matchup_tier: "insufficient_data",
      signal_fires: false,
      note: "Opposing pitcher ID not available; BvP matchup layer requires known starter ID.",
      source,
    };
  }

  // Sample top-order batters (batting positions 1–5)
  const topOrderBatters = lineupPlayers
    .sort((a, b) => a.battingOrder - b.battingOrder)
    .slice(0, TOP_ORDER_SIZE);

  // Fetch all BvP records in parallel
  const rawResults = await Promise.all(
    topOrderBatters.map(async (batter) => {
      const raw = await fetchBatterVsPitcher(batter.playerId, pitcherId).catch(() => null);
      return { batter, raw };
    }),
  );

  // Build typed records
  const bvp_records: BatterVsPitcherRecord[] = rawResults.map(({ batter, raw }) => {
    const pa = raw?.plateAppearances ?? 0;
    return {
      batterId: batter.playerId,
      batterName: batter.name,
      battingOrder: batter.battingOrder,
      pitcherId,
      pitcherName: pitcherName ?? "Unknown",
      atBats: raw?.atBats ?? 0,
      plateAppearances: pa,
      hits: raw?.hits ?? 0,
      homeRuns: raw?.homeRuns ?? 0,
      rbi: raw?.rbi ?? 0,
      walks: raw?.baseOnBalls ?? 0,
      avg: raw?.avg ?? null,
      obp: raw?.obp ?? null,
      slg: raw?.slg ?? null,
      ops: raw?.ops ?? null,
      sampleTier: sampleTierFromPA(pa),
      trusted: pa >= MIN_PA_FOR_SIGNAL,
    };
  });

  const trustedRecords = bvp_records.filter((r) => r.trusted && r.ops !== null);
  const batters_sampled = topOrderBatters.length;
  const batters_with_history = trustedRecords.length;

  // Guard: need at least 3 batters with usable history
  if (batters_with_history < MIN_BATTERS_WITH_HISTORY) {
    return {
      status: "insufficient_bvp_history",
      lineup_confirmed: true,
      pitcher_id: pitcherId,
      pitcher_name: pitcherName ?? null,
      pitcher_hand: pitcherHand ?? null,
      batters_sampled,
      batters_with_history,
      avg_ops_vs_pitcher: null,
      bvp_records,
      matchup_tier: "insufficient_data",
      signal_fires: false,
      note: `Only ${batters_with_history}/${batters_sampled} top-order batters have BvP history vs ${pitcherName ?? pitcherId} (need ${MIN_BATTERS_WITH_HISTORY}); too few career matchups to aggregate.`,
      source,
    };
  }

  // Compute PA-weighted OPS across trusted records
  let weightedOpsSum = 0;
  let totalPAWeight = 0;
  for (const record of trustedRecords) {
    const ops = record.ops!;
    const weight = record.plateAppearances;
    weightedOpsSum += ops * weight;
    totalPAWeight += weight;
  }
  const avg_ops_vs_pitcher = totalPAWeight > 0
    ? Math.round((weightedOpsSum / totalPAWeight) * 1000) / 1000
    : null;

  // Tier classification
  let matchup_tier: LineupMatchupQuality["matchup_tier"] = "insufficient_data";
  let signal_fires = false;

  if (avg_ops_vs_pitcher !== null) {
    if (avg_ops_vs_pitcher >= STRONG_OPS_THRESHOLD) {
      matchup_tier = "strong_edge";
      signal_fires = true;
    } else if (avg_ops_vs_pitcher >= SIGNAL_OPS_THRESHOLD) {
      matchup_tier = "moderate_edge";
      signal_fires = true;
    } else if (avg_ops_vs_pitcher >= 0.650) {
      matchup_tier = "neutral";
    } else {
      matchup_tier = "slight_disadvantage";
    }
  }

  // Build human-readable note
  const handNote = pitcherHand ? ` (${pitcherHand}HP)` : "";
  const opsTier = matchup_tier === "strong_edge" ? "strong edge"
    : matchup_tier === "moderate_edge" ? "moderate edge"
    : matchup_tier === "neutral" ? "neutral matchup"
    : matchup_tier === "slight_disadvantage" ? "slight disadvantage"
    : "insufficient data";

  const note = avg_ops_vs_pitcher !== null
    ? `Top-${batters_with_history} lineup batters have combined .${Math.round(avg_ops_vs_pitcher * 1000)} OPS career vs ${pitcherName ?? pitcherId}${handNote} — ${opsTier} (${batters_with_history}/${batters_sampled} with history, ${totalPAWeight} total PA).`
    : `${batters_with_history}/${batters_sampled} batters with history; insufficient PA pool for OPS aggregate.`;

  return {
    status: "computed",
    lineup_confirmed: true,
    pitcher_id: pitcherId,
    pitcher_name: pitcherName ?? null,
    pitcher_hand: pitcherHand ?? null,
    batters_sampled,
    batters_with_history,
    avg_ops_vs_pitcher,
    bvp_records,
    matchup_tier,
    signal_fires,
    note,
    source,
  };
}
