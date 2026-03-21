import { promises as fs } from "fs";
import path from "path";

export type SystemTrackingStatus = "awaiting_data" | "tracking" | "paused";
export type DataRequirementStatus = "ready" | "partial" | "pending";
export type TrackedBetResult = "win" | "loss" | "push" | "pending";

export type SystemProgressionStep = {
  step: string;
  label: string;
  stake: string;
  trigger?: string;
  stopIf: string;
};

export type SystemDataRequirement = {
  label: string;
  status: DataRequirementStatus;
  detail: string;
};

export type SystemTrackingRecord = {
  id: string;
  gameDate: string;
  matchup: string;
  roadTeam: string;
  homeTeam: string;
  closingSpread?: number | null;
  firstQuarterSpread?: number | null;
  thirdQuarterSpread?: number | null;
  bet1Result?: TrackedBetResult | null;
  bet2Result?: TrackedBetResult | null;
  notes?: string;
};

export type TrackedSystem = {
  id: string;
  name: string;
  sport: string;
  owner: string;
  status: SystemTrackingStatus;
  summary: string;
  definition: string;
  qualifierRules: string[];
  progressionLogic: SystemProgressionStep[];
  thesis: string;
  dataRequirements: SystemDataRequirement[];
  trackingNotes: string[];
  records: SystemTrackingRecord[];
};

export type SystemsTrackingData = {
  updatedAt: string;
  systems: TrackedSystem[];
};

export type SystemDerivedMetrics = {
  qualifiedGames: number;
  trackableGames: number;
  completedSequences: number;
  stepOneWins: number;
  rescueWins: number;
  unresolvedSequences: number;
  sequenceWinRate: number | null;
  stepOneWinRate: number | null;
  rescueRate: number | null;
  estimatedNetUnits: number | null;
  ingestionReady: boolean;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "systems-tracking.json");

function defaultData(): SystemsTrackingData {
  return {
    updatedAt: new Date().toISOString(),
    systems: [
      {
        id: "nba-goose-system",
        name: "NBA Goose System",
        sport: "NBA",
        owner: "Goosalytics Lab",
        status: "awaiting_data",
        summary:
          "Quarter ATS chase built around road favorites laying -5.5 or more, with a first-quarter entry and a third-quarter double-down only if the opener loses.",
        definition:
          "Track every NBA game where the road team closes as a favorite of -5.5 or more. Bet the road favorite 1Q ATS. If that leg wins, stop. If it loses, double the original stake and bet the road favorite 3Q ATS.",
        qualifierRules: [
          "Sport must be NBA.",
          "Road team must close as the favorite.",
          "Full-game spread must be -5.5 or shorter for the road favorite (for example -6.0, -7.5, -10.0).",
          "Sequence is only trackable once 1Q and 3Q ATS lines are available.",
        ],
        progressionLogic: [
          {
            step: "Bet 1",
            label: "Road favorite 1Q ATS",
            stake: "1x base unit",
            stopIf: "Wins or pushes",
          },
          {
            step: "Bet 2",
            label: "Road favorite 3Q ATS",
            stake: "2x base unit",
            trigger: "Only after Bet 1 loses",
            stopIf: "Always stop after this leg",
          },
        ],
        thesis:
          "The angle is that strong road favorites should win this two-step sequence above 60% over time, but the thesis cannot be validated honestly without quarter spread line capture and settled quarter results.",
        dataRequirements: [
          {
            label: "Closing full-game spread",
            status: "ready",
            detail: "Needed to confirm the -5.5 road favorite qualifier.",
          },
          {
            label: "1Q ATS line",
            status: "pending",
            detail: "Not wired yet. Required to know whether Bet 1 actually qualified and how it closed.",
          },
          {
            label: "3Q ATS line",
            status: "pending",
            detail: "Not wired yet. Required for the double-down leg after a first-quarter loss.",
          },
          {
            label: "Quarter settlement outcomes",
            status: "partial",
            detail: "Can be inferred only if quarter score data and matching lines exist for the same game.",
          },
        ],
        trackingNotes: [
          "First pass only: quarter spread ingestion is explicitly not automated yet.",
          "Performance cards should be treated as placeholders until quarter lines are stored consistently.",
          "Manual backfills can populate historical rows later without changing the page shape.",
        ],
        records: [],
      },
    ],
  };
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(defaultData(), null, 2) + "\n", "utf8");
  }
}

