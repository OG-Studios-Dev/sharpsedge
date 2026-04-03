/**
 * GET /api/admin/source-health/systems
 *
 * Per-system input verification diagnostics for all live betting systems.
 *
 * Unlike /api/admin/source-health (which aggregates sport-level health),
 * this endpoint diagnoses each live SYSTEM's input readiness specifically —
 * e.g. "MLB F5" is a separate system from "MLB general" and has different
 * required inputs (F5 markets must be explicitly posted by books).
 *
 * Query params:
 *   ?sport=MLB|NHL|NBA|PGA|ALL  (default ALL)
 *   ?team=BOS                   (optional: narrow to a specific team/player/context)
 *   ?player=<name>              (optional: narrow to specific player for NBA/PGA)
 *
 * Returns:
 *   - Per-system diagnostic results with input status breakdown
 *   - Overall qualification status per system (ready / degraded / blocked)
 *   - Which inputs are present, missing, stale, or blocked
 *   - canQualify flag: can picks be generated for this system right now?
 *   - Summary of blocked/degraded systems across all sports
 *
 * Data flow:
 *   1. Fetch context hints for each sport (same path as the generator)
 *   2. Pass hints to per-sport diagnose* functions (no double-fetching)
 *   3. Return structured diagnostic results
 *
 * This is a best-effort aggregator — failures in one sport don't block others.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runSportDiagnostics,
  diagnoseMLBF5Inputs,
} from "@/lib/live-system-diagnostics";
import {
  summarizeSystemDiagnostics,
  type SystemDiagnosticResult,
} from "@/lib/system-diagnostics";
import {
  fetchMLBContextHints,
  emptyMLBContextHints,
} from "@/lib/goose-model/mlb-features";
import {
  fetchNHLContextHints,
  emptyNHLContextHints,
} from "@/lib/goose-model/nhl-features";
import {
  fetchNBAContextHints,
  emptyNBAContextHints,
} from "@/lib/goose-model/nba-context";
import {
  fetchPGAContextHints,
  emptyPGAContextHints,
} from "@/lib/goose-model/pga-features";
import { getDGCache } from "@/lib/datagolf-cache";
import { getMLBScheduleRange } from "@/lib/mlb-api";
import { getUpcomingSchedule } from "@/lib/nhl-api";
import { getDateKey, MLB_TIME_ZONE } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Helpers ────────────────────────────────────────────────────────────────

async function probeMLBSystems(
  team?: string | null,
  opponent?: string | null,
  baseUrl?: string,
): Promise<SystemDiagnosticResult[]> {
  // Get a representative game context if team not specified
  let contextTeam = team ?? "NYY";
  let contextOpponent = opponent ?? "BOS";

  if (!team) {
    try {
      const today = getDateKey(new Date(), MLB_TIME_ZONE);
      const schedule = await getMLBScheduleRange(today, today);
      if (schedule.length > 0) {
        contextTeam = schedule[0].awayTeam.abbreviation;
        contextOpponent = schedule[0].homeTeam.abbreviation;
      }
    } catch { /* use defaults */ }
  }

  const contextKey = `${contextTeam} @ ${contextOpponent}`;

  // Fetch MLB context hints (same path as generator)
  const mlbHints = await fetchMLBContextHints(contextTeam, contextOpponent)
    .catch(() => emptyMLBContextHints());

  // Fetch F5 market status from the mlb-f5 source health endpoint
  let mlbF5Status = null;
  if (baseUrl) {
    try {
      const f5Res = await fetch(`${baseUrl}/api/admin/source-health/mlb-f5`, {
        cache: "no-store",
      });
      if (f5Res.ok) {
        const f5Data = await f5Res.json() as Record<string, any>;
        const games = (f5Data.games as any[]) ?? [];
        // Find the game matching our context
        const matchingGame = games.find(
          (g: any) =>
            g.matchup?.includes(contextTeam) ||
            g.matchup?.includes(contextOpponent),
        );
        if (matchingGame) {
          mlbF5Status = {
            f5MoneylinePosted: matchingGame.f5MoneylinePosted ?? false,
            f5TotalPosted: matchingGame.f5TotalPosted ?? false,
            blocker: matchingGame.blocker ?? null,
            f5Books: matchingGame.f5Books ?? [],
          };
        }
      }
    } catch { /* F5 status optional */ }
  }

  return runSportDiagnostics({
    sport: "MLB",
    contextKey,
    mlbHints,
    mlbF5Status,
  });
}

