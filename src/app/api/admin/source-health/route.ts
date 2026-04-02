/**
 * GET /api/admin/source-health
 *
 * Unified source-health monitoring across all active sports leagues.
 * Aggregates health checks from each sport's debug endpoint and context board,
 * returning a single degraded-state visibility dashboard.
 *
 * Returns:
 *   - Overall health status (healthy / degraded / critical)
 *   - Per-sport source health (schedule, enrichment, features, signals)
 *   - Active degradations list with remediation hints
 *   - Model readiness by sport (can we generate picks right now?)
 *
 * Query params:
 *   ?sport=NHL|NBA|MLB|PGA|ALL  (default ALL)
 *
 * This is a best-effort aggregator — each sport check is isolated.
 * Failures in one sport's check don't block the others.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HealthStatus = "healthy" | "degraded" | "stale" | "missing" | "unknown";

interface SportSourceCheck {
  name: string;
  status: HealthStatus;
  detail: string;
  age_minutes: number | null;
}

interface SportHealthResult {
  sport: string;
  overall: HealthStatus;
  model_ready: boolean;
  model_ready_note: string;
  checks: SportSourceCheck[];
  degraded_sources: string[];
  critical_gaps: string[];
  last_checked: string;
}

interface SourceHealthDashboard {
  generated_at: string;
  overall_status: HealthStatus;
  sports: SportHealthResult[];
  active_degradations: Array<{ sport: string; source: string; detail: string }>;
  model_ready_sports: string[];
  model_blocked_sports: string[];
  summary: string;
}

function statusPriority(s: HealthStatus): number {
  return { missing: 4, degraded: 3, stale: 2, unknown: 1, healthy: 0 }[s] ?? 1;
}

function worstStatus(statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce((worst, s) =>
    statusPriority(s) > statusPriority(worst) ? s : worst, "healthy" as HealthStatus);
}

function ageMinutes(isoStr?: string | null): number | null {
  if (!isoStr) return null;
  const parsed = new Date(isoStr);
  if (isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
}

// ── Per-sport health probes ───────────────────────────────────

async function probeNHL(baseUrl: string): Promise<SportHealthResult> {
  const checks: SportSourceCheck[] = [];
  const now = new Date().toISOString();

  try {
    const res = await fetch(`${baseUrl}/api/debug/nhl`, { cache: "no-store" });
    if (!res.ok) {
      return {
        sport: "NHL",
        overall: "degraded",
        model_ready: false,
        model_ready_note: `Debug probe failed (HTTP ${res.status})`,
        checks: [{ name: "debug-endpoint", status: "degraded", detail: `HTTP ${res.status}`, age_minutes: null }],
        degraded_sources: ["debug-endpoint"],
        critical_gaps: ["NHL debug route unreachable"],
        last_checked: now,
      };
    }
    const data = await res.json() as Record<string, unknown>;
    const nhlSteps = (data.steps as Record<string, unknown>) ?? {};

    const scheduleStep = nhlSteps.schedule as Record<string, unknown> | undefined;
    const gamesCount = (scheduleStep?.games as number) ?? 0;

    checks.push({
      name: "schedule",
      status: gamesCount >= 0 ? "healthy" : "missing",
      detail: `${gamesCount} games today`,
      age_minutes: null,
    });

    const contextBoardStep = nhlSteps.context_board as Record<string, unknown> | undefined;
    const ppDegraded = Boolean((contextBoardStep?.specialTeams as any)?.degraded);
    checks.push({
      name: "special-teams (PP/PK)",
      status: ppDegraded ? "degraded" : "healthy",
      detail: (contextBoardStep?.specialTeams as any)?.note ?? "PP/PK stats from NHL REST API",
      age_minutes: null,
    });

    const shotProfileStep = nhlSteps.shot_zone_profile as Record<string, unknown> | undefined;
    const noSlateContext = gamesCount === 0;
    const shotRefresh = shotProfileStep?.error ? "error" :
      shotProfileStep?.status === "unavailable" ? "unavailable" :
      shotProfileStep?.hdcfPct !== undefined ? "available" : "unknown";
    checks.push({
      name: "shot-aggregates (HDCF/xG)",
      status: shotRefresh === "available" ? "healthy" : (noSlateContext ? "healthy" : "stale"),
      detail: shotRefresh === "available"
        ? "PBP shot zone aggregates"
        : (noSlateContext ? "No active NHL slate; shot aggregates not required" : (shotProfileStep?.error ? String(shotProfileStep.error) : "PBP shot zone aggregates unavailable")),
      age_minutes: null,
    });

    const contextHintsStep = nhlSteps.context_hints as Record<string, unknown> | undefined;
    const hasMoneyPuck = contextHintsStep?.team_xgoals_pct !== null &&
      contextHintsStep?.team_xgoals_pct !== undefined;
    const moneyPuck: "healthy" | "stale" = hasMoneyPuck || noSlateContext ? "healthy" : "stale";
    checks.push({
      name: "moneypuck-xgoals",
      status: moneyPuck,
      detail: hasMoneyPuck
        ? "xGoals% available"
        : (noSlateContext ? "No active NHL slate; xGoals context not required" : "xGoals% null (may be stale)"),
      age_minutes: null,
    });

    const degraded = checks.filter((c) => c.status !== "healthy").map((c) => c.name);
    const overall = worstStatus(checks.map((c) => c.status));

    return {
      sport: "NHL",
      overall,
      model_ready: overall !== "missing",
      model_ready_note: overall === "healthy" ? "All NHL sources healthy" : `Degraded: ${degraded.join(", ")}`,
      checks,
      degraded_sources: degraded,
      critical_gaps: [],
      last_checked: now,
    };
  } catch (err) {
    return {
      sport: "NHL",
      overall: "unknown",
      model_ready: false,
      model_ready_note: `Probe error: ${err instanceof Error ? err.message : String(err)}`,
      checks: [],
      degraded_sources: ["all"],
      critical_gaps: ["NHL probe failed"],
      last_checked: now,
    };
  }
}

async function probeNBA(baseUrl: string): Promise<SportHealthResult> {
  const now = new Date().toISOString();
  const checks: SportSourceCheck[] = [];

  try {
    const res = await fetch(`${baseUrl}/api/debug/nba`, { cache: "no-store" });
    if (!res.ok) {
      return {
        sport: "NBA",
        overall: "degraded",
        model_ready: false,
        model_ready_note: `Debug probe failed (HTTP ${res.status})`,
        checks: [{ name: "debug-endpoint", status: "degraded", detail: `HTTP ${res.status}`, age_minutes: null }],
        degraded_sources: ["debug-endpoint"],
        critical_gaps: ["NBA debug route unreachable"],
        last_checked: now,
      };
    }
    const data = await res.json() as Record<string, unknown>;
    const nbaSteps = (data.steps as Record<string, unknown>) ?? {};

    const nbaScheduleStep = nbaSteps.schedule as Record<string, unknown> | undefined;
    const gamesCount = (nbaScheduleStep?.count as number) ?? 0;
    checks.push({
      name: "schedule",
      status: gamesCount >= 0 ? "healthy" : "missing",
      detail: `${gamesCount} NBA games`,
      age_minutes: null,
    });

    const rosterProvenance = nbaSteps.rosterProvenance as Record<string, unknown> | undefined;
    const anyRosterDegraded = rosterProvenance
      ? Object.values(rosterProvenance).some((v: any) => v?.degraded === true || Boolean(v?.error))
      : true;
    checks.push({
      name: "rosters",
      status: anyRosterDegraded ? "stale" : "healthy",
      detail: anyRosterDegraded ? "ESPN roster degraded or unavailable for a probed team" : "ESPN roster fetch OK",
      age_minutes: null,
    });

    const boxscoreStep = nbaSteps.boxscoreTest as Record<string, unknown> | undefined;
    const boxscoreOk = boxscoreStep && !boxscoreStep.error && (boxscoreStep.totalPlayers as number) > 0;
    checks.push({
      name: "boxscores",
      status: boxscoreOk ? "healthy" : "stale",
      detail: boxscoreStep?.error ? String(boxscoreStep.error) : "ESPN boxscore fetch",
      age_minutes: null,
    });

    const degraded = checks.filter((c) => c.status !== "healthy").map((c) => c.name);
    const overall = worstStatus(checks.map((c) => c.status));

    return {
      sport: "NBA",
      overall,
      model_ready: overall !== "missing",
      model_ready_note: degraded.length === 0 ? "All NBA sources healthy" : `Degraded: ${degraded.join(", ")}`,
      checks,
      degraded_sources: degraded,
      critical_gaps: [],
      last_checked: now,
    };
  } catch (err) {
    return {
      sport: "NBA",
      overall: "unknown",
      model_ready: false,
      model_ready_note: `Probe error: ${err instanceof Error ? err.message : String(err)}`,
      checks: [],
      degraded_sources: ["all"],
      critical_gaps: ["NBA probe failed"],
      last_checked: now,
    };
  }
}

async function probeMLB(baseUrl: string): Promise<SportHealthResult> {
  const now = new Date().toISOString();
  const checks: SportSourceCheck[] = [];

  try {
    const res = await fetch(`${baseUrl}/api/debug/mlb`, { cache: "no-store" });
    if (!res.ok) {
      return {
        sport: "MLB",
        overall: "degraded",
        model_ready: false,
        model_ready_note: `Debug probe failed (HTTP ${res.status})`,
        checks: [{ name: "debug-endpoint", status: "degraded", detail: `HTTP ${res.status}`, age_minutes: null }],
        degraded_sources: ["debug-endpoint"],
        critical_gaps: ["MLB debug route unreachable"],
        last_checked: now,
      };
    }
    const data = await res.json() as Record<string, unknown>;
    const mlbSteps = (data.steps as Record<string, unknown>) ?? {};
    const ebStep = mlbSteps.enrichment_board as Record<string, unknown> | undefined;
    const coverageStep = (data.source_coverage as Record<string, unknown> | undefined)
      ?? (mlbSteps.source_coverage as Record<string, unknown> | undefined);
    const mlbContextHints = (data.context_hints as Record<string, unknown> | undefined)
      ?? (mlbSteps.context_hints as Record<string, unknown> | undefined);

    const gamesCount = (ebStep?.gamesCount as number) ?? 0;
    checks.push({
      name: "schedule",
      status: gamesCount >= 0 ? "healthy" : "missing",
      detail: `${gamesCount} MLB games active`,
      age_minutes: ageMinutes(typeof ebStep?.generatedAt === "string" ? ebStep.generatedAt : null),
    });

    const weatherCount = (coverageStep?.gamesWithWeather as number) ?? 0;
    checks.push({
      name: "weather",
      status: weatherCount > 0 ? "healthy" : gamesCount > 0 ? "degraded" : "healthy",
      detail: `${weatherCount}/${gamesCount} games with weather data`,
      age_minutes: null,
    });

    const parkFactorCount = (coverageStep?.gamesWithParkFactor as number) ?? 0;
    checks.push({
      name: "park-factors",
      status: parkFactorCount > 0 ? "healthy" : gamesCount > 0 ? "degraded" : "healthy",
      detail: `${parkFactorCount}/${gamesCount} games with park factors`,
      age_minutes: null,
    });

    const bullpenCount = (coverageStep?.gamesWithBullpenData as number) ?? 0;
    checks.push({
      name: "bullpen",
      status: bullpenCount > 0 ? "healthy" : gamesCount > 0 ? "stale" : "healthy",
      detail: `${bullpenCount}/${gamesCount} games with bullpen data`,
      age_minutes: null,
    });

    const lineupCount = (coverageStep?.gamesWithOfficialLineup as number) ?? 0;
    checks.push({
      name: "lineups",
      status: lineupCount > 0 ? "healthy" : "stale",
      detail: `${lineupCount}/${gamesCount} games with official lineups (normal before 3 PM ET)`,
      age_minutes: null,
    });

    const umpCtx = (mlbContextHints?.umpire_context as any);
    checks.push({
      name: "umpire-zone",
      status: umpCtx?.hp_ump_name ? "healthy" : "stale",
      detail: umpCtx?.hp_ump_name ? `HP Ump: ${umpCtx.hp_ump_name}` : "Umpire not yet assigned (normal pre-game)",
      age_minutes: null,
    });

    const degraded = checks.filter((c) => c.status !== "healthy").map((c) => c.name);
    const overall = worstStatus(checks.map((c) => c.status));

    // Critical gaps
    const critical: string[] = [];
    if (gamesCount > 0 && weatherCount === 0) critical.push("weather missing for all games");

    return {
      sport: "MLB",
      overall,
      model_ready: overall !== "missing",
      model_ready_note: degraded.length === 0 ? "All MLB sources healthy" : `Degraded: ${degraded.join(", ")}`,
      checks,
      degraded_sources: degraded,
      critical_gaps: critical,
      last_checked: now,
    };
  } catch (err) {
    return {
      sport: "MLB",
      overall: "unknown",
      model_ready: false,
      model_ready_note: `Probe error: ${err instanceof Error ? err.message : String(err)}`,
      checks: [],
      degraded_sources: ["all"],
      critical_gaps: ["MLB probe failed"],
      last_checked: now,
    };
  }
}

async function probePGA(baseUrl: string): Promise<SportHealthResult> {
  const now = new Date().toISOString();
  const checks: SportSourceCheck[] = [];

  try {
    const res = await fetch(`${baseUrl}/api/debug/pga`, { cache: "no-store" });
    if (!res.ok) {
      return {
        sport: "PGA",
        overall: "degraded",
        model_ready: false,
        model_ready_note: `Debug probe failed (HTTP ${res.status})`,
        checks: [{ name: "debug-endpoint", status: "degraded", detail: `HTTP ${res.status}`, age_minutes: null }],
        degraded_sources: ["debug-endpoint"],
        critical_gaps: ["PGA debug route unreachable"],
        last_checked: now,
      };
    }
    const data = await res.json() as Record<string, unknown>;

    const dgCacheStep = (data.steps as any)?.dg_cache ?? {};
    const contextHintsStep = (data.steps as any)?.context_hints ?? {};

    const cacheReady = Boolean(dgCacheStep.ready);
    const rankingsCount = Number(dgCacheStep.rankingsCount ?? 0);
    checks.push({
      name: "datagolf-cache",
      status: cacheReady ? "healthy" : "degraded",
      detail: `${rankingsCount} DG rankings, tournament: ${dgCacheStep.tournament ?? "none"}`,
      age_minutes: ageMinutes(dgCacheStep.lastScrape),
    });

    const predCount = Number(dgCacheStep.predictionsCount ?? 0);
    checks.push({
      name: "dg-predictions",
      status: predCount > 0 ? "healthy" : "stale",
      detail: `${predCount} DG predictions${cacheReady ? "" : " (cache not ready)"}`,
      age_minutes: ageMinutes(dgCacheStep.lastScrape),
    });

    const courseWeather = contextHintsStep?.course_weather;
    checks.push({
      name: "course-weather",
      status: courseWeather?.status === "available" ? "healthy" : "stale",
      detail: courseWeather?.status === "available"
        ? `Wind: ${courseWeather.wind_mph ?? "?"}mph, temp: ${courseWeather.temp_f ?? "?"}°F`
        : "Course weather unavailable (unmapped venue or off-week)",
      age_minutes: null,
    });

    const degraded = checks.filter((c) => c.status !== "healthy").map((c) => c.name);
    const overall = worstStatus(checks.map((c) => c.status));

    return {
      sport: "PGA",
      overall,
      model_ready: cacheReady,
      model_ready_note: cacheReady ? "DG cache healthy" : "DG cache missing or stale",
      checks,
      degraded_sources: degraded,
      critical_gaps: cacheReady ? [] : ["DG cache unavailable — picks will use bundled snapshot"],
      last_checked: now,
    };
  } catch (err) {
    return {
      sport: "PGA",
      overall: "unknown",
      model_ready: false,
      model_ready_note: `Probe error: ${err instanceof Error ? err.message : String(err)}`,
      checks: [],
      degraded_sources: ["all"],
      critical_gaps: ["PGA probe failed"],
      last_checked: now,
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const sport = req.nextUrl.searchParams.get("sport")?.toUpperCase() ?? "ALL";
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin || "http://localhost:3000";

    const sportsToCheck = sport === "ALL"
      ? ["NHL", "NBA", "MLB", "PGA"]
      : [sport];

    const probeMap: Record<string, (url: string) => Promise<SportHealthResult>> = {
      NHL: probeNHL,
      NBA: probeNBA,
      MLB: probeMLB,
      PGA: probePGA,
    };

    const results = await Promise.allSettled(
      sportsToCheck.map((s) => {
        const probe = probeMap[s];
        return probe ? probe(baseUrl) : Promise.resolve<SportHealthResult>({
          sport: s,
          overall: "unknown",
          model_ready: false,
          model_ready_note: "No probe configured for this sport",
          checks: [],
          degraded_sources: [],
          critical_gaps: [],
          last_checked: new Date().toISOString(),
        });
      }),
    );

    const sports: SportHealthResult[] = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            sport: sportsToCheck[i],
            overall: "unknown" as HealthStatus,
            model_ready: false,
            model_ready_note: `Probe threw: ${r.reason}`,
            checks: [],
            degraded_sources: [],
            critical_gaps: [],
            last_checked: new Date().toISOString(),
          },
    );

    const overallStatus = worstStatus(sports.map((s) => s.overall));
    const activeDegradations = sports.flatMap((s) =>
      s.degraded_sources.map((src) => ({
        sport: s.sport,
        source: src,
        detail: s.checks.find((c) => c.name === src)?.detail ?? "degraded",
      })),
    );
    const modelReadySports = sports.filter((s) => s.model_ready).map((s) => s.sport);
    const modelBlockedSports = sports.filter((s) => !s.model_ready).map((s) => s.sport);

    const criticalCount = sports.flatMap((s) => s.critical_gaps).length;
    const summary = [
      `Overall: ${overallStatus}.`,
      `${modelReadySports.length}/${sports.length} sport(s) model-ready.`,
      activeDegradations.length > 0 ? `${activeDegradations.length} active degradation(s).` : "No degradations.",
      criticalCount > 0 ? `${criticalCount} critical gap(s) — see critical_gaps per sport.` : "",
    ].filter(Boolean).join(" ");

    const dashboard: SourceHealthDashboard = {
      generated_at: new Date().toISOString(),
      overall_status: overallStatus,
      sports,
      active_degradations: activeDegradations,
      model_ready_sports: modelReadySports,
      model_blocked_sports: modelBlockedSports,
      summary,
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("[source-health] failed", error);
    return NextResponse.json({ error: "Source health check failed" }, { status: 500 });
  }
}
