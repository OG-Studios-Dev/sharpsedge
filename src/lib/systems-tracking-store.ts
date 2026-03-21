import { promises as fs } from "fs";
import path from "path";
import type { AggregatedOdds } from "@/lib/books/types";
import { getAggregatedOddsForSport } from "@/lib/odds-aggregator";
import { getNBAGameSummary, getNBASchedule } from "@/lib/nba-api";

export type SystemLeague = "NBA" | "NHL" | "MLB" | "NFL" | string;
export type SystemCategory = "native" | "historical" | "external";
export type SystemTrackingStatus =
  | "awaiting_data"
  | "tracking"
  | "paused"
  | "definition_only"
  | "awaiting_verification"
  | "source_based";
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

export type SystemSourceNote = {
  label: string;
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
  slug: string;
  name: string;
  league: SystemLeague;
  category: SystemCategory;
  owner: string;
  status: SystemTrackingStatus;
  summary: string;
  snapshot?: string | null;
  definition: string;
  qualifierRules: string[];
  progressionLogic: SystemProgressionStep[];
  thesis: string;
  sourceNotes: SystemSourceNote[];
  automationStatusLabel: string;
  automationStatusDetail: string;
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

export const SYSTEM_LEAGUES = ["All", "NBA", "NHL", "MLB", "NFL"] as const;

function defaultGooseSystem(): TrackedSystem {
  return {
    id: NBA_GOOSE_SYSTEM_ID,
    slug: "nba-goose-system",
    name: "NBA Goose System",
    league: "NBA",
    category: "native",
    owner: "Goosalytics Lab",
    status: "awaiting_data",
    summary:
      "Road favorite quarter ATS chase: 1Q first, then 3Q only if the opener loses.",
    snapshot: "Live Goose rows only; no backfilled performance.",
    definition:
      "Track every NBA game where the road team closes as a favorite of -5.5 or more. Bet the road favorite 1Q ATS. If that leg wins, stop. If it loses, double the original stake and bet the road favorite 3Q ATS.",
    qualifierRules: [
      "League must be NBA.",
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
      "The angle is that strong road favorites should control stretches of the game often enough to make the two-step sequence viable, but that thesis is only worth discussing when quarter lines and quarter scoring are captured honestly.",
    sourceNotes: [
      {
        label: "Native model",
        detail: "This is a Goosalytics-owned system tracked from internal qualifier logic rather than copied in from a tout sheet.",
      },
      {
        label: "Settlement policy",
        detail: "Rows stay unresolved if quarter lines or ESPN quarter scores are missing. No guessed fills, no fake closes.",
      },
    ],
    automationStatusLabel: "Live qualifier refresh + partial settlement",
    automationStatusDetail:
      "Qualifiers are generated from live NBA odds aggregation and settled only when real quarter lines and ESPN linescores are present.",
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

function seededCatalog(): TrackedSystem[] {
  return [
    defaultGooseSystem(),
    {
      id: "coaches-fuming-scoring-drought",
      slug: "coaches-fuming-scoring-drought",
      name: "Coaches Fuming Scoring Drought",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      summary: "Buy-low bounce spot built around elite offenses coming off ugly, publicly visible scoring droughts.",
      snapshot: "Definition seeded; no tracked sample yet.",
      definition:
        "A candidate spot where a normally efficient offense just posted a visibly poor scoring stretch or late-game shooting collapse, likely drawing coach quotes, media noise, and market overreaction the next game.",
      qualifierRules: [
        "Start from teams with above-average offensive profile, not weak offenses in general.",
        "Look for a recent game with a scoring drought, ugly late execution, or notable postgame frustration from coaches/players.",
        "Price sensitivity still matters; this is not a blind auto-bet until thresholds are formalized.",
      ],
      progressionLogic: [],
      thesis:
        "The public tends to overweight the most recent offensive ugliness, especially when coach frustration becomes part of the story. The edge only exists if those inputs are defined systematically instead of hand-waved.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged as an internal idea, not as a proven live model. The emotional/news trigger needs rules before it can be tracked cleanly.",
        },
      ],
      automationStatusLabel: "Definition only",
      automationStatusDetail: "Needs concrete quote/news and scoring-drought inputs before automation or honest backtesting.",
      dataRequirements: [
        { label: "Recent scoring drought flag", status: "pending", detail: "Needs a repeatable event definition instead of a vibes-only read." },
        { label: "Coach/media frustration input", status: "pending", detail: "Would need structured source capture or manual tagging." },
        { label: "Price threshold rules", status: "pending", detail: "No market-entry bounds have been finalized yet." },
      ],
      trackingNotes: ["Do not report performance until the trigger logic is codified and logged game by game."],
      records: [],
    },
    {
      id: "swaggy-stretch-drive",
      slug: "swaggy-stretch-drive",
      name: "Swaggy Stretch Drive",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_verification",
      summary: "Late-season motivation and style angle intended for teams still pressing while the market prices them like everyone else.",
      snapshot: "Awaiting verification and qualifier spec.",
      definition:
        "Track late-season NBA teams with clear seeding, developmental, or statement-game motivation whose tempo or shot profile can create repeatable cover windows against flatter opponents.",
      qualifierRules: [
        "Applies only during the stretch run when standings incentives are real.",
        "Requires a codified motivation input rather than editorial narrative.",
        "Should include opponent context so the angle is not just 'team cares more.'",
      ],
      progressionLogic: [],
      thesis:
        "End-of-season markets can misprice urgency, but only if motivation and opponent indifference are defined explicitly enough to survive contact with real data.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Name and angle are cataloged now, but no verified ruleset or historical tracking has been published yet.",
        },
      ],
      automationStatusLabel: "Awaiting verification",
      automationStatusDetail: "Would require standings-state inputs, schedule context, and a sharper qualifier spec.",
      dataRequirements: [
        { label: "Standings incentive flags", status: "pending", detail: "Need machine-readable postseason or tanking context." },
        { label: "Schedule fatigue inputs", status: "pending", detail: "Back-to-backs and travel may matter but are not wired in here yet." },
      ],
      trackingNotes: ["Keep it labeled as a catalog concept until qualifiers are explicit enough to log consistently."],
      records: [],
    },
    {
      id: "veal-bangers-zig-playoff-zigzag",
      slug: "veal-bangers-zig-playoff-zigzag",
      name: "Veal Bangers Zig Playoff ZigZag",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      summary: "NHL playoff bounce-back concept centered on series reaction and market over-adjustment after a loud result.",
      snapshot: "Definition only; no series log yet.",
      definition:
        "A playoff zig-zag style concept for NHL series where the market may overreact to the previous game’s margin, puck luck, or special-teams noise before the next matchup in the same series.",
      qualifierRules: [
        "Applies only in playoff series rematches.",
        "Needs a clear definition for what counts as an overreaction spot rather than assuming every loser auto-bounces.",
        "Should include series state, venue, and price discipline before tracking.",
      ],
      progressionLogic: [],
      thesis:
        "Playoff rematches compress information and can invite narrative overreaction, but the old zig-zag story is too blunt without better filters.",
      sourceNotes: [
        {
          label: "Historical framework",
          detail: "This belongs in the catalog as a classic playoff concept, not as a currently automated Goosalytics model.",
        },
      ],
      automationStatusLabel: "Definition only",
      automationStatusDetail: "Needs playoff-series state, price thresholds, and matchup filters before honest tracking.",
      dataRequirements: [
        { label: "Series state", status: "pending", detail: "Need game number and prior result context." },
        { label: "Overreaction filter", status: "pending", detail: "No codified line-move or box-score trigger yet." },
      ],
      trackingNotes: ["Exact user naming preserved as requested."],
      records: [],
    },
    {
      id: "bigcat-bonaza-puckluck",
      slug: "bigcat-bonaza-puckluck",
      name: "BigCat Bonaza PuckLuck",
      league: "NHL",
      category: "external",
      owner: "External source",
      status: "source_based",
      summary: "External/source-based puck-luck style concept cataloged for reference, not presented as native tracked performance.",
      snapshot: "Source-based reference only.",
      definition:
        "An externally inspired NHL concept around variance, finishing luck, and short-term puck-luck narratives. Included in the catalog so users can see the definition and sourcing without mistaking it for a verified in-house edge.",
      qualifierRules: [
        "Do not present as a native Goosalytics model.",
        "Would need explicit public-source rules before any automated screening.",
        "If tracked later, results must be tagged separately from internal systems.",
      ],
      progressionLogic: [],
      thesis:
        "Puck-luck framing can be useful, but unless the public-source rules are specific, it stays a reference model instead of a performance claim.",
      sourceNotes: [
        {
          label: "External/source-based",
          detail: "Included as a cataloged outside-style model. No Goosalytics-owned track record is implied.",
        },
      ],
      automationStatusLabel: "Source-based reference",
      automationStatusDetail: "No internal automation or verified record set attached yet.",
      dataRequirements: [
        { label: "Public source rule capture", status: "pending", detail: "Need exact source criteria before screening." },
        { label: "Separate tracking bucket", status: "pending", detail: "Must stay distinct from native models if later tracked." },
      ],
      trackingNotes: ["External/source-based label should remain prominent."],
      records: [],
    },
    {
      id: "beefs-bounce-back",
      slug: "beefs-bounce-back",
      name: "Beefs Bounce-Back",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_verification",
      summary: "Team-response angle for flat or embarrassing prior outings, pending hard trigger rules.",
      snapshot: "Awaiting verification.",
      definition:
        "A bounce-back style NHL setup intended to isolate teams likely to respond after a poor or high-friction prior performance, but not yet formalized enough to claim edge.",
      qualifierRules: [
        "Needs a concrete prior-game failure definition.",
        "Needs price and opponent filters so the spot is not just a generic bounce-back story.",
      ],
      progressionLogic: [],
      thesis:
        "Response spots can be real, but the market also prices obvious embarrassment angles. The system needs harder filters before it deserves a record page with meaning.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged for future work; current status is awaiting verification rather than live tracking.",
        },
      ],
      automationStatusLabel: "Awaiting verification",
      automationStatusDetail: "Needs formal bounce-back triggers and pricing rules.",
      dataRequirements: [
        { label: "Prior-game failure trigger", status: "pending", detail: "No stable trigger definition yet." },
        { label: "Opponent/price filter", status: "pending", detail: "Must separate real spots from expensive public bounce-backs." },
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "tonys-hot-bats",
      slug: "tonys-hot-bats",
      name: "Tony’s Hot Bats",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      summary: "MLB offense-temperature concept focused on lineup form and recent run-creation bursts.",
      snapshot: "MLB definition seeded; pipeline not attached.",
      definition:
        "A hitting-form concept designed to capture teams whose current contact, power, or lineup health creates a stronger run-production environment than season-long priors suggest.",
      qualifierRules: [
        "Needs lineup confirmation and a recency window definition.",
        "Should separate genuine form shifts from unsustainable BABIP noise.",
        "Market context matters; totals and moneyline pricing both need rules.",
      ],
      progressionLogic: [],
      thesis:
        "The MLB market can lag when lineup quality changes faster than baseline team stats, but the trigger has to be tighter than 'team scored a lot lately.'",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Catalog placeholder only until MLB-specific inputs and logging are wired in.",
        },
      ],
      automationStatusLabel: "Definition only",
      automationStatusDetail: "Needs lineup, rolling hitting, and price context before automation.",
      dataRequirements: [
        { label: "Confirmed lineups", status: "pending", detail: "Need day-of lineup inputs." },
        { label: "Rolling offense form model", status: "pending", detail: "Recent performance window not defined yet." },
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "fly-low-goose",
      slug: "fly-low-goose",
      name: "Fly Low Goose",
      league: "MLB",
      category: "native",
      owner: "Goosalytics Lab",
      status: "definition_only",
      summary: "Goose-branded underdog/low-event concept cataloged now, waiting on a real MLB ruleset.",
      snapshot: "Definition only.",
      definition:
        "Reserved for an MLB Goose-family angle built around lower-volatility game states, pricing inefficiencies, or first-five style qualifiers once the actual entry rules are finalized.",
      qualifierRules: [
        "Do not track until the true qualifier rules are written down.",
        "League and bet-type scope must be explicit before publishing performance.",
      ],
      progressionLogic: [],
      thesis:
        "There may be an MLB Goose counterpart worth tracking, but right now this is a named slot in the catalog, not a live model.",
      sourceNotes: [
        {
          label: "Native placeholder",
          detail: "Included so the product can support future Goose-family systems without faking results now.",
        },
      ],
      automationStatusLabel: "Definition only",
      automationStatusDetail: "Schema-ready, rules not finalized.",
      dataRequirements: [
        { label: "True qualifier rules", status: "pending", detail: "Still needs the actual MLB Goose logic." },
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "tonys-teaser-pleaser",
      slug: "tonys-teaser-pleaser",
      name: "Tony’s Teaser Pleaser",
      league: "NFL",
      category: "external",
      owner: "External source",
      status: "source_based",
      summary: "NFL teaser-screening concept clearly labeled as source-based rather than native tracked performance.",
      snapshot: "Source-based teaser framework only.",
      definition:
        "A catalog slot for classic teaser heuristics and Warren Sharp-style teaser screening ideas. Included for definition and sourcing, not as a claimed in-house record.",
      qualifierRules: [
        "Must remain labeled as external/source-based unless Goosalytics creates its own explicit variant.",
        "Key-number crossing rules need to be documented clearly.",
        "If later tracked, teaser legs and pricing assumptions need their own separate ledger.",
      ],
      progressionLogic: [],
      thesis:
        "Teaser logic can be useful as a screening framework, but users should never confuse source-based heuristics with a native Goosalytics dataset.",
      sourceNotes: [
        {
          label: "External/source-based",
          detail: "Explicitly references public teaser concepts rather than a verified Goosalytics-owned performance model.",
        },
      ],
      automationStatusLabel: "Source-based reference",
      automationStatusDetail: "No native teaser tracker or graded history attached.",
      dataRequirements: [
        { label: "Key-number rule spec", status: "pending", detail: "Need explicit teaser entry rules." },
        { label: "Teaser price ledger", status: "pending", detail: "Would need distinct pricing and settlement handling." },
      ],
      trackingNotes: ["Keep Warren Sharp-style framing in source notes, not as implied ownership."],
      records: [],
    },
  ];
}

