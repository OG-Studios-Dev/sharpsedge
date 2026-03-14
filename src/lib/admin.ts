import { execSync } from "child_process";
import packageJson from "../../package.json";
import { computePickRecord } from "@/lib/pick-record";
import { readPickHistory } from "@/lib/pick-history";
import type { AIPick } from "@/lib/types";
import { listUsers, type StoredUser } from "@/lib/users";

export type ApiHealthStatus = {
  key: "nhl" | "nba" | "odds";
  label: string;
  endpoint: string;
  connected: boolean;
  details: string;
  latencyMs: number | null;
  remainingQuota: string | null;
  checkedAt: string;
};

export type DailyPickBreakdown = {
  date: string;
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  resolved: number;
  winPct: number;
  netUnits: number;
};

export type RunningWinPctPoint = {
  date: string;
  wins: number;
  losses: number;
  resolved: number;
  winPct: number;
};

const API_HEALTH_TTL_MS = 60 * 1000;

let apiHealthCache: { timestamp: number; statuses: ApiHealthStatus[] } | null = null;

function getStartOfToday(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getStartOfWeek(now = new Date()) {
  const start = getStartOfToday(now);
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  return start;
}

function happenedOnOrAfter(value: string | null, threshold: Date) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= threshold.getTime();
}

function calculateWinPct(wins: number, losses: number) {
  const decided = wins + losses;
  return decided > 0 ? (wins / decided) * 100 : 0;
}

function groupPicksByDate(picks: AIPick[]) {
  const grouped = new Map<string, AIPick[]>();

  for (const pick of picks) {
    const current = grouped.get(pick.date) ?? [];
    current.push(pick);
    grouped.set(pick.date, current);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, datePicks]) => {
      const record = computePickRecord(datePicks);

      return {
        date,
        total: datePicks.length,
        wins: record.wins,
        losses: record.losses,
        pushes: record.pushes,
        pending: record.pending,
        resolved: record.wins + record.losses + record.pushes,
        winPct: calculateWinPct(record.wins, record.losses),
        netUnits: record.profitUnits,
      } satisfies DailyPickBreakdown;
    });
}

function buildRunningWinPct(dailyBreakdown: DailyPickBreakdown[]) {
  let wins = 0;
  let losses = 0;

  return Array.from(dailyBreakdown)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      wins += day.wins;
      losses += day.losses;

      return {
        date: day.date,
        wins,
        losses,
        resolved: wins + losses,
        winPct: calculateWinPct(wins, losses),
      } satisfies RunningWinPctPoint;
    });
}

function summarizeUsers(users: StoredUser[]) {
  const now = new Date();
  const startOfToday = getStartOfToday(now);
  const startOfWeek = getStartOfWeek(now);
  const activeThreshold = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

  return {
    totalUsers: users.length,
    adminCount: users.filter((user) => user.role === "admin").length,
    signupsToday: users.filter((user) => happenedOnOrAfter(user.createdAt, startOfToday)).length,
    signupsThisWeek: users.filter((user) => happenedOnOrAfter(user.createdAt, startOfWeek)).length,
    activeUsers: users.filter((user) => happenedOnOrAfter(user.lastLoginAt, activeThreshold)).length,
  };
}

function summarizePicks(picks: AIPick[]) {
  const record = computePickRecord(picks);
  const dailyBreakdown = groupPicksByDate(picks);
  const runningWinPct = buildRunningWinPct(dailyBreakdown);

  return {
    picks,
    wins: record.wins,
    losses: record.losses,
    pushes: record.pushes,
    pending: record.pending,
    resolved: record.wins + record.losses + record.pushes,
    totalPicks: picks.length,
    netUnits: record.profitUnits,
    winPct: calculateWinPct(record.wins, record.losses),
    dailyBreakdown,
    runningWinPct,
  };
}

