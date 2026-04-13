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

export type AdminTeamBoardData = {
  lastReviewedAt: string | null;
  members: TeamMember[];
  workstreams: SprintWorkItem[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const TEAM_PATH = path.join(DATA_DIR, "admin-team-board.json");

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_DATA: AdminTeamBoardData = {
  lastReviewedAt: nowIso(),
  members: [
    {
      id: "magoo",
      name: "Magoo",
      role: "Chief of Staff / Product Orchestrator",
      lane: "Executive orchestration",
      manager: "CEO",
      focus: "Sprint coordination, launch truth, sequencing, accountability.",
      kpi: "Launch board current, blockers escalated, no fake completion.",
      status: "yellow",
      outputSummary: "Operating board defined, launch lanes named, historical SGO rail moving.",
      sprintCompletions: 3,
      sprintPartials: 2,
      sprintBlocked: 0,
      wins: ["Launch operating board created", "SportsGameOdds backfill automation wired"],
      risks: ["Need live team board and launch workstream tracking in admin"],
      updatedAt: nowIso(),
    },
    {
      id: "rory",
      name: "Rory",
      role: "Head of Product",
      lane: "Product / design",
      manager: "Magoo",
      focus: "Roadmap, scope discipline, onboarding, profile setup, product coherence.",
      kpi: "Core flows fully scoped and launch-critical work clearly prioritized.",
      status: "yellow",
      outputSummary: "Core mission defined, but launch-critical pages still need explicit acceptance criteria.",
      sprintCompletions: 1,
      sprintPartials: 2,
      sprintBlocked: 0,
      wins: ["June 1 / July 1 launch targets established"],
      risks: ["Scope creep", "Too many pages still lack hard launch definitions"],
      updatedAt: nowIso(),
    },
    {
      id: "ive",
      name: "Ive",
      role: "Design Director",
      lane: "Product / design",
      manager: "Rory",
      focus: "Premium visual system, hierarchy, menus, spacing, polish.",
      kpi: "Visible UI consistency and premium quality across core surfaces.",
      status: "red",
      outputSummary: "Design taste direction exists, but app-wide visual consistency is not locked yet.",
      sprintCompletions: 0,
      sprintPartials: 2,
      sprintBlocked: 1,
      wins: ["Premium direction clearly stated"],
      risks: ["Inconsistent page quality", "Competitors currently look cleaner"],
      updatedAt: nowIso(),
    },
    {
      id: "june",
      name: "June",
      role: "UX Architect",
      lane: "Product / design",
      manager: "Rory",
      focus: "Navigation, onboarding, menus, profile flow, information architecture.",
      kpi: "Users can move through core flows without friction or confusion.",
      status: "red",
      outputSummary: "Needs a full front-to-back audit of onboarding, profile setup, nav, and picks flow.",
      sprintCompletions: 0,
      sprintPartials: 1,
      sprintBlocked: 1,
      wins: [],
      risks: ["Navigation debt", "Profile setup still not polished"],
      updatedAt: nowIso(),
    },
    {
      id: "finch",
      name: "Finch",
      role: "Frontend Lead",
      lane: "Engineering / systems",
      manager: "Magoo",
      focus: "Next.js execution quality, page polish, responsiveness, performance.",
      kpi: "Core pages stable, polished, responsive, and production-clean.",
      status: "yellow",
      outputSummary: "Admin surfaces and core pages exist, but need systematic polish and cleanup.",
      sprintCompletions: 2,
      sprintPartials: 3,
      sprintBlocked: 0,
      wins: ["Admin surfaces already live"],
      risks: ["Design system gaps", "UI debt across pages"],
      updatedAt: nowIso(),
    },
    {
      id: "slate",
      name: "Slate",
      role: "Design Systems Engineer",
      lane: "Engineering / systems",
      manager: "Finch",
      focus: "Shared components, forms, tables, cards, tabs, state handling.",
      kpi: "Component consistency across app surfaces.",
      status: "red",
      outputSummary: "Reusable admin/UI patterns exist but a true system is not yet enforced app-wide.",
      sprintCompletions: 0,
      sprintPartials: 2,
      sprintBlocked: 1,
      wins: [],
      risks: ["Too much custom one-off UI", "Inconsistent states and controls"],
      updatedAt: nowIso(),
    },
    {
      id: "quinn",
      name: "Quinn",
      role: "QA Commander",
      lane: "Quality / launch / market",
      manager: "Forge",
      focus: "Regression testing, visual QA, mobile QA, blocker tracking.",
      kpi: "Launch blocker count trending down with proof-based QA coverage.",
      status: "yellow",
      outputSummary: "QA surfaces exist, but launch-gate rigor still needs to be enforced more aggressively.",
      sprintCompletions: 1,
      sprintPartials: 2,
      sprintBlocked: 0,
      wins: ["IT review board exists"],
      risks: ["Bug tracking still too manual", "No full launch sweep yet"],
      updatedAt: nowIso(),
    },
    {
      id: "atlas",
      name: "Atlas",
      role: "Backend / Data Product Lead",
      lane: "Engineering / systems",
      manager: "Magoo",
      focus: "Data contracts, grading integrity, backend support for frontend trust.",
      kpi: "Reliable data on all launch-critical surfaces.",
      status: "yellow",
      outputSummary: "Data rail progress is real, but grading trust and endpoint consistency still need continued cleanup.",
      sprintCompletions: 2,
      sprintPartials: 2,
      sprintBlocked: 0,
      wins: ["Historical SportsGameOdds pipeline validated"],
      risks: ["Remaining grading audits", "Backend trust must stay high"],
      updatedAt: nowIso(),
    },
    {
      id: "vega",
      name: "Vega",
      role: "ML + Systems Lead",
      lane: "Engineering / systems",
      manager: "Magoo",
      focus: "Goose 2.0 model pipeline, systems, backtests, feature/training flow.",
      kpi: "Training-ready data and honest model evaluation.",
      status: "green",
      outputSummary: "Goose 2.0 data rail is now materially closer to real model work thanks to automated historical ingestion.",
      sprintCompletions: 3,
      sprintPartials: 1,
      sprintBlocked: 0,
      wins: ["Historical puller + normalization + scheduling built"],
      risks: ["Need final data-up-to-date alert before full system testing begins"],
      updatedAt: nowIso(),
    },
    {
      id: "cash",
      name: "Cash",
      role: "Growth + Conversion Strategist",
      lane: "Quality / launch / market",
      manager: "Rory",
      focus: "Activation, trust surfaces, pricing, upgrade conversion.",
      kpi: "Soft-launch users understand value and convert cleanly.",
      status: "red",
      outputSummary: "Growth path is still under-defined compared with polish and infrastructure work.",
      sprintCompletions: 0,
      sprintPartials: 1,
      sprintBlocked: 1,
      wins: [],
      risks: ["Conversion surface not fully designed", "Upgrade trust flow unclear"],
      updatedAt: nowIso(),
    },
    {
      id: "halo",
      name: "Halo",
      role: "Brand + Content Director",
      lane: "Product / design",
      manager: "Rory",
      focus: "Copy, product voice, onboarding text, premium brand tone.",
      kpi: "Brand voice feels sharp, premium, and trustworthy throughout the app.",
      status: "yellow",
      outputSummary: "Brand direction is strong, but copy/UI language still needs a coordinated pass.",
      sprintCompletions: 1,
      sprintPartials: 1,
      sprintBlocked: 0,
      wins: ["Premium tone direction defined"],
      risks: ["Copy inconsistency across surfaces"],
      updatedAt: nowIso(),
    },
    {
      id: "pulse",
      name: "Pulse",
      role: "User Research + Feedback Lead",
      lane: "Quality / launch / market",
      manager: "Rory",
      focus: "Tester insight capture, confusion tracking, feedback synthesis.",
      kpi: "Soft-launch feedback loop active and actionable.",
      status: "red",
      outputSummary: "Tester program is not yet formally running.",
      sprintCompletions: 0,
      sprintPartials: 0,
      sprintBlocked: 1,
      wins: [],
      risks: ["No structured tester loop yet"],
      updatedAt: nowIso(),
    },
    {
      id: "forge",
      name: "Forge",
      role: "Release Manager",
      lane: "Quality / launch / market",
      manager: "Magoo",
      focus: "Sprint cadence, launch checklist, blocker management, ship gates.",
      kpi: "Clear launch board with real red/yellow/green status and zero hidden blockers.",
      status: "yellow",
      outputSummary: "Launch board exists in memory, but admin execution surface is being built now.",
      sprintCompletions: 1,
      sprintPartials: 2,
      sprintBlocked: 0,
      wins: ["Launch operating board defined"],
      risks: ["Need live board in admin to hold team accountable"],
      updatedAt: nowIso(),
    },
    {
      id: "ghost",
      name: "Ghost",
      role: "Competitive Intelligence Lead",
      lane: "Quality / launch / market",
      manager: "Rory",
      focus: "Competitor benchmarking, product pressure, UX comparison.",
      kpi: "Goose closes obvious polish gap versus leading competitors.",
      status: "yellow",
      outputSummary: "Competitive urgency is clear, but benchmark reviews are not yet institutionalized in the admin workflow.",
      sprintCompletions: 0,
      sprintPartials: 1,
      sprintBlocked: 0,
      wins: [],
      risks: ["Competitors currently setting the bar on polish"],
      updatedAt: nowIso(),
    }
  ],
  workstreams: [
    {
      id: "ws_nav_shell_cleanup",
      title: "Navigation and app shell cleanup",
      lane: "Product polish and UX coherence",
      ownerId: "june",
      goal: "Make top-level navigation, app shell, and menu behavior feel obvious and premium.",
      proofRequired: "Before/after UI pass with no known broken paths across core nav routes.",
      status: "partial",
      dueDate: "2026-04-20",
      notes: "Launch-critical.",
      updatedAt: nowIso(),
    },
    {
      id: "ws_profile_onboarding",
      title: "Onboarding and user profile setup",
      lane: "Product polish and UX coherence",
      ownerId: "rory",
      goal: "Make signup, first-run, and profile setup smooth enough for soft launch.",
      proofRequired: "Full walkthrough with clean UX and no embarrassing friction.",
      status: "blocked",
      dueDate: "2026-04-22",
      notes: "Needs explicit flow definition and frontend pass.",
      updatedAt: nowIso(),
    },
    {
      id: "ws_design_system",
      title: "Design system unification",
      lane: "Frontend quality and design system",
      ownerId: "slate",
      goal: "Standardize cards, filters, buttons, tables, tabs, modals, and shared states.",
      proofRequired: "Core reusable component set adopted across launch-critical surfaces.",
      status: "partial",
      dueDate: "2026-04-25",
      notes: "This kills page-by-page drift.",
      updatedAt: nowIso(),
    },
    {
      id: "ws_goose2_history",
      title: "Historical data rail completion",
      lane: "Goose 2.0 intelligence",
      ownerId: "vega",
      goal: "Finish automated historical ingestion so system testing and ML training can start honestly.",
      proofRequired: "Backfill completed, logs clean, data current, Marco alerted.",
      status: "partial",
      dueDate: "2026-04-18",
      notes: "Automation is running.",
      updatedAt: nowIso(),
    },
    {
      id: "ws_qa_gate",
      title: "Launch QA gate",
      lane: "QA and launch readiness",
      ownerId: "quinn",
      goal: "Establish a real release gate with visible bugs, blockers, and regression standards.",
      proofRequired: "Launch blocker board active and used for ship/no-ship decisions.",
      status: "partial",
      dueDate: "2026-04-21",
      notes: "Admin ops exists, but launch-grade rigor still needs tightening.",
      updatedAt: nowIso(),
    }
  ],
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

export async function readAdminTeamBoard(): Promise<AdminTeamBoardData> {
  await ensureStore();
  const raw = await fs.readFile(TEAM_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return {
      lastReviewedAt: parsed?.lastReviewedAt ?? DEFAULT_DATA.lastReviewedAt,
      members: Array.isArray(parsed?.members) ? parsed.members : DEFAULT_DATA.members,
      workstreams: Array.isArray(parsed?.workstreams) ? parsed.workstreams : DEFAULT_DATA.workstreams,
    };
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
