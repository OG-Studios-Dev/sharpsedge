/**
 * GET/POST /api/admin/nhl-shot-refresh
 *
 * Cron / prewarm endpoint for NHL shot aggregate storage.
 *
 * WHY THIS EXISTS:
 *   Full-season shot aggregate reads (73+ games per team, 32 teams) are too slow
 *   to run on-demand during pick generation. Each team requires fetching up to 73
 *   PBP JSON responses from api-web.nhle.com and aggregating shot coordinates.
 *   Without pre-warming the Supabase L2 cache, the first on-demand call for any
 *   team can take 20–60 seconds depending on games fetched and API latency.
 *
 *   This route pre-computes and stores profiles for all 32 NHL teams so that
 *   pick generation reads are instant (Supabase reads < 100ms vs PBP rebuild > 30s).
 *
 * WHAT IT STORES (via aggregateTeamShotProfileWithStorage):
 *   - Rolling profile: last 10 completed games per team (updates daily)
 *   - Full-season profile: last 50 completed games per team (slower, run weekly)
 *   - Player profiles: top xG generators for all 32 teams (stored in nhl_player_shot_profiles)
 *
 * SAFETY:
 *   - GET mode: dry-run — returns what would be refreshed, no writes
 *   - POST mode: performs actual pre-compute + Supabase upsert
 *   - Guarded by ADMIN_SECRET or SCRAPE_SECRET
 *   - Per-team errors are non-fatal: failures collected and reported
 *   - Never blocks pick generation on failure; L3 PBP fallback always available
 *
 * USAGE:
 *   GET  /api/admin/nhl-shot-refresh            → dry-run status
 *   POST /api/admin/nhl-shot-refresh            → prewarm rolling (10-game) profiles
 *   POST /api/admin/nhl-shot-refresh?mode=full  → prewarm full-season (50-game) + rolling
 *   POST /api/admin/nhl-shot-refresh?mode=players → prewarm player xG profiles only
 *   POST /api/admin/nhl-shot-refresh?team=TOR   → refresh single team (all modes)
 *
 * RECOMMENDED CADENCE:
 *   Rolling:    daily cron (e.g. 6:00 AM ET)
 *   Full-season: weekly cron (e.g. Monday 7:00 AM ET)
 *   Players:    daily alongside rolling
 *
 * SOURCE INTEGRITY:
 *   - Uses aggregateTeamShotProfileWithStorage() — same function as pick generation
 *   - This means the cache is always consistent with what picks see
 *   - No separate data pipeline: prewarm = force-refresh of the same L2 cache
 */

import { NextRequest, NextResponse } from "next/server";
import {
  aggregateTeamShotProfileWithStorage,
  aggregatePlayerShotProfiles,
} from "@/lib/nhl-shot-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min for full 32-team run

/** All 32 NHL team abbreviations (2025–26 season) */
const ALL_NHL_TEAMS = [
  "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ",
  "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NSH",
  "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SJS", "SEA",
  "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WSH", "WPG",
];

function isAuthorized(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  const scrapeSecret = process.env.SCRAPE_SECRET;

  // No secrets configured → allow in dev
  if (!adminSecret && !scrapeSecret) return true;

  const authHeader = request.headers.get("authorization");
  const xKey = request.headers.get("x-admin-key") || request.headers.get("x-scrape-key");

  if (adminSecret && (authHeader === `Bearer ${adminSecret}` || xKey === adminSecret)) return true;
  if (scrapeSecret && (authHeader === `Bearer ${scrapeSecret}` || xKey === scrapeSecret)) return true;

  return false;
}