function getGitValue(command: string) {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

async function checkJsonEndpoint(
  key: ApiHealthStatus["key"],
  label: string,
  endpoint: string,
  validate: (payload: any) => boolean,
  init?: RequestInit,
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(endpoint, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const latencyMs = Date.now() - startedAt;
    const remaining = response.headers.get("x-requests-remaining");
    const used = response.headers.get("x-requests-used");
    const quota = remaining ? `${remaining} remaining${used ? ` · ${used} used` : ""}` : null;
    const payloadValid = validate(payload);

    if (!response.ok) {
      return {
        key,
        label,
        endpoint,
        connected: false,
        details: `HTTP ${response.status}`,
        latencyMs,
        remainingQuota: quota,
        checkedAt: new Date().toISOString(),
      } satisfies ApiHealthStatus;
    }

    return {
      key,
      label,
      endpoint,
      connected: payloadValid,
      details: payloadValid ? "Connected" : "Unexpected response payload",
      latencyMs,
      remainingQuota: quota,
      checkedAt: new Date().toISOString(),
    } satisfies ApiHealthStatus;
  } catch (error) {
    return {
      key,
      label,
      endpoint,
      connected: false,
      details: error instanceof Error ? error.message : "Request failed",
      latencyMs: null,
      remainingQuota: null,
      checkedAt: new Date().toISOString(),
    } satisfies ApiHealthStatus;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getApiHealthStatuses() {
  if (apiHealthCache && Date.now() - apiHealthCache.timestamp < API_HEALTH_TTL_MS) {
    return apiHealthCache.statuses;
  }

  const oddsApiKey = process.env.ODDS_API_KEY;
  const oddsEndpoint = "https://api.the-odds-api.com/v4/sports/icehockey_nhl/odds?regions=us&markets=h2h&oddsFormat=american";

  const requests: Promise<ApiHealthStatus>[] = [
    checkJsonEndpoint(
      "nhl",
      "NHL Schedule API",
      "https://api-web.nhle.com/v1/schedule/now",
      (payload) => Array.isArray(payload?.gameWeek),
    ),
    checkJsonEndpoint(
      "nba",
      "ESPN NBA API",
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
      (payload) => Array.isArray(payload?.events),
    ),
  ];

  if (oddsApiKey && oddsApiKey !== "your_key_here") {
    requests.push(
      checkJsonEndpoint(
        "odds",
        "Odds API",
        `${oddsEndpoint}&apiKey=${oddsApiKey}`,
        (payload) => Array.isArray(payload),
      ).then((status) => ({
        ...status,
        endpoint: oddsEndpoint,
      })),
    );
  } else {
    requests.push(Promise.resolve({
      key: "odds",
      label: "Odds API",
      endpoint: oddsEndpoint,
      connected: false,
      details: "ODDS_API_KEY is not configured",
      latencyMs: null,
      remainingQuota: null,
      checkedAt: new Date().toISOString(),
    } satisfies ApiHealthStatus));
  }

  const statuses = await Promise.all(requests);
  apiHealthCache = {
    timestamp: Date.now(),
    statuses,
  };

  return statuses;
}

export async function getAdminOverviewData() {
  const [users, picks, apiHealth] = await Promise.all([
    listUsers(),
    readPickHistory(),
    getApiHealthStatuses(),
  ]);

  return {
    userStats: summarizeUsers(users),
    pickSummary: summarizePicks(picks),
    apiHealth,
    recentUsers: users.slice(0, 5),
  };
}

export async function getAdminPicksData() {
  const picks = await readPickHistory();
  return summarizePicks(picks);
}

export async function getSystemSummary() {
  const apiHealth = await getApiHealthStatuses();

  return {
    apiHealth,
    deployment: {
      provider: process.env.VERCEL ? "Vercel" : "Local",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXTAUTH_URL ?? "Not configured",
      region: process.env.VERCEL_REGION ?? "Local machine",
      projectUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "Unavailable",
    },
    app: {
      version: packageJson.version,
      lastCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? getGitValue("git rev-parse --short HEAD") ?? "Unavailable",
      lastCommitDate: getGitValue("git log -1 --format=%cI") ?? "Unavailable",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? getGitValue("git branch --show-current") ?? "Unavailable",
    },
    environment: [
      { label: "Node.js", value: process.version },
      { label: "Runtime", value: process.env.NEXT_RUNTIME ?? "nodejs" },
      { label: "NEXTAUTH_URL", value: process.env.NEXTAUTH_URL ? "Configured" : "Missing" },
      { label: "NEXTAUTH_SECRET", value: process.env.NEXTAUTH_SECRET ? "Configured" : "Missing" },
      { label: "ODDS_API_KEY", value: process.env.ODDS_API_KEY ? "Configured" : "Missing" },
      { label: "Users store", value: process.env.VERCEL ? "/tmp/goosalytics/users.json" : "data/users.json" },
      { label: "Pick history store", value: process.env.VERCEL ? "/tmp/goosalytics/pick-history.json" : "data/pick-history.json" },
    ],
  };
}
