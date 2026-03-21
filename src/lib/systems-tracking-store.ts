import { promises as fs } from "fs";
import path from "path";
import type { AggregatedOdds } from "@/lib/books/types";
import { getAggregatedOddsForSport } from "@/lib/odds-aggregator";
import { getNBAGameSummary, getNBASchedule } from "@/lib/nba-api";

export type SystemTrackingStatus = "awaiting_data" | "tracking" | "paused";
export type DataRequirementStatus = "ready" | "partial" | "pending";
export type TrackedBetResult = "win" | "loss" | "push" | "pending";
export type SequenceResult = "win" | "loss" | "push" | "pending";

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
  gameId?: string;
  oddsEventId?: string | null;
  gameDate: string;
  matchup: string;
  roadTeam: string;
  homeTeam: string;
  closingSpread?: number | null;
  firstQuarterSpread?: number | null;
  thirdQuarterSpread?: number | null;
  firstQuarterRoadScore?: number | null;
  firstQuarterHomeScore?: number | null;
  thirdQuarterRoadScore?: number | null;
  thirdQuarterHomeScore?: number | null;
  bet1Result?: TrackedBetResult | null;
  bet2Result?: TrackedBetResult | null;
  sequenceResult?: SequenceResult | null;
  estimatedNetUnits?: number | null;
  source?: string;
  notes?: string;
  lastSyncedAt?: string;
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

type QuarterScores = {
  firstQuarterRoadScore: number | null;
  firstQuarterHomeScore: number | null;
  thirdQuarterRoadScore: number | null;
  thirdQuarterHomeScore: number | null;
};

type RefreshGooseOptions = {
  date?: string;
  daysAhead?: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "systems-tracking.json");
const NBA_GOOSE_SYSTEM_ID = "nba-goose-system";

function defaultData(): SystemsTrackingData {
  return {
    updatedAt: new Date().toISOString(),
    systems: [defaultGooseSystem()],
  };
}

function defaultGooseSystem(): TrackedSystem {
  return {
    id: NBA_GOOSE_SYSTEM_ID,
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
        detail: "Pending quarter spread ingestion for qualifying games.",
      },
      {
        label: "3Q ATS line",
        status: "pending",
        detail: "Pending quarter spread ingestion for the chase leg.",
      },
      {
        label: "Quarter settlement outcomes",
        status: "partial",
        detail: "Resolved only when ESPN quarter scoring is available for the same event.",
      },
    ],
    trackingNotes: [
      "Rows are generated from live NBA odds aggregation and stored in data/systems-tracking.json.",
      "Bet 1 uses the away team 1Q spread. Bet 2 only settles after a Bet 1 loss and available 3Q scoring.",
      "If lines or quarter scores are missing, the row stays unresolved rather than being backfilled with guesses.",
    ],
    records: [],
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
    gameId: record.gameId || undefined,
    oddsEventId: record.oddsEventId ?? null,
    gameDate: record.gameDate || "",
    matchup: record.matchup || "",
    roadTeam: record.roadTeam || "",
    homeTeam: record.homeTeam || "",
    closingSpread: typeof record.closingSpread === "number" ? record.closingSpread : null,
    firstQuarterSpread: typeof record.firstQuarterSpread === "number" ? record.firstQuarterSpread : null,
    thirdQuarterSpread: typeof record.thirdQuarterSpread === "number" ? record.thirdQuarterSpread : null,
    firstQuarterRoadScore: typeof record.firstQuarterRoadScore === "number" ? record.firstQuarterRoadScore : null,
    firstQuarterHomeScore: typeof record.firstQuarterHomeScore === "number" ? record.firstQuarterHomeScore : null,
    thirdQuarterRoadScore: typeof record.thirdQuarterRoadScore === "number" ? record.thirdQuarterRoadScore : null,
    thirdQuarterHomeScore: typeof record.thirdQuarterHomeScore === "number" ? record.thirdQuarterHomeScore : null,
    bet1Result: record.bet1Result || null,
    bet2Result: record.bet2Result || null,
    sequenceResult: record.sequenceResult || null,
    estimatedNetUnits: typeof record.estimatedNetUnits === "number" ? record.estimatedNetUnits : null,
    source: record.source || "",
    notes: record.notes || "",
    lastSyncedAt: record.lastSyncedAt || undefined,
  };
}