const SYSTEM_TEMPLATES = seededCatalog();
const SYSTEM_TEMPLATE_MAP = new Map(SYSTEM_TEMPLATES.map((system) => [system.id, system]));

function defaultData(): SystemsTrackingData {
  return {
    updatedAt: new Date().toISOString(),
    systems: SYSTEM_TEMPLATES.map((system) => normalizeSystem(system)),
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `system-${Date.now()}`;
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

function normalizeSourceNotes(value: unknown, fallback: SystemSourceNote[]) {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const label = typeof (entry as any).label === "string" ? (entry as any).label : "Source";
      const detail = typeof (entry as any).detail === "string" ? (entry as any).detail : "";
      return detail ? { label, detail } : null;
    })
    .filter(Boolean) as SystemSourceNote[];
}

function normalizeSystem(system: Partial<TrackedSystem> & { sport?: string }): TrackedSystem {
  const base = system.id ? SYSTEM_TEMPLATE_MAP.get(system.id) : undefined;
  return {
    id: system.id || base?.id || `system_${Date.now()}`,
    slug: system.slug || base?.slug || slugify(system.name || base?.name || "system"),
    name: system.name || base?.name || "Untitled system",
    league: system.league || system.sport || base?.league || "NBA",
    category: system.category || base?.category || "native",
    owner: system.owner || base?.owner || "Goosalytics Lab",
    status: (system.status as SystemTrackingStatus) || base?.status || "definition_only",
    summary: system.summary || base?.summary || "",
    snapshot: system.snapshot ?? base?.snapshot ?? null,
    definition: system.definition || base?.definition || "",
    qualifierRules: Array.isArray(system.qualifierRules)
      ? system.qualifierRules.filter(Boolean)
      : (base?.qualifierRules || []),
    progressionLogic: Array.isArray(system.progressionLogic)
      ? system.progressionLogic.filter(Boolean)
      : (base?.progressionLogic || []),
    thesis: system.thesis || base?.thesis || "",
    sourceNotes: normalizeSourceNotes((system as any).sourceNotes, base?.sourceNotes || []),
    automationStatusLabel: system.automationStatusLabel || base?.automationStatusLabel || "Definition only",
    automationStatusDetail: system.automationStatusDetail || base?.automationStatusDetail || "",
    dataRequirements: Array.isArray(system.dataRequirements) && system.dataRequirements.length
      ? system.dataRequirements
      : (base?.dataRequirements || []),
    trackingNotes: Array.isArray(system.trackingNotes)
      ? system.trackingNotes.filter(Boolean)
      : (base?.trackingNotes || []),
    records: Array.isArray(system.records) ? system.records.map(normalizeRecord) : [],
  };
}

