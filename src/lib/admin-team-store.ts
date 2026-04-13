import { promises as fs } from "fs";
import path from "path";

export type TeamStatus = "green" | "yellow" | "red";
export type SprintStatus = "done" | "partial" | "blocked" | "unverified";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  lane: string;
  manager: string;
  focus: string;
  kpi: string;
  status: TeamStatus;
  outputSummary: string;
  sprintCompletions: number;
  sprintPartials: number;
  sprintBlocked: number;
  wins: string[];
  risks: string[];
  updatedAt: string;
};

export type SprintWorkItem = {
  id: string;
  title: string;
  lane: string;
  ownerId: string;
  goal: string;
  proofRequired: string;
  status: SprintStatus;
  dueDate: string | null;
  notes: string;
  updatedAt: string;
};

export type TeamScorecardEntry = {
  id: string;
  weekLabel: string;
  capturedAt: string;
  memberId: string;
  status: TeamStatus;
  completions: number;
  partials: number;
  blocked: number;
  summary: string;
};

export type AdminTeamBoardData = {
  lastReviewedAt: string | null;
  members: TeamMember[];
  workstreams: SprintWorkItem[];
  scorecards: TeamScorecardEntry[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const TEAM_PATH = path.join(DATA_DIR, "admin-team-board.json");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getWeekLabel(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `Week of ${year}-${month}-${day}`;
}

const DEFAULT_DATA: AdminTeamBoardData = {
  lastReviewedAt: nowIso(),
  members: [],
  workstreams: [],
  scorecards: [],
};

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(TEAM_PATH);
  } catch {
    await fs.writeFile(TEAM_PATH, JSON.stringify(DEFAULT_DATA, null, 2) + "\n", "utf8");
  }
}

async function writeBoard(data: AdminTeamBoardData) {
  await ensureStore();
  await fs.writeFile(TEAM_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeData(parsed: any): AdminTeamBoardData {
  return {
    lastReviewedAt: parsed?.lastReviewedAt ?? null,
    members: Array.isArray(parsed?.members) ? parsed.members : [],
    workstreams: Array.isArray(parsed?.workstreams) ? parsed.workstreams : [],
    scorecards: Array.isArray(parsed?.scorecards) ? parsed.scorecards : [],
  };
}

export async function readAdminTeamBoard(): Promise<AdminTeamBoardData> {
  await ensureStore();
  const raw = await fs.readFile(TEAM_PATH, "utf8");
  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    return DEFAULT_DATA;
  }
}

export async function updateTeamMember(id: string, updates: Partial<Omit<TeamMember, "id">>) {
  const data = await readAdminTeamBoard();
  const now = nowIso();
  data.members = data.members.map((member) => (member.id === id ? { ...member, ...updates, updatedAt: now } : member));
  data.lastReviewedAt = now;
  await writeBoard(data);
  return data;
}

export async function addWorkstream(input: Omit<SprintWorkItem, "id" | "updatedAt">) {
  const data = await readAdminTeamBoard();
  const item: SprintWorkItem = {
    id: makeId("workstream"),
    updatedAt: nowIso(),
    ...input,
  };
  data.workstreams.unshift(item);
  data.lastReviewedAt = nowIso();
  await writeBoard(data);
  return item;
}

export async function updateWorkstream(id: string, updates: Partial<Omit<SprintWorkItem, "id">>) {
  const data = await readAdminTeamBoard();
  const now = nowIso();
  data.workstreams = data.workstreams.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: now } : item));
  data.lastReviewedAt = now;
  await writeBoard(data);
  return data;
}

export async function captureWeeklyScorecard(weekLabel?: string) {
  const data = await readAdminTeamBoard();
  const capturedAt = nowIso();
  const label = weekLabel?.trim() || getWeekLabel(new Date(capturedAt));
  const freshEntries: TeamScorecardEntry[] = data.members.map((member) => ({
    id: makeId(`score_${member.id}`),
    weekLabel: label,
    capturedAt,
    memberId: member.id,
    status: member.status,
    completions: member.sprintCompletions,
    partials: member.sprintPartials,
    blocked: member.sprintBlocked,
    summary: member.outputSummary,
  }));

  const existingForWeek = new Set(
    data.scorecards.filter((entry) => entry.weekLabel === label).map((entry) => entry.memberId),
  );

  data.scorecards = [
    ...freshEntries.filter((entry) => !existingForWeek.has(entry.memberId)),
    ...data.scorecards,
  ].slice(0, 500);
  data.lastReviewedAt = capturedAt;
  await writeBoard(data);
  return data;
}