function normalizeSystem(system: Partial<TrackedSystem>): TrackedSystem {
  const base = system.id === NBA_GOOSE_SYSTEM_ID ? defaultGooseSystem() : null;
  return {
    id: system.id || `system_${Date.now()}`,
    name: system.name || base?.name || "Untitled system",
    sport: system.sport || base?.sport || "Unknown",
    owner: system.owner || base?.owner || "Unassigned",
    status: (system.status as SystemTrackingStatus) || base?.status || "awaiting_data",
    summary: system.summary || base?.summary || "",
    definition: system.definition || base?.definition || "",
    qualifierRules: Array.isArray(system.qualifierRules) ? system.qualifierRules.filter(Boolean) : (base?.qualifierRules || []),
    progressionLogic: Array.isArray(system.progressionLogic) && system.progressionLogic.length ? system.progressionLogic : (base?.progressionLogic || []),
    thesis: system.thesis || base?.thesis || "",
    dataRequirements: Array.isArray(system.dataRequirements) && system.dataRequirements.length ? system.dataRequirements : (base?.dataRequirements || []),
    trackingNotes: Array.isArray(system.trackingNotes) && system.trackingNotes.length ? system.trackingNotes.filter(Boolean) : (base?.trackingNotes || []),
    records: Array.isArray(system.records) ? system.records.map(normalizeRecord) : [],
  };
}

