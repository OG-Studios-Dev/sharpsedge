import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createServerClient } from "@/lib/supabase-server";
import { readAdminOpsData } from "@/lib/admin-ops-store";
import type { PickHistoryRecord, ProfileRecord, SystemHealthCheck } from "@/lib/supabase-types";
import { getDateKey } from "@/lib/date-utils";
import { readFile } from "node:fs/promises";
import { getMLBEnrichmentBoard } from "@/lib/mlb-enrichment";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";

type PickSummary = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
};

function daysAgo(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function summarizePickHistory(picks: PickHistoryRecord[]): PickSummary {
  return picks.reduce<PickSummary>((acc, pick) => {
    if (pick.result === "win") acc.wins += 1;
    else if (pick.result === "loss") acc.losses += 1;
    else if (pick.result === "push") acc.pushes += 1;
    else acc.pending += 1;
    return acc;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0 });
}

async function checkEndpoint(name: string, url: string, enabled = true): Promise<SystemHealthCheck> {
  if (!enabled) {
    return {
      name,
      ok: false,
      detail: "Not configured",
    };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    return {
      name,
      ok: response.ok,
      detail: response.ok ? "Healthy" : `HTTP ${response.status}`,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "Request failed",
    };
  }
}

export function getEnvironmentStatus() {
  return [
    { name: "NEXT_PUBLIC_SUPABASE_URL", present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { name: "SUPABASE_SERVICE_ROLE_KEY", present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { name: "ODDS_API_KEY", present: Boolean(process.env.ODDS_API_KEY) },
  ];
}

async function getMarketSnapshotHealth(): Promise<SystemHealthCheck> {
  try {
    const dateKey = getDateKey();
    const raw = await readFile(path.join(process.cwd(), "data", "market-snapshots", `${dateKey}.json`), "utf8");
    const parsed = JSON.parse(raw);
    const snapshots = Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
    const latest = snapshots.at(-1) || null;
    if (!latest) {
      return {
        name: "Market snapshot cadence",
        ok: false,
        status: "missing",
        detail: "No market snapshot captured for today yet.",
        checkedAt: new Date().toISOString(),
        freshnessSummary: "Daily market snapshot file exists without captures.",
      };
    }
    return {
      name: "Market snapshot cadence",
      ok: latest.health?.status === "healthy",
      status: latest.health?.status || "missing",
      detail: latest.health?.summary || "Market snapshot health unavailable.",
      checkedAt: new Date().toISOString(),
      lastSuccessAt: latest.capturedAt,
      freshnessSummary: latest.freshness?.staleSourceCount ? `${latest.freshness.staleSourceCount} stale upstream source entries on latest capture.` : "Latest capture had no stale upstream source entries.",
    };
  } catch {
    return {
      name: "Market snapshot cadence",
      ok: false,
      status: "missing",
      detail: "Market snapshot archive missing for today.",
      checkedAt: new Date().toISOString(),
      freshnessSummary: "No local daily market snapshot file found.",
    };
  }
}

async function getMLBEnrichmentHealth(): Promise<SystemHealthCheck> {
  try {
    const board = await getMLBEnrichmentBoard();
    const degradedGames = (board.games || []).filter((game: any) => game?.sourceHealth?.status && game.sourceHealth.status !== "healthy");
    return {
      name: "MLB enrichment board",
      ok: degradedGames.length === 0,
      status: degradedGames.length ? "degraded" : "healthy",
      detail: degradedGames.length
        ? `${degradedGames.length} MLB game(s) have degraded source rails today.`
        : "MLB enrichment board rails healthy for today.",
      checkedAt: new Date().toISOString(),
      lastSuccessAt: board.generatedAt,
      freshnessSummary: `${board.gamesCount} game(s) checked for lineups, weather, bullpen, F5, and probable starters.`,
    };
  } catch (error) {
    return {
      name: "MLB enrichment board",
      ok: false,
      status: "missing",
      detail: error instanceof Error ? error.message : "MLB enrichment board unavailable",
      checkedAt: new Date().toISOString(),
    };
  }
}

async function getNHLAvailabilityHealth(): Promise<SystemHealthCheck> {
  try {
    const board = await getTodayNHLContextBoard();
    return {
      name: "NHL official availability rail",
      ok: board.sourceHealth.status === "healthy",
      status: board.sourceHealth.status,
      detail: board.availability.note,
      checkedAt: new Date().toISOString(),
      lastSuccessAt: board.builtAt,
      freshnessSummary: `${board.availability.counts.teamsWithOfficialNewsLinks} team(s) with official links, ${board.availability.counts.teamsMissingOfficialSignals} missing official signals.`,
    };
  } catch (error) {
    return {
      name: "NHL official availability rail",
      ok: false,
      status: "missing",
      detail: error instanceof Error ? error.message : "NHL availability rail unavailable",
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function getSystemHealth() {
  return Promise.all([
    checkEndpoint("NHL API", "https://api-web.nhle.com/v1/standings/now"),
    checkEndpoint("ESPN API", "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"),
    checkEndpoint(
      "Odds API",
      `https://api.the-odds-api.com/v4/sports/?apiKey=${process.env.ODDS_API_KEY ?? ""}`,
      Boolean(process.env.ODDS_API_KEY),
    ),
    getMarketSnapshotHealth(),
    getMLBEnrichmentHealth(),
    getNHLAvailabilityHealth(),
  ]);
}

async function getCronDefinitions() {
  try {
    const vercelPath = path.join(process.cwd(), "vercel.json");
    const raw = await fs.readFile(vercelPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.crons) ? parsed.crons : [];
  } catch {
    return [];
  }
}

function getGitSnapshot() {
  try {
    const sha = execSync("git rev-parse --short HEAD", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const subject = execSync("git log -1 --pretty=%s", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const committedAt = execSync("git log -1 --date=iso --pretty=%cd", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return { sha, subject, committedAt };
  } catch {
    return null;
  }
}

export async function getAdminOverviewData() {
  const supabase = createServerClient();
  const [users, picks, healthChecks, opsData, crons] = await Promise.all([
    supabase.profiles.list(),
    supabase.pickHistory.list(),
    getSystemHealth(),
    readAdminOpsData(),
    getCronDefinitions(),
  ]);

  const pickSummary = summarizePickHistory(picks);
  const recentSignups = users.filter((user) => {
    const created = new Date(user.created_at).getTime();
    return Number.isFinite(created) && created >= daysAgo(7);
  }).length;

  const cronIssues = opsData.cronSchedules.filter((cron) => (cron.consecutiveFailures ?? 0) > 0 || (!cron.lastSuccessAt && Boolean(cron.lastFailureAt))).length;
  const activeIncidents = opsData.incidents.filter((incident) => incident.status !== "resolved").length;

  return {
    totalUsers: users.length,
    recentSignups,
    users,
    picks,
    pickSummary,
    healthChecks,
    healthyApis: healthChecks.filter((check) => check.ok).length,
    gitSnapshot: getGitSnapshot(),
    vercelCronCount: crons.length,
    opsSummary: {
      totalBugs: opsData.bugs.length,
      openBugs: opsData.bugs.filter((bug) => bug.status !== "fixed").length,
      cronSchedules: opsData.cronSchedules.length,
      cronIssues,
      activeIncidents,
      lastReviewedAt: opsData.lastReviewedAt,
    },
  };
}

export async function getAdminUsers(): Promise<ProfileRecord[]> {
  const supabase = createServerClient();
  return supabase.profiles.list();
}

export async function getAdminPicks(): Promise<PickHistoryRecord[]> {
  const supabase = createServerClient();
  return supabase.pickHistory.list();
}

export async function getAdminSystemData() {
  const [healthChecks, envStatus, opsData, crons] = await Promise.all([
    getSystemHealth(),
    Promise.resolve(getEnvironmentStatus()),
    readAdminOpsData(),
    getCronDefinitions(),
  ]);

  return {
    healthChecks,
    envStatus,
    gitSnapshot: getGitSnapshot(),
    vercelCrons: crons,
    trackedCrons: opsData.cronSchedules,
    activeIncidents: opsData.incidents.filter((incident) => incident.status !== "resolved"),
  };
}