function mergeCatalogSystems(systems: Array<Partial<TrackedSystem> & { sport?: string }>) {
  const normalizedById = new Map(systems.map((system) => {
    const normalized = normalizeSystem(system);
    return [normalized.id, normalized] as const;
  }));

  const merged = SYSTEM_TEMPLATES.map((template) => normalizeSystem(normalizedById.get(template.id) || template));

  for (const [id, system] of Array.from(normalizedById.entries())) {
    if (!SYSTEM_TEMPLATE_MAP.has(id)) {
      merged.push(system);
    }
  }

  return merged;
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
  system.slug = defaults.slug;
  system.name = defaults.name;
  system.league = defaults.league;
  system.category = defaults.category;
  system.owner = defaults.owner;
  system.summary = defaults.summary;
  system.snapshot = defaults.snapshot;
  system.definition = defaults.definition;
  system.qualifierRules = defaults.qualifierRules;
  system.progressionLogic = defaults.progressionLogic;
  system.thesis = defaults.thesis;
  system.sourceNotes = defaults.sourceNotes;
  system.automationStatusLabel = defaults.automationStatusLabel;
  system.automationStatusDetail = defaults.automationStatusDetail;
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
      systems: mergeCatalogSystems(Array.isArray(parsed?.systems) ? parsed.systems : defaultData().systems),
    };
    applyGooseReadiness(getGooseSystem(data));
    return data;
  } catch {
    return defaultData();
  }
}

export async function getTrackedSystemBySlug(slug: string): Promise<TrackedSystem | null> {
  const data = await readSystemsTrackingData();
  return data.systems.find((system) => system.slug === slug) || null;
}

export function getSystemSnapshot(system: TrackedSystem) {
  const metrics = getSystemDerivedMetrics(system);
  if (metrics.completedSequences > 0 && metrics.sequenceWinRate != null) {
    return `${(metrics.sequenceWinRate * 100).toFixed(1)}% sequence win rate across ${metrics.completedSequences} settled sequence${metrics.completedSequences === 1 ? "" : "s"}.`;
  }
  if (metrics.qualifiedGames > 0) {
    return `${metrics.qualifiedGames} qualifier${metrics.qualifiedGames === 1 ? "" : "s"} stored${metrics.trackableGames ? `, ${metrics.trackableGames} with full quarter-line coverage` : ""}.`;
  }
  return system.snapshot || "No tracked sample yet.";
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
