import { promises as fs } from "fs";
import path from "path";

export type BugStatus = "open" | "in_progress" | "fixed" | "deferred";
export type BugSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "investigating" | "monitoring" | "resolved";
export type IncidentSeverity = "sev1" | "sev2" | "sev3";

export type AdminBug = {
  id: string;
  title: string;
  summary: string;
  area: string;
  severity: BugSeverity;
  status: BugStatus;
  owner: string;
  source: string;
  dueAt?: string | null;
  notes?: string;
  foundAt: string;
  updatedAt: string;
};

export type CronScheduleItem = {
  id: string;
  name: string;
  schedule: string;
  purpose: string;
  owner: string;
  target: string;
  path?: string;
  enabled: boolean;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  consecutiveFailures?: number;
  notes: string;
  updatedAt: string;
};

export type AdminIncident = {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  owner: string;
  summary: string;
  impact: string;
  startedAt: string;
  resolvedAt?: string | null;
  notes?: string;
  updatedAt: string;
};

export type AdminOpsData = {
  lastReviewedAt: string | null;
  bugs: AdminBug[];
  cronSchedules: CronScheduleItem[];
  incidents: AdminIncident[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const OPS_PATH = path.join(DATA_DIR, "admin-ops.json");

function nowIso() {
  return new Date().toISOString();
}

const DEFAULT_DATA: AdminOpsData = {
  lastReviewedAt: null,
  bugs: [
    {
      id: "bug_team_pages_multi_sport",
      title: "Generic team page only handled NHL routes",
      summary: "MLB drill-downs like /team/OAK rendered 'Team not found' because the generic team page and API were NHL-only.",
      area: "Drill-downs / Team Pages",
      severity: "high",
      status: "fixed",
      owner: "Magoo",
      source: "Marco screenshot / QA",
      dueAt: null,
      notes: "Fixed by making generic team pages detect league and support MLB data paths.",
      foundAt: "2026-03-21T05:40:00.000Z",
      updatedAt: nowIso(),
    },
    {
      id: "bug_full_site_qa_backlog",
      title: "Full admin QA backlog needs structured tracking",
      summary: "Bugs and cron jobs were being tracked ad hoc in chat instead of in one IT review surface.",
      area: "Admin / Operations",
      severity: "medium",
      status: "in_progress",
      owner: "Magoo",
      source: "Marco request",
      dueAt: null,
      notes: "Initial admin ops surface created, but should keep evolving with more operational controls.",
      foundAt: nowIso(),
      updatedAt: nowIso(),
    },
  ],
  cronSchedules: [
    {
      id: "cron_goosalytics_qa_cycle",
      name: "QA cycle",
      schedule: "9AM / 2PM / 7PM ET daily",
      purpose: "Run structured QA checks across pages, picks, APIs, and odds coverage.",
      owner: "QA team",
      target: "Site + API sweep",
      path: "/heartbeat",
      enabled: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      notes: "Keep this aligned with heartbeat + any Vercel cron coverage. Production must set CRON_SECRET or cron-mode requests should fail closed.",
      updatedAt: nowIso(),
    },
    {
      id: "cron_pga_scrape",
      name: "PGA DataGolf scrape",
      schedule: "0 10 * * 2,3,4",
      purpose: "Refresh cached tournament data before picks generation.",
      owner: "Golf pipeline",
      target: "datagolf_cache",
      path: "/api/golf/scrape?cron=true",
      enabled: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      notes: "Backed by vercel.json cron during tournament windows.",
      updatedAt: nowIso(),
    },
    {
      id: "cron_market_snapshot_capture",
      name: "Market snapshot capture",
      schedule: "17 * * * *",
      purpose: "Archive conservative hourly NHL/NBA/MLB aggregated odds snapshots for line-history, freshness, and cadence drift tracking.",
      owner: "Odds pipeline",
      target: "market_snapshots",
      path: "/api/odds/aggregated/snapshot?cron=true&sports=NHL,NBA,MLB",
      enabled: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      notes: "Conservative cadence by design to limit upstream load while seeding usable history. Admin health now flags stale cadence and stale upstream books from day 1.",
      updatedAt: nowIso(),
    },
    {
      id: "cron_nba_q1_q3_daily_archive",
      name: "NBA Q1/Q3 daily archive",
      schedule: "55 17 * * *",
      purpose: "Capture a dedicated daily NBA checkpoint so quarter-spread rails have an explicit archive target for Goose-style settlement and audit work.",
      owner: "Odds pipeline",
      target: "market_snapshots",
      path: "/api/odds/aggregated/snapshot?cron=true&sports=NBA&reason=nba-q1-q3-daily-archive",
      enabled: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      notes: "Runs separately from the hourly multi-sport cadence so NBA quarter-market coverage has a named daily checkpoint even if hourly snapshots are sparse or noisy. Zero Q1/Q3 rows now raise an admin incident instead of failing silently.",
      updatedAt: nowIso(),
    },
    {
      id: "cron_system_refresh",
      name: "Systems refresh",
      schedule: "0 15 * * *",
      purpose: "Refresh system rails daily so Goose/MLB/NHL health surfaces update even before manual page loads.",
      owner: "Systems pipeline",
      target: "systems_tracking",
      path: "/api/systems/refresh?cron=true",
      enabled: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      notes: "Backed by vercel.json cron. Treat missing success as an operational issue because source placement checks start day 1.",
      updatedAt: nowIso(),
    },
  ],
  incidents: [],
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(OPS_PATH);
  } catch {
    await fs.writeFile(OPS_PATH, JSON.stringify(DEFAULT_DATA, null, 2) + "\n", "utf8");
  }
}

function normalizeCron(item: Partial<CronScheduleItem>): CronScheduleItem {
  return {
    id: item.id || makeId("cron"),
    name: item.name || "Unnamed cron",
    schedule: item.schedule || "",
    purpose: item.purpose || "",
    owner: item.owner || "Unassigned",
    target: item.target || "",
    path: item.path || "",
    enabled: Boolean(item.enabled),
    lastRunAt: item.lastRunAt ?? null,
    lastSuccessAt: item.lastSuccessAt ?? null,
    lastFailureAt: item.lastFailureAt ?? null,
    consecutiveFailures: Number.isFinite(item.consecutiveFailures) ? Number(item.consecutiveFailures) : 0,
    notes: item.notes || "",
    updatedAt: item.updatedAt || nowIso(),
  };
}

function normalizeIncident(item: Partial<AdminIncident>): AdminIncident {
  return {
    id: item.id || makeId("incident"),
    title: item.title || "Untitled incident",
    severity: (item.severity as IncidentSeverity) || "sev3",
    status: (item.status as IncidentStatus) || "investigating",
    owner: item.owner || "Unassigned",
    summary: item.summary || "",
    impact: item.impact || "",
    startedAt: item.startedAt || nowIso(),
    resolvedAt: item.resolvedAt ?? null,
    notes: item.notes || "",
    updatedAt: item.updatedAt || nowIso(),
  };
}

export async function readAdminOpsData(): Promise<AdminOpsData> {
  await ensureStore();
  const raw = await fs.readFile(OPS_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return {
      lastReviewedAt: parsed?.lastReviewedAt ?? null,
      bugs: Array.isArray(parsed?.bugs) ? parsed.bugs : [],
      cronSchedules: Array.isArray(parsed?.cronSchedules) ? parsed.cronSchedules.map(normalizeCron) : [],
      incidents: Array.isArray(parsed?.incidents) ? parsed.incidents.map(normalizeIncident) : [],
    };
  } catch {
    return DEFAULT_DATA;
  }
}

async function writeAdminOpsData(data: AdminOpsData) {
  await ensureStore();
  await fs.writeFile(OPS_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function addBug(input: Omit<AdminBug, "id" | "foundAt" | "updatedAt">) {
  const data = await readAdminOpsData();
  const now = nowIso();
  const bug: AdminBug = {
    id: makeId("bug"),
    foundAt: now,
    updatedAt: now,
    ...input,
  };

  data.bugs.unshift(bug);
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return bug;
}

export async function updateBug(id: string, updates: Partial<Omit<AdminBug, "id" | "foundAt">>) {
  const data = await readAdminOpsData();
  const now = nowIso();
  data.bugs = data.bugs.map((bug) => (bug.id === id ? { ...bug, ...updates, updatedAt: now } : bug));
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return data;
}

export async function addCronSchedule(input: Omit<CronScheduleItem, "id" | "updatedAt">) {
  const data = await readAdminOpsData();
  const now = nowIso();
  const item: CronScheduleItem = normalizeCron({
    id: makeId("cron"),
    updatedAt: now,
    ...input,
  });

  data.cronSchedules.unshift(item);
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return item;
}

export async function updateCronSchedule(id: string, updates: Partial<Omit<CronScheduleItem, "id">>) {
  const data = await readAdminOpsData();
  const now = nowIso();
  data.cronSchedules = data.cronSchedules.map((item) => (item.id === id ? normalizeCron({ ...item, ...updates, updatedAt: now }) : item));
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return data;
}

export async function addIncident(input: Omit<AdminIncident, "id" | "startedAt" | "updatedAt">) {
  const data = await readAdminOpsData();
  const now = nowIso();
  const incident: AdminIncident = normalizeIncident({
    id: makeId("incident"),
    startedAt: now,
    updatedAt: now,
    ...input,
  });

  data.incidents.unshift(incident);
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return incident;
}

export async function updateIncident(id: string, updates: Partial<Omit<AdminIncident, "id" | "startedAt">>) {
  const data = await readAdminOpsData();
  const now = nowIso();
  data.incidents = data.incidents.map((incident) =>
    incident.id === id ? normalizeIncident({ ...incident, ...updates, updatedAt: now }) : incident,
  );
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return data;
}
