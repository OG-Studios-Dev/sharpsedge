import { promises as fs } from "fs";
import path from "path";

export type BugStatus = "open" | "in_progress" | "fixed" | "deferred";
export type BugSeverity = "critical" | "high" | "medium" | "low";

export type AdminBug = {
  id: string;
  title: string;
  summary: string;
  area: string;
  severity: BugSeverity;
  status: BugStatus;
  owner: string;
  source: string;
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
  enabled: boolean;
  notes: string;
  updatedAt: string;
};

export type AdminOpsData = {
  lastReviewedAt: string | null;
  bugs: AdminBug[];
  cronSchedules: CronScheduleItem[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const OPS_PATH = path.join(DATA_DIR, "admin-ops.json");

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
      foundAt: "2026-03-21T05:40:00.000Z",
      updatedAt: new Date().toISOString(),
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
      foundAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      enabled: true,
      notes: "Keep this aligned with heartbeat + any Vercel cron coverage.",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cron_pga_scrape",
      name: "PGA DataGolf scrape",
      schedule: "6AM ET (tournament windows)",
      purpose: "Refresh cached tournament data before picks generation.",
      owner: "Golf pipeline",
      target: "datagolf_cache",
      enabled: true,
      notes: "Needs monitoring when source pages change.",
      updatedAt: new Date().toISOString(),
    },
  ],
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(OPS_PATH);
  } catch {
    await fs.writeFile(OPS_PATH, JSON.stringify(DEFAULT_DATA, null, 2) + "\n", "utf8");
  }
}

export async function readAdminOpsData(): Promise<AdminOpsData> {
  await ensureStore();
  const raw = await fs.readFile(OPS_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return {
      lastReviewedAt: parsed?.lastReviewedAt ?? null,
      bugs: Array.isArray(parsed?.bugs) ? parsed.bugs : [],
      cronSchedules: Array.isArray(parsed?.cronSchedules) ? parsed.cronSchedules : [],
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
  const now = new Date().toISOString();
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
  const now = new Date().toISOString();
  data.bugs = data.bugs.map((bug) => (bug.id === id ? { ...bug, ...updates, updatedAt: now } : bug));
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return data;
}

export async function addCronSchedule(input: Omit<CronScheduleItem, "id" | "updatedAt">) {
  const data = await readAdminOpsData();
  const now = new Date().toISOString();
  const item: CronScheduleItem = {
    id: makeId("cron"),
    updatedAt: now,
    ...input,
  };

  data.cronSchedules.unshift(item);
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return item;
}

export async function updateCronSchedule(id: string, updates: Partial<Omit<CronScheduleItem, "id">>) {
  const data = await readAdminOpsData();
  const now = new Date().toISOString();
  data.cronSchedules = data.cronSchedules.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: now } : item));
  data.lastReviewedAt = now;
  await writeAdminOpsData(data);
  return data;
}
