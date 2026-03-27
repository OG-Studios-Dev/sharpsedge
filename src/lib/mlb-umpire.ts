// ============================================================
// MLB Umpire Assignment Rail
//
// Purpose: Fetch the home plate umpire for a given MLB game
// (via the MLB Stats API boxscore 'officials' array) and look up
// historical zone-tendency stats from a seeded JSON file.
//
// Source for assignment:
//   statsapi.mlb.com/api/v1/game/{gamePk}/boxscore → officials[]
//   officialType === "Home Plate" → official.fullName
//   Umpire assignments are published in the boxscore before first pitch.
//
// Source for stats:
//   Seeded from UmpScorecards + Baseball Reference aggregates (2019-2024).
//   Not scraped live — provenance documented in src/data/mlb-umpire-stats.json.
//
// Zone tiers:
//   pitcher_friendly — ump expands strike zone for pitchers → more called strikes,
//                      fewer walks, suppressed run environment → good for UNDER bets
//   neutral          — league-average zone tendencies
//   hitter_friendly  — ump has smaller/inconsistent zone → more walks, more baserunners,
//                      elevated run environment → favors OVER bets and run-scoring picks
//
// Signals generated:
//   umpire_pitcher_friendly — home plate ump is pitch_friendly tier
//   umpire_hitter_friendly  — home plate ump is hitter_friendly tier
// ============================================================

import umpireStatsSeed from "@/data/mlb-umpire-stats.json";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

// ── Types ────────────────────────────────────────────────────

export type UmpZoneTier = "pitcher_friendly" | "neutral" | "hitter_friendly";

export type MLBUmpireProfile = {
  /** Umpire's full name as it appears in UmpScorecards data */
  name: string;
  /** Approximate Ks per 9 innings (game-level average) */
  k_per_9: number;
  /** Approximate BBs per 9 innings */
  bb_per_9: number;
  /** Approximate total runs per game (both teams) */
  run_per_game: number;
  /** Zone tendency tier */
  zone_tier: UmpZoneTier;
  /** Number of seasons in the sample */
  sample_seasons: number;
};

export type MLBUmpireContext = {
  /** Whether an umpire assignment was found for this game */
  status: "available" | "pending" | "unavailable";
  /** Home plate umpire full name (null if TBD / not yet assigned) */
  hp_ump_name: string | null;
  /** Historical zone-tendency profile (null if name not in seeded data) */
  profile: MLBUmpireProfile | null;
  /** Zone tier for this game ("neutral" default when profile is null) */
  zone_tier: UmpZoneTier;
  /** Whether ump is pitcher-friendly (signal trigger) */
  is_pitcher_friendly: boolean;
  /** Whether ump is hitter-friendly (signal trigger) */
  is_hitter_friendly: boolean;
  /** Human-readable note about zone tendency */
  zone_note: string;
  /** Source info for audit trail */
  source: {
    provider: string;
    url: string;
    fetchedAt: string;
    staleAfter: string;
  };
};

// ── Seeded umpire lookup ──────────────────────────────────────

const umpireProfiles: MLBUmpireProfile[] = (umpireStatsSeed.umps ?? []) as MLBUmpireProfile[];

/**
 * Fuzzy name match: handles common name variations.
 * MLB API returns "Last, First" or "First Last" depending on endpoint.
 */
function normalizeUmpName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findUmpireProfile(name: string | null | undefined): MLBUmpireProfile | null {
  if (!name) return null;
  const normalized = normalizeUmpName(name);
  return (
    umpireProfiles.find((u) => normalizeUmpName(u.name) === normalized) ??
    // Partial last-name fallback
    umpireProfiles.find((u) => {
      const parts = normalizeUmpName(u.name).split(" ");
      const lastName = parts[parts.length - 1];
      return normalized.includes(lastName) && lastName.length > 3;
    }) ??
    null
  );
}

// ── Per-game assignment cache ─────────────────────────────────

const UMPIRE_CACHE_TTL_MS = 60 * 60 * 1000; // 60 min — assignment stable day-of
const _umpireCache = new Map<string, { data: MLBUmpireContext; expiresAt: number }>();

/**
 * Fetch the home plate umpire for an MLB game from the boxscore officials array.
 * Umpire assignments appear in the boxscore pre-game (typically by 8–10 AM ET game day).
 *
 * @param gamePk  MLB gamePk from the schedule (numeric string)
 * @returns MLBUmpireContext with assignment status and zone profile
 */
export async function getMLBUmpireContext(gamePk: string): Promise<MLBUmpireContext> {
  const cached = _umpireCache.get(gamePk);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const fetchedAt = new Date().toISOString();
  const staleAfter = new Date(Date.now() + UMPIRE_CACHE_TTL_MS).toISOString();
  const sourceUrl = `${MLB_BASE}/game/${gamePk}/boxscore`;

  const baseSource = {
    provider: "MLB Stats API boxscore officials",
    url: sourceUrl,
    fetchedAt,
    staleAfter,
  };

  // Only attempt if gamePk looks valid
  if (!gamePk || gamePk === "0" || gamePk === "") {
    return buildUmpireContext(null, baseSource, "unavailable");
  }

  try {
    const res = await fetch(`${MLB_BASE}/game/${gamePk}/boxscore`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      // Pre-scheduled games may 404 or return empty officials; treat as pending
      return buildUmpireContext(null, baseSource, "pending");
    }

    const data = await res.json();
    const officials: Array<{ officialType?: string; official?: { fullName?: string } }> =
      data?.officials ?? [];

    const hpOfficial = officials.find(
      (o) =>
        String(o.officialType ?? "")
          .toLowerCase()
          .includes("home plate"),
    );

    const umpName = hpOfficial?.official?.fullName ?? null;
    const ctx = buildUmpireContext(umpName, baseSource, umpName ? "available" : "pending");
    _umpireCache.set(gamePk, { data: ctx, expiresAt: Date.now() + UMPIRE_CACHE_TTL_MS });
    return ctx;
  } catch (_err) {
    const ctx = buildUmpireContext(null, baseSource, "pending");
    return ctx;
  }
}

function buildUmpireContext(
  umpName: string | null,
  source: MLBUmpireContext["source"],
  status: MLBUmpireContext["status"],
): MLBUmpireContext {
  const profile = findUmpireProfile(umpName);
  const zone_tier: UmpZoneTier = profile?.zone_tier ?? "neutral";
  const is_pitcher_friendly = zone_tier === "pitcher_friendly";
  const is_hitter_friendly = zone_tier === "hitter_friendly";

  let zone_note: string;
  if (!umpName) {
    zone_note = "Home plate umpire not yet assigned (pre-game or TBD).";
  } else if (!profile) {
    zone_note = `${umpName} — not in seeded profile database; defaulting to neutral zone.`;
  } else if (is_pitcher_friendly) {
    zone_note = `${umpName} — pitcher-friendly zone (k/9 ${profile.k_per_9}, bb/9 ${profile.bb_per_9}). Suppressed run environment vs league avg.`;
  } else if (is_hitter_friendly) {
    zone_note = `${umpName} — hitter-friendly zone (k/9 ${profile.k_per_9}, bb/9 ${profile.bb_per_9}). Elevated walk/run environment vs league avg.`;
  } else {
    zone_note = `${umpName} — neutral zone tendencies (k/9 ${profile.k_per_9 ?? "?"}, bb/9 ${profile.bb_per_9 ?? "?"}).`;
  }

  return {
    status,
    hp_ump_name: umpName,
    profile,
    zone_tier,
    is_pitcher_friendly,
    is_hitter_friendly,
    zone_note,
    source,
  };
}