export async function GET() {
  return NextResponse.json({
    mode: "dry-run",
    teams: ALL_NHL_TEAMS.length,
    teamList: ALL_NHL_TEAMS,
    availableModes: {
      rolling: "POST /api/admin/nhl-shot-refresh — prewarm last-10-game rolling profiles (fast, ~2-5 min)",
      full: "POST /api/admin/nhl-shot-refresh?mode=full — rolling + full-season 50-game profiles (slow, ~15-30 min)",
      players: "POST /api/admin/nhl-shot-refresh?mode=players — per-player xG profiles, 10-game window",
    },
    cadenceRecommendation: {
      rolling: "daily, ~6:00 AM ET before picks generate",
      full: "weekly, Monday 7:00 AM ET",
      players: "daily alongside rolling",
    },
    dataFlow: "aggregateTeamShotProfileWithStorage() → L1 in-process cache → L2 Supabase nhl_shot_aggregates → L3 fresh PBP",
    note: "GET mode is a dry-run (no writes). POST to actually prewarm.",
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "rolling"; // "rolling" | "full" | "players"
  const singleTeam = url.searchParams.get("team")?.toUpperCase() ?? null;

  const teams = singleTeam ? [singleTeam] : ALL_NHL_TEAMS;
  const startedAt = Date.now();

  const results: Record<string, {
    status: "ok" | "error" | "skipped";
    rollingMs?: number;
    fullSeasonMs?: number;
    playerProfileCount?: number;
    gamesAnalyzed?: number;
    error?: string;
  }> = {};

  let successCount = 0;
  let errorCount = 0;

  // ── Rolling profiles ──────────────────────────────────────────
  if (mode === "rolling" || mode === "full") {
    for (const team of teams) {
      const t0 = Date.now();
      try {
        const profile = await aggregateTeamShotProfileWithStorage(team, 10, "rolling");
        results[team] = {
          ...results[team],
          status: profile ? "ok" : "skipped",
          rollingMs: Date.now() - t0,
          gamesAnalyzed: profile?.gamesAnalyzed ?? 0,
        };
        if (profile) successCount++;
        else errorCount++;
      } catch (err) {
        results[team] = {
          ...results[team],
          status: "error",
          rollingMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        };
        errorCount++;
      }
    }
  }

  // ── Full-season profiles (50-game window) ─────────────────────
  if (mode === "full") {
    for (const team of teams) {
      const t0 = Date.now();
      try {
        const profile = await aggregateTeamShotProfileWithStorage(team, 50, "full_season");
        results[team] = {
          ...results[team],
          status: profile ? "ok" : results[team]?.status ?? "skipped",
          fullSeasonMs: Date.now() - t0,
          gamesAnalyzed: profile?.gamesAnalyzed ?? results[team]?.gamesAnalyzed ?? 0,
        };
        if (!profile) errorCount++;
      } catch (err) {
        results[team] = {
          ...results[team],
          status: "error",
          fullSeasonMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        };
        errorCount++;
      }
    }
  }

  // ── Player xG profiles ────────────────────────────────────────
  if (mode === "players" || mode === "rolling" || mode === "full") {
    for (const team of teams) {
      const t0 = Date.now();
      try {
        const playerProfiles = await aggregatePlayerShotProfiles(team, 10);
        const existing = results[team] ?? {};
        results[team] = {
          ...existing,
          status: existing.status === "error" ? "error" : "ok",
          playerProfileCount: playerProfiles.length,
        };
        if (playerProfiles.length > 0 && existing.status !== "error") successCount++;
      } catch (err) {
        const existing = results[team] ?? {};
        results[team] = {
          ...existing,
          status: "error",
          error: [existing.error, err instanceof Error ? err.message : String(err)]
            .filter(Boolean)
            .join("; "),
        };
        errorCount++;
      }
    }
  }

  const totalMs = Date.now() - startedAt;
  const okTeams = Object.entries(results)
    .filter(([, r]) => r.status === "ok")
    .map(([t]) => t);
  const errorTeams = Object.entries(results)
    .filter(([, r]) => r.status === "error")
    .map(([t, r]) => ({ team: t, error: r.error }));

  return NextResponse.json({
    status: errorCount === 0 ? "ok" : errorCount < teams.length ? "partial" : "failed",
    mode,
    teamsRequested: teams.length,
    teamsOk: okTeams.length,
    teamsErrored: errorTeams.length,
    totalMs,
    okTeams,
    errorTeams,
    perTeam: results,
    dataStored: {
      table_rolling: "nhl_shot_aggregates (aggregate_type=rolling, last 10 games)",
      table_full_season: mode === "full" ? "nhl_shot_aggregates (aggregate_type=full_season, last 50 games)" : "skipped (use mode=full)",
      table_players: "nhl_player_shot_profiles (per-player xG attribution, last 10 games)",
    },
    nextAction: "Pick generation will now read from Supabase L2 cache instead of recomputing PBP for these teams.",
    refreshedAt: new Date().toISOString(),
  });
}
