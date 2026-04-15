import { promises as fs } from "fs";
import path from "path";

export type TeamStatus = "green" | "yellow" | "red";
export type SprintStatus = "done" | "partial" | "blocked" | "unverified";
export type SprintPhase = "backlog" | "active" | "qa" | "done";
export type RoadmapStatus = "planned" | "active" | "at_risk" | "done";

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
  phase: SprintPhase;
  sprintId: string | null;
  assigneeIds: string[];
  dueDate: string | null;
  priority?: "p0" | "p1" | "p2";
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

export type RoadmapMilestone = {
  id: string;
  title: string;
  window: string;
  ownerId: string;
  status: RoadmapStatus;
  outcome: string;
  proofRequired: string;
  workstreamIds: string[];
  notes: string;
};

export type SprintPlan = {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
  ownerId: string;
  memberIds: string[];
  workstreamIds: string[];
  notes: string;
};

export type AdminTeamBoardData = {
  lastReviewedAt: string | null;
  members: TeamMember[];
  workstreams: SprintWorkItem[];
  scorecards: TeamScorecardEntry[];
  roadmap: RoadmapMilestone[];
  sprints: SprintPlan[];
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
  roadmap: [],
  sprints: [],
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

function deriveRoadmap(workstreams: SprintWorkItem[]): RoadmapMilestone[] {
  const definitions: Array<Omit<RoadmapMilestone, "status" | "workstreamIds"> & { workstreamMatcher: (item: SprintWorkItem) => boolean }> = [
    {
      id: "rm_soft_launch_foundation",
      title: "Sprint 1: Product foundation",
      window: "Apr 13 to Apr 20",
      ownerId: "rory",
      outcome: "Navigation, dashboard clarity, and onboarding are solid enough that new users do not get lost.",
      proofRequired: "Core user flow walkthrough passes with premium UX and clear next actions.",
      notes: "This is the first impression sprint. If this looks sloppy, nothing else matters.",
      workstreamMatcher: (item) => ["ws_nav_shell_cleanup", "ws_onboarding_profile", "ws_dashboard_trust"].includes(item.id),
    },
    {
      id: "rm_execution_system",
      title: "Sprint 2: Execution system and polish rails",
      window: "Apr 20 to Apr 27",
      ownerId: "finch",
      outcome: "Design system, page polish, and state handling stop drifting across the app.",
      proofRequired: "Shared patterns are visibly used across launch-critical surfaces and ugly states are cleaned up.",
      notes: "This is where the app stops feeling patched together.",
      workstreamMatcher: (item) => ["ws_design_system", "ws_core_page_polish", "ws_loading_error_empty"].includes(item.id),
    },
    {
      id: "rm_launch_trust",
      title: "Sprint 3: Data trust and launch gate",
      window: "Apr 20 to Apr 28",
      ownerId: "atlas",
      outcome: "Data trust, QA gating, and tester feedback loop are real and usable before soft launch.",
      proofRequired: "Critical data surfaces verified, QA gate enforced, tester loop active.",
      notes: "Trust dies fast if bad data or broken flows hit testers.",
      workstreamMatcher: (item) => ["ws_data_trust", "ws_goose2_history", "ws_launch_qa_gate", "ws_soft_launch_testers", "ws_conversion_flow"].includes(item.id),
    },
  ];

  return definitions.map((definition) => {
    const matched = workstreams.filter(definition.workstreamMatcher);
    const statuses = matched.map((item) => item.status);
    let status: RoadmapStatus = "planned";
    if (matched.length > 0 && statuses.every((value) => value === "done")) status = "done";
    else if (statuses.includes("blocked")) status = "at_risk";
    else if (matched.length > 0 && statuses.some((value) => value === "partial" || value === "done")) status = "active";
    return {
      id: definition.id,
      title: definition.title,
      window: definition.window,
      ownerId: definition.ownerId,
      status,
      outcome: definition.outcome,
      proofRequired: definition.proofRequired,
      workstreamIds: matched.map((item) => item.id),
      notes: definition.notes,
    };
  });
}

function deriveSprints(workstreams: SprintWorkItem[]): SprintPlan[] {
  const plans: SprintPlan[] = [
    {
      id: "sprint_2026_04_13",
      name: "Sprint Apr 13 to Apr 20",
      goal: "Get product foundation and roadmap discipline in place fast enough for new hires to execute immediately.",
      startDate: "2026-04-13",
      endDate: "2026-04-20",
      status: "active",
      ownerId: "magoo",
      memberIds: ["rory", "june", "halo", "ive", "finch"],
      workstreamIds: workstreams.filter((item) => ["ws_nav_shell_cleanup", "ws_onboarding_profile", "ws_dashboard_trust"].includes(item.id)).map((item) => item.id),
      notes: "This sprint should remove ambiguity and get the new product/design hires moving on concrete work.",
    },
    {
      id: "sprint_2026_04_20",
      name: "Sprint Apr 20 to Apr 27",
      goal: "Tighten execution quality, design consistency, and launch readiness across the core app.",
      startDate: "2026-04-20",
      endDate: "2026-04-27",
      status: "planned",
      ownerId: "forge",
      memberIds: ["finch", "slate", "quinn", "atlas", "vega", "cash", "pulse"],
      workstreamIds: workstreams.filter((item) => ["ws_design_system", "ws_core_page_polish", "ws_loading_error_empty", "ws_data_trust", "ws_goose2_history", "ws_launch_qa_gate", "ws_soft_launch_testers", "ws_conversion_flow"].includes(item.id)).map((item) => item.id),
      notes: "This sprint turns the board into real execution and closes launch risk instead of just describing it.",
    },
  ];

  return plans;
}

function normalizeWorkstream(item: any): SprintWorkItem {
  return {
    id: String(item?.id ?? makeId("workstream")),
    title: String(item?.title ?? "Untitled workstream"),
    lane: String(item?.lane ?? "General"),
    ownerId: String(item?.ownerId ?? ""),
    goal: String(item?.goal ?? ""),
    proofRequired: String(item?.proofRequired ?? ""),
    status: (["done", "partial", "blocked", "unverified"] as SprintStatus[]).includes(item?.status) ? item.status : "partial",
    phase: (["backlog", "active", "qa", "done"] as SprintPhase[]).includes(item?.phase) ? item.phase : (item?.status === "done" ? "done" : item?.status === "blocked" ? "active" : "active"),
    sprintId: item?.sprintId ? String(item.sprintId) : null,
    assigneeIds: Array.isArray(item?.assigneeIds) ? item.assigneeIds.map(String) : (item?.ownerId ? [String(item.ownerId)] : []),
    dueDate: item?.dueDate ? String(item.dueDate) : null,
    priority: (["p0", "p1", "p2"] as const).includes(item?.priority) ? item.priority : "p1",
    notes: String(item?.notes ?? ""),
    updatedAt: String(item?.updatedAt ?? nowIso()),
  };
}

function normalizeData(parsed: any): AdminTeamBoardData {
  const workstreams = Array.isArray(parsed?.workstreams) ? parsed.workstreams.map(normalizeWorkstream) : [];
  const roadmap = Array.isArray(parsed?.roadmap) && parsed.roadmap.length > 0 ? parsed.roadmap : deriveRoadmap(workstreams);
  const sprints = Array.isArray(parsed?.sprints) && parsed.sprints.length > 0 ? parsed.sprints : deriveSprints(workstreams);

  return {
    lastReviewedAt: parsed?.lastReviewedAt ?? null,
    members: Array.isArray(parsed?.members) ? parsed.members : [],
    workstreams,
    scorecards: Array.isArray(parsed?.scorecards) ? parsed.scorecards : [],
    roadmap,
    sprints,
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
  await writeBoard({ ...data, roadmap: deriveRoadmap(data.workstreams), sprints: deriveSprints(data.workstreams) });
  return readAdminTeamBoard();
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
  await writeBoard({ ...data, roadmap: deriveRoadmap(data.workstreams), sprints: deriveSprints(data.workstreams) });
  return item;
}

export async function updateWorkstream(id: string, updates: Partial<Omit<SprintWorkItem, "id">>) {
  const data = await readAdminTeamBoard();
  const now = nowIso();
  data.workstreams = data.workstreams.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: now } : item));
  data.lastReviewedAt = now;
  await writeBoard({ ...data, roadmap: deriveRoadmap(data.workstreams), sprints: deriveSprints(data.workstreams) });
  return readAdminTeamBoard();
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
  await writeBoard({ ...data, roadmap: deriveRoadmap(data.workstreams), sprints: deriveSprints(data.workstreams) });
  return readAdminTeamBoard();
}