function normalizeRecord(record: Partial<SystemTrackingRecord>): SystemTrackingRecord {
  return {
    id: record.id || `system_row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    gameDate: record.gameDate || "",
    matchup: record.matchup || "",
    roadTeam: record.roadTeam || "",
    homeTeam: record.homeTeam || "",
    closingSpread: typeof record.closingSpread === "number" ? record.closingSpread : null,
    firstQuarterSpread: typeof record.firstQuarterSpread === "number" ? record.firstQuarterSpread : null,
    thirdQuarterSpread: typeof record.thirdQuarterSpread === "number" ? record.thirdQuarterSpread : null,
    bet1Result: record.bet1Result || null,
    bet2Result: record.bet2Result || null,
    notes: record.notes || "",
  };
}

function normalizeSystem(system: Partial<TrackedSystem>): TrackedSystem {
  return {
    id: system.id || `system_${Date.now()}`,
    name: system.name || "Untitled system",
    sport: system.sport || "Unknown",
    owner: system.owner || "Unassigned",
    status: (system.status as SystemTrackingStatus) || "awaiting_data",
    summary: system.summary || "",
    definition: system.definition || "",
    qualifierRules: Array.isArray(system.qualifierRules) ? system.qualifierRules.filter(Boolean) : [],
    progressionLogic: Array.isArray(system.progressionLogic) ? system.progressionLogic : [],
    thesis: system.thesis || "",
    dataRequirements: Array.isArray(system.dataRequirements) ? system.dataRequirements : [],
    trackingNotes: Array.isArray(system.trackingNotes) ? system.trackingNotes.filter(Boolean) : [],
    records: Array.isArray(system.records) ? system.records.map(normalizeRecord) : [],
  };
}

export async function readSystemsTrackingData(): Promise<SystemsTrackingData> {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return {
      updatedAt: parsed?.updatedAt || new Date().toISOString(),
      systems: Array.isArray(parsed?.systems) ? parsed.systems.map(normalizeSystem) : defaultData().systems,
    };
  } catch {
    return defaultData();
  }
}

export function getSystemDerivedMetrics(system: TrackedSystem): SystemDerivedMetrics {
  const qualifiedGames = system.records.length;
  const trackableRows = system.records.filter((record) => record.firstQuarterSpread != null && record.thirdQuarterSpread != null);
  const trackableGames = trackableRows.length;
  const completedRows = trackableRows.filter((record) => {
    if (record.bet1Result === "win" || record.bet1Result === "push") return true;
    if (record.bet1Result === "loss" && (record.bet2Result === "win" || record.bet2Result === "loss" || record.bet2Result === "push")) return true;
    return false;
  });
  const completedSequences = completedRows.length;
  const stepOneWins = completedRows.filter((record) => record.bet1Result === "win").length;
  const rescueWins = completedRows.filter((record) => record.bet1Result === "loss" && record.bet2Result === "win").length;
  const unresolvedSequences = qualifiedGames - completedSequences;
  const sequenceWins = completedRows.filter((record) => record.bet1Result === "win" || (record.bet1Result === "loss" && record.bet2Result === "win")).length;
  const stepOneLosses = completedRows.filter((record) => record.bet1Result === "loss").length;

  const estimatedNetUnits = completedSequences > 0
    ? completedRows.reduce((total, record) => {
        if (record.bet1Result === "win") return total + 1;
        if (record.bet1Result === "push") return total;
        if (record.bet1Result === "loss" && record.bet2Result === "win") return total + 1;
        if (record.bet1Result === "loss" && record.bet2Result === "push") return total - 1;
        if (record.bet1Result === "loss" && record.bet2Result === "loss") return total - 3;
        return total;
      }, 0)
    : null;

  return {
    qualifiedGames,
    trackableGames,
    completedSequences,
    stepOneWins,
    rescueWins,
    unresolvedSequences,
    sequenceWinRate: completedSequences > 0 ? sequenceWins / completedSequences : null,
    stepOneWinRate: completedSequences > 0 ? stepOneWins / completedSequences : null,
    rescueRate: stepOneLosses > 0 ? rescueWins / stepOneLosses : null,
    estimatedNetUnits,
    ingestionReady: system.dataRequirements.every((item) => item.status === "ready"),
  };
}