async function writeSystemsTrackingData(data: SystemsTrackingData) {
  await ensureStore();
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function getGooseSystem(data: SystemsTrackingData) {
  let system = data.systems.find((entry) => entry.id === NBA_GOOSE_SYSTEM_ID);
  if (!system) {
    system = defaultGooseSystem();
    data.systems = [system, ...data.systems];
    return system;
  }

  const defaults = defaultGooseSystem();
  system.name = defaults.name;
  system.sport = defaults.sport;
  system.owner = defaults.owner;
  system.summary = defaults.summary;
  system.definition = defaults.definition;
  system.qualifierRules = defaults.qualifierRules;
  system.progressionLogic = defaults.progressionLogic;
  system.thesis = defaults.thesis;
  system.trackingNotes = defaults.trackingNotes;
  if (!Array.isArray(system.dataRequirements) || system.dataRequirements.length === 0) {
    system.dataRequirements = defaults.dataRequirements;
  }

  return system;
}

function getEventDate(commenceTime: string | null, fallbackDate?: string) {
  if (fallbackDate) return fallbackDate;
  if (!commenceTime) return "";

  const numeric = Number(commenceTime);
  if (Number.isFinite(numeric) && numeric > 0) {
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return new Date(millis).toISOString().slice(0, 10);
  }

  const parsed = new Date(commenceTime);
  if (Number.isNaN(parsed.getTime())) return commenceTime.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function resolveSpreadResult(roadScore: number | null, homeScore: number | null, roadSpread: number | null): TrackedBetResult {
  if (roadScore == null || homeScore == null || roadSpread == null) return "pending";
  const margin = roadScore + roadSpread - homeScore;
  if (margin > 0) return "win";
  if (margin < 0) return "loss";
  return "push";
}

function deriveSequence(bet1Result: TrackedBetResult | null, bet2Result: TrackedBetResult | null) {
  if (bet1Result === "win") return { sequenceResult: "win" as SequenceResult, estimatedNetUnits: 1 };
  if (bet1Result === "push") return { sequenceResult: "push" as SequenceResult, estimatedNetUnits: 0 };
  if (bet1Result === "pending" || bet1Result == null) return { sequenceResult: "pending" as SequenceResult, estimatedNetUnits: null };
  if (bet1Result === "loss") {
    if (bet2Result === "win") return { sequenceResult: "win" as SequenceResult, estimatedNetUnits: 1 };
    if (bet2Result === "push") return { sequenceResult: "push" as SequenceResult, estimatedNetUnits: -1 };
    if (bet2Result === "loss") return { sequenceResult: "loss" as SequenceResult, estimatedNetUnits: -3 };
    return { sequenceResult: "pending" as SequenceResult, estimatedNetUnits: null };
  }
  return { sequenceResult: "pending" as SequenceResult, estimatedNetUnits: null };
}

function findRequirement(system: TrackedSystem, label: string) {
  return system.dataRequirements.find((item) => item.label === label);
}

function applyGooseReadiness(system: TrackedSystem) {
  const hasQualifiedRows = system.records.length > 0;
  const hasQ1Lines = system.records.some((record) => record.firstQuarterSpread != null);
  const hasQ3Lines = system.records.some((record) => record.thirdQuarterSpread != null);
  const completedRows = system.records.filter((record) => record.sequenceResult && record.sequenceResult !== "pending");

  system.status = hasQualifiedRows ? "tracking" : "awaiting_data";

  const q1Requirement = findRequirement(system, "1Q ATS line");
  if (q1Requirement) {
    q1Requirement.status = hasQ1Lines ? "ready" : hasQualifiedRows ? "partial" : "pending";
    q1Requirement.detail = hasQ1Lines
      ? "Stored from The Odds API quarter markets for qualifying NBA road favorites."
      : "No qualifying row has a captured 1Q spread yet.";
  }

  const q3Requirement = findRequirement(system, "3Q ATS line");
  if (q3Requirement) {
    q3Requirement.status = hasQ3Lines ? "ready" : hasQualifiedRows ? "partial" : "pending";
    q3Requirement.detail = hasQ3Lines
      ? "Stored from The Odds API third-quarter spread markets for the chase leg."
      : "No qualifying row has a captured 3Q spread yet.";
  }

  const settlementRequirement = findRequirement(system, "Quarter settlement outcomes");
  if (settlementRequirement) {
    settlementRequirement.status = completedRows.length > 0 ? "ready" : hasQualifiedRows ? "partial" : "pending";
    settlementRequirement.detail = completedRows.length > 0
      ? `Settled from ESPN quarter linescores for ${completedRows.length} stored sequence${completedRows.length === 1 ? "" : "s"}.`
      : hasQualifiedRows
        ? "Qualifiers exist, but at least one required quarter score or quarter line is still missing."
        : "No qualifying games have been stored yet.";
  }
}

async function getQuarterScores(eventId?: string | null): Promise<QuarterScores> {
  if (!eventId) {
    return {
      firstQuarterRoadScore: null,
      firstQuarterHomeScore: null,
      thirdQuarterRoadScore: null,
      thirdQuarterHomeScore: null,
    };
  }

  const summary = await getNBAGameSummary(eventId);
  const competitors: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((entry) => entry?.homeAway === "home");
  const away = competitors.find((entry) => entry?.homeAway === "away");
  const homeLinescores: any[] = Array.isArray(home?.linescores) ? home.linescores : [];
  const awayLinescores: any[] = Array.isArray(away?.linescores) ? away.linescores : [];

  const toScore = (value: any) => {
    const raw = value?.displayValue ?? value?.value ?? value;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    firstQuarterRoadScore: toScore(awayLinescores[0]),
    firstQuarterHomeScore: toScore(homeLinescores[0]),
    thirdQuarterRoadScore: toScore(awayLinescores[2]),
    thirdQuarterHomeScore: toScore(homeLinescores[2]),
  };
}

function isGooseQualifier(event: AggregatedOdds) {
  const awaySpread = event.bestAwaySpread?.line;
  return typeof awaySpread === "number" && awaySpread <= -5.5;
}

function buildRecordNotes(event: AggregatedOdds, scores: QuarterScores, bet1Result: TrackedBetResult, bet2Result: TrackedBetResult | null) {
  const notes: string[] = [];
  if (event.bestAwaySpread?.book) notes.push(`FG ${event.bestAwaySpread.book}`);
  if (event.bestAwayFirstQuarterSpread?.book) notes.push(`1Q ${event.bestAwayFirstQuarterSpread.book}`);
  if (event.bestAwayThirdQuarterSpread?.book) notes.push(`3Q ${event.bestAwayThirdQuarterSpread.book}`);
  if (scores.firstQuarterRoadScore == null || scores.firstQuarterHomeScore == null) {
    notes.push("Awaiting ESPN 1Q score");
  } else if (bet1Result === "loss" && (scores.thirdQuarterRoadScore == null || scores.thirdQuarterHomeScore == null)) {
    notes.push("Awaiting ESPN 3Q score");
  }
  if (bet1Result === "loss" && !event.bestAwayThirdQuarterSpread) {
    notes.push("3Q line missing");
  }
  if (!event.bestAwayFirstQuarterSpread) {
    notes.push("1Q line missing");
  }
  return notes.join(" • ");
}

async function buildGooseRecord(event: AggregatedOdds, espnEventId?: string | null): Promise<SystemTrackingRecord> {
  const scores = await getQuarterScores(espnEventId ?? event.oddsApiEventId ?? null);
  const bet1Result = resolveSpreadResult(
    scores.firstQuarterRoadScore,
    scores.firstQuarterHomeScore,
    event.bestAwayFirstQuarterSpread?.line ?? null,
  );
  const bet2Result = bet1Result === "loss"
    ? resolveSpreadResult(
        scores.thirdQuarterRoadScore,
        scores.thirdQuarterHomeScore,
        event.bestAwayThirdQuarterSpread?.line ?? null,
      )
    : null;
  const derived = deriveSequence(bet1Result, bet2Result);

  return normalizeRecord({
    id: `nba-goose:${event.gameId}`,
    gameId: event.gameId,
    oddsEventId: event.oddsApiEventId ?? espnEventId ?? null,
    gameDate: getEventDate(event.commenceTime),
    matchup: `${event.awayTeam} @ ${event.homeTeam}`,
    roadTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    closingSpread: event.bestAwaySpread?.line ?? null,
    firstQuarterSpread: event.bestAwayFirstQuarterSpread?.line ?? null,
    thirdQuarterSpread: event.bestAwayThirdQuarterSpread?.line ?? null,
    firstQuarterRoadScore: scores.firstQuarterRoadScore,
    firstQuarterHomeScore: scores.firstQuarterHomeScore,
    thirdQuarterRoadScore: scores.thirdQuarterRoadScore,
    thirdQuarterHomeScore: scores.thirdQuarterHomeScore,
    bet1Result,
    bet2Result,
    sequenceResult: derived.sequenceResult,
    estimatedNetUnits: derived.estimatedNetUnits,
    source: "The Odds API + ESPN summary",
    notes: buildRecordNotes(event, scores, bet1Result, bet2Result),
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function readSystemsTrackingData(): Promise<SystemsTrackingData> {
  await ensureStore();
  const raw = await fs.readFile(STORE_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw);
    const data = {
      updatedAt: parsed?.updatedAt || new Date().toISOString(),
      systems: Array.isArray(parsed?.systems) ? parsed.systems.map(normalizeSystem) : defaultData().systems,
    };
    applyGooseReadiness(getGooseSystem(data));
    return data;
  } catch {
    return defaultData();
  }
}

export async function refreshTodayGooseSystem(options: RefreshGooseOptions = {}): Promise<TrackedSystem> {
  const data = await readSystemsTrackingData();
  const system = getGooseSystem(data);
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const schedule = await getNBASchedule(options.daysAhead ?? 1);
  const scheduleMap = new Map(
    schedule.map((game) => [`${game.awayTeam.abbreviation}@@${game.homeTeam.abbreviation}`, game]),
  );

  const aggregated = await getAggregatedOddsForSport("NBA");
  const todaysQualifiers = aggregated.filter((event) => {
    if (!isGooseQualifier(event)) return false;
    return getEventDate(event.commenceTime) === targetDate;
  });

  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  const freshRecords = await Promise.all(
    todaysQualifiers.map(async (event) => {
      const scheduleGame = scheduleMap.get(`${event.awayAbbrev}@@${event.homeAbbrev}`);
      return buildGooseRecord(event, scheduleGame?.id || null);
    }),
  );

  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup);
  });
  applyGooseReadiness(system);
  data.updatedAt = new Date().toISOString();
  await writeSystemsTrackingData(data);
  return system;
}

export function getSystemDerivedMetrics(system: TrackedSystem): SystemDerivedMetrics {
  const qualifiedGames = system.records.length;
  const trackableRows = system.records.filter((record) => record.firstQuarterSpread != null && record.thirdQuarterSpread != null);
  const trackableGames = trackableRows.length;
  const completedRows = system.records.filter((record) => record.sequenceResult && record.sequenceResult !== "pending");
  const completedSequences = completedRows.length;
  const stepOneWins = completedRows.filter((record) => record.bet1Result === "win").length;
  const rescueWins = completedRows.filter((record) => record.bet1Result === "loss" && record.bet2Result === "win").length;
  const unresolvedSequences = qualifiedGames - completedSequences;
  const sequenceWins = completedRows.filter((record) => record.sequenceResult === "win").length;
  const stepOneLosses = completedRows.filter((record) => record.bet1Result === "loss").length;
  const netUnits = completedRows.reduce((total, record) => total + (record.estimatedNetUnits ?? 0), 0);

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
    estimatedNetUnits: completedSequences > 0 ? netUnits : null,
    ingestionReady: system.dataRequirements.every((item) => item.status === "ready"),
  };
}