async function probeNHLSystems(
  team?: string | null,
  opponent?: string | null,
): Promise<SystemDiagnosticResult[]> {
  let contextTeam = team ?? "TOR";
  let contextOpponent = opponent ?? "BOS";

  if (!team) {
    try {
      const scheduleResp = await getUpcomingSchedule();
      const games = scheduleResp.games;
      if (games.length > 0) {
        contextTeam = games[0].awayTeam?.abbrev ?? contextTeam;
        contextOpponent = games[0].homeTeam?.abbrev ?? contextOpponent;
      }
    } catch { /* use defaults */ }
  }

  const contextKey = `${contextTeam} @ ${contextOpponent}`;

  const nhlHints = await fetchNHLContextHints(contextTeam, contextOpponent)
    .catch(() => emptyNHLContextHints());

  return runSportDiagnostics({
    sport: "NHL",
    contextKey,
    nhlHints,
  });
}

async function probeNBASystems(
  player?: string | null,
  team?: string | null,
  opponent?: string | null,
): Promise<SystemDiagnosticResult[]> {
  const contextPlayer = player ?? null;
  const contextTeam = team ?? "BOS";
  const contextOpponent = opponent ?? "LAL";
  const contextKey = contextPlayer
    ? `${contextPlayer} (${contextTeam} vs ${contextOpponent})`
    : `${contextTeam} vs ${contextOpponent}`;

  const nbaHints = await fetchNBAContextHints(
    contextPlayer,
    contextTeam,
    contextOpponent,
    "points",
    null,
  ).catch(() => emptyNBAContextHints());

  return runSportDiagnostics({
    sport: "NBA",
    contextKey,
    nbaHints,
  });
}

async function probePGASystems(
  player?: string | null,
): Promise<SystemDiagnosticResult[]> {
  const contextPlayer = player ?? "Rory McIlroy";
  let tournamentName: string | null = null;

  try {
    const dgCache = await getDGCache();
    tournamentName = dgCache?.tournament ?? null;
  } catch { /* non-fatal */ }

  const contextKey = `${contextPlayer}${tournamentName ? ` @ ${tournamentName}` : ""}`;

  const pgaHints = await fetchPGAContextHints(
    contextPlayer,
    `${contextPlayer} Top 10`,
    null,
    null,
    null,
    tournamentName,
  ).catch(() => emptyPGAContextHints());

  return runSportDiagnostics({
    sport: "PGA",
    contextKey,
    pgaHints,
  });
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get("sport")?.toUpperCase() ?? "ALL";
  const team = req.nextUrl.searchParams.get("team");
  const player = req.nextUrl.searchParams.get("player");
  const opponent = req.nextUrl.searchParams.get("opponent");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin || "http://localhost:3000";

  const sportsToProbe =
    sport === "ALL" ? ["MLB", "NHL", "NBA", "PGA"] : [sport];

  const probeMap: Record<
    string,
    () => Promise<SystemDiagnosticResult[]>
  > = {
    MLB: () => probeMLBSystems(team, opponent, baseUrl),
    NHL: () => probeNHLSystems(team, opponent),
    NBA: () => probeNBASystems(player, team, opponent),
    PGA: () => probePGASystems(player),
  };

  const results = await Promise.allSettled(
    sportsToProbe.map((s) => {
      const probe = probeMap[s];
      return probe
        ? probe()
        : Promise.resolve<SystemDiagnosticResult[]>([]);
    }),
  );

  const allDiagnostics: SystemDiagnosticResult[] = [];
  const errors: Array<{ sport: string; error: string }> = [];

  results.forEach((result, i) => {
    const sportName = sportsToProbe[i];
    if (result.status === "fulfilled") {
      allDiagnostics.push(...result.value);
    } else {
      errors.push({
        sport: sportName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      // Still include a blocked diagnostic so the dashboard shows the failure
      allDiagnostics.push({
        system: `${sportName.toLowerCase()}-probe-failed`,
        systemLabel: `${sportName} (probe failed)`,
        sport: sportName as any,
        contextKey: "N/A",
        inputs: [],
        qualificationStatus: "blocked",
        canQualify: false,
        blockers: ["probe_failed"],
        enrichmentGaps: [],
        diagnosedAt: new Date().toISOString(),
      });
    }
  });

  const summary = summarizeSystemDiagnostics(allDiagnostics);

  // Build a per-sport summary for quick dashboard scanning
  const bySport: Record<string, {
    systems: SystemDiagnosticResult[];
    canQualifyAll: boolean;
    blockers: string[];
    enrichmentGaps: string[];
  }> = {};

  for (const diag of allDiagnostics) {
    if (!bySport[diag.sport]) {
      bySport[diag.sport] = { systems: [], canQualifyAll: true, blockers: [], enrichmentGaps: [] };
    }
    bySport[diag.sport].systems.push(diag);
    if (!diag.canQualify) bySport[diag.sport].canQualifyAll = false;
    bySport[diag.sport].blockers.push(...diag.blockers);
    bySport[diag.sport].enrichmentGaps.push(...diag.enrichmentGaps);
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sport: sport === "ALL" ? "ALL" : sport,
    summary,
    bySport,
    diagnostics: allDiagnostics,
    probe_errors: errors.length > 0 ? errors : undefined,
  });
}
