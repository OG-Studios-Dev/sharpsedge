import { createServerClient } from "@/lib/supabase-server";
import type { PickHistoryRecord, ProfileRecord, SystemHealthCheck } from "@/lib/supabase-types";

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

export async function getSystemHealth() {
  return Promise.all([
    checkEndpoint("NHL API", "https://api-web.nhle.com/v1/standings/now"),
    checkEndpoint("ESPN API", "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"),
    checkEndpoint(
      "Odds API",
      `https://api.the-odds-api.com/v4/sports/?apiKey=${process.env.ODDS_API_KEY ?? ""}`,
      Boolean(process.env.ODDS_API_KEY),
    ),
  ]);
}

export async function getAdminOverviewData() {
  const supabase = createServerClient();
  const [users, picks, healthChecks] = await Promise.all([
    supabase.profiles.list(),
    supabase.pickHistory.list(),
    getSystemHealth(),
  ]);

  const pickSummary = summarizePickHistory(picks);
  const recentSignups = users.filter((user) => {
    const created = new Date(user.created_at).getTime();
    return Number.isFinite(created) && created >= daysAgo(7);
  }).length;

  return {
    totalUsers: users.length,
    recentSignups,
    users,
    picks,
    pickSummary,
    healthChecks,
    healthyApis: healthChecks.filter((check) => check.ok).length,
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
