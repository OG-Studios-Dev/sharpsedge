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
export type SystemTrackabilityBucket =
  | "trackable_now"
  | "parked_definition_only"
  | "blocked_missing_data";
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
  trackabilityBucket: SystemTrackabilityBucket;
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
  unlockNotes: string[];
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
    trackabilityBucket: "trackable_now",
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
    unlockNotes: [],
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
      id: "beefs-bounce-back",
      slug: "beefs-bounce-back-big-ats-loss",
      name: "Beefs Bounce-Back / Big ATS Loss",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_verification",
      trackabilityBucket: "blocked_missing_data",
      summary: "NBA revenge-cover angle for teams coming off a brutal ATS miss, cataloged honestly as blocked until prior-game line history is wired in.",
      snapshot: "Blocked: prior-game ATS result feed not connected.",
      definition:
        "Flag NBA teams that were blown out relative to the market in their previous game, then test whether the next spot creates an actionable bounce-back cover setup.",
      qualifierRules: [
        "Previous game must qualify as a major ATS miss, not just a straight-up loss.",
        "The follow-up game needs spread and opponent-strength filters so this is not an auto-bet on any embarrassed team.",
        "Back-to-back and travel context likely matter and should be part of the final screen.",
      ],
      progressionLogic: [],
      thesis:
        "Markets can overreact to public ugly losses, but the angle only deserves tracking once prior-game ATS margin and next-game pricing can be reproduced mechanically.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged as a future bounce-back system, not as a live or backtested model.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Needs prior-game closing spread archive, ATS result history, and rest/travel context before honest screening.",
      dataRequirements: [
        { label: "Previous-game closing spread archive", status: "pending", detail: "Required to quantify what counts as a big ATS loss." },
        { label: "Previous-game ATS result history", status: "pending", detail: "Need game-by-game close versus final margin inputs." },
        { label: "Rest/travel context", status: "pending", detail: "Back-to-back and travel filters are likely necessary to avoid fake edges." },
      ],
      unlockNotes: [
        "Previous-game closing spread archive required.",
        "Reliable ATS result history feed required.",
        "Rest/travel schedule context required.",
      ],
      trackingNotes: ["Do not publish performance until the ATS-loss trigger is mechanically reproducible."],
      records: [],
    },
    {
      id: "the-blowout",
      slug: "the-blowout",
      name: "The Blowout",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "Public-facing blowout-response concept parked in research because the actual next-game rules are still too fuzzy to automate honestly.",
      snapshot: "Parked in research; trigger still too vague.",
      definition:
        "A next-game NBA angle built around teams coming off massive wins or losses where the market may overprice the recency narrative.",
      qualifierRules: [
        "Need a formal definition for what counts as a blowout relative to closing line, not just raw margin.",
        "Need to decide whether the system fades the blowout winner, backs the loser, or screens both depending on price.",
        "Opponent class and scheduling context need to be written into the rule set.",
      ],
      progressionLogic: [],
      thesis:
        "Recency bias after a loud result can be exploitable, but right now the system is still a concept headline instead of a reproducible rulebook.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Intentionally parked until the definition becomes precise enough to track without hand-curation.",
        },
      ],
      automationStatusLabel: "Parked / definition only",
      automationStatusDetail: "Precise rules still not defined enough to automate honestly.",
      dataRequirements: [
        { label: "Blowout trigger definition", status: "pending", detail: "Need exact margin-versus-close logic." },
        { label: "Next-game entry rules", status: "pending", detail: "Need the actual bet direction and price bands." },
      ],
      unlockNotes: [
        "Precise rules still not defined enough to automate honestly.",
        "Need exact blowout threshold versus closing line.",
        "Need next-game bet-direction and price rules.",
      ],
      trackingNotes: ["Keep this in research until the qualifier can be logged by script rather than vibes."],
      records: [],
    },
    {
      id: "hot-teams-matchup",
      slug: "hot-teams-matchup",
      name: "Hot Teams Matchup",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "Temperature-check matchup concept for when two in-form NBA teams collide, parked until form and fade rules are actually codified.",
      snapshot: "Parked: form logic not codified.",
      definition:
        "Track NBA matchups where both teams enter on strong form and the market may misprice the sustainability or collision of those streaks.",
      qualifierRules: [
        "Need a strict definition of 'hot' based on recent ATS, straight-up form, efficiency, or some blend.",
        "Need to decide whether the system looks for continuation, fade, or totals spillover.",
        "Need injury and opponent-quality adjustments in the final spec.",
      ],
      progressionLogic: [],
      thesis:
        "Form-versus-form games are attractive on paper, but a system like this is fake unless the exact temperature metric and market reaction rules are nailed down.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged to preserve the idea, not to imply a live dataset exists.",
        },
      ],
      automationStatusLabel: "Parked / definition only",
      automationStatusDetail: "Precise form and matchup rules are not defined enough yet.",
      dataRequirements: [
        { label: "Hot-team scoring rubric", status: "pending", detail: "Need exact form inputs and lookback windows." },
        { label: "Bet-direction logic", status: "pending", detail: "Need a real rule for side versus total versus pass." },
      ],
      unlockNotes: [
        "Precise rules still not defined enough to automate honestly.",
        "Need exact hot-team rubric and lookback window.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "fat-tonys-fade",
      slug: "fat-tonys-fade",
      name: "Fat Tonys Fade",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "blocked_missing_data",
      summary: "Contrarian NBA fade concept blocked until a credible public-betting splits source is attached.",
      snapshot: "Blocked: betting splits source required.",
      definition:
        "Fade inflated NBA sides where the public piles into a trendy favorite and price drift overshoots the true edge.",
      qualifierRules: [
        "Must be grounded in public tickets and preferably handle splits, not social-media vibes.",
        "Needs line-move context so steam and stale public bias are not treated the same.",
        "Should include a minimum market consensus threshold.",
      ],
      progressionLogic: [],
      thesis:
        "A public-fade angle is only real if the public-position input is real. Without trustworthy splits, this is just theater.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Saved as a real catalog item, but blocked until a defensible splits feed is chosen.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Public betting handle splits source required, plus line-move history to separate narrative from price action.",
      dataRequirements: [
        { label: "Public betting handle splits", status: "pending", detail: "Need a trustworthy source for public betting percentage by game." },
        { label: "Line-move history", status: "pending", detail: "Need open-to-close movement to identify overpriced public sides." },
      ],
      unlockNotes: [
        "Public betting handle splits source required.",
        "Line-move history feed required.",
      ],
      trackingNotes: ["Do not fake 'public is on X' claims without an actual source."],
      records: [],
    },
    {
      id: "coaches-fuming-scoring-drought",
      slug: "coaches-fuming-scoring-drought",
      name: "Coaches Fuming Scoring Drought",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "blocked_missing_data",
      summary: "NHL buy-low frustration spot blocked until quote/news tagging and a repeatable scoring-drought trigger exist.",
      snapshot: "Blocked: quote/news tagging required.",
      definition:
        "Target NHL teams with solid underlying creation that just endured a loud scoring drought, especially when coach or player frustration becomes part of the next-game story.",
      qualifierRules: [
        "Needs a repeatable definition of a scoring drought, not just 'they didn't score much.'",
        "Requires structured coach/player frustration tagging from trustworthy news sources.",
        "Should include a baseline offensive-quality filter so weak attacks are excluded.",
      ],
      progressionLogic: [],
      thesis:
        "The next-game rebound story can be real when the market overweights one ugly offensive night, but only if drought and frustration inputs are captured systematically.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged honestly as blocked until the news-tagging and drought logic are measurable.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Reliable coach-quote/news tagging required, plus a concrete scoring-drought event definition.",
      dataRequirements: [
        { label: "Scoring-drought event flag", status: "pending", detail: "Need a repeatable shot/chance drought definition." },
        { label: "Coach/player quote tagging", status: "pending", detail: "Reliable coach-quote/news tagging required." },
        { label: "Offensive baseline filter", status: "pending", detail: "Need an offensive-quality input so bad offenses are not mislabeled as buy-low spots." },
      ],
      unlockNotes: [
        "Reliable coach-quote/news tagging required.",
        "Concrete scoring-drought event definition required.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "swaggy-stretch-drive",
      slug: "swaggy-stretch-drive",
      name: "Swaggy Stretch Drive",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "Late-season NHL urgency concept parked until stretch-run motivation rules are specific enough to survive automation.",
      snapshot: "Parked in research.",
      definition:
        "Look for late-season NHL teams with real standings urgency, style edges, or playoff-race pressure that may not be fully priced into the market.",
      qualifierRules: [
        "Need exact standings-pressure thresholds rather than a generic 'must-win' label.",
        "Need a rule for whether travel/rest/goalie confirmation are mandatory inputs.",
        "Need a real pricing discipline rule so urgency alone does not become the bet.",
      ],
      progressionLogic: [],
      thesis:
        "Urgency can matter down the stretch, but the public also loves obvious playoff-race narratives. This stays parked until the actual filters are written down.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged as research only until the stretch-drive rulebook becomes precise.",
        },
      ],
      automationStatusLabel: "Parked / definition only",
      automationStatusDetail: "Precise stretch-drive motivation rules still need to be defined honestly.",
      dataRequirements: [
        { label: "Standings urgency rules", status: "pending", detail: "Need explicit clinch/elimination/seed-pressure thresholds." },
        { label: "Goalie and rest rulebook", status: "pending", detail: "Need to decide whether confirmed starters and schedule fatigue are mandatory." },
      ],
      unlockNotes: [
        "Precise rules still not defined enough to automate honestly.",
        "Need exact standings-urgency thresholds.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "veal-bangers-zig-playoff-zigzag",
      slug: "veal-bangers-zig-playoff-zigzag",
      name: "Veal Bangers Playoff ZigZag",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "Classic playoff zig-zag riff preserved exactly by name, but parked until the real rematch filters are defined beyond old-school folklore.",
      snapshot: "Parked in research; no playoff-series rulebook yet.",
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
      automationStatusLabel: "Parked / definition only",
      automationStatusDetail: "Needs playoff-series state, price thresholds, and matchup filters before honest tracking.",
      dataRequirements: [
        { label: "Series-state inputs", status: "pending", detail: "Need game number, prior result, and home/road sequence context." },
        { label: "Overreaction rule set", status: "pending", detail: "Need exact line-move or prior-game trigger rules." },
      ],
      unlockNotes: [
        "Precise playoff zig-zag rules still not defined enough to automate honestly.",
        "Need playoff-series state and price-threshold rules.",
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
      trackabilityBucket: "blocked_missing_data",
      summary: "External-style puck-luck concept blocked until a real xG/finishing-luck source and exact public rules are attached.",
      snapshot: "Blocked: puck-luck data feed required.",
      definition:
        "An externally inspired NHL concept around variance, finishing luck, and short-term puck-luck narratives. Included in the catalog so users can see the definition and sourcing without mistaking it for a verified in-house edge.",
      qualifierRules: [
        "Do not present as a native Goosalytics model.",
        "Would need explicit public-source rules before any automated screening.",
        "If tracked later, results must be tagged separately from internal systems.",
      ],
      progressionLogic: [],
      thesis:
        "Puck-luck framing can be useful, but unless the public-source rules are specific and an xG/luck feed exists, it stays a reference model instead of a performance claim.",
      sourceNotes: [
        {
          label: "External/source-based",
          detail: "Included as a cataloged outside-style model. No Goosalytics-owned track record is implied.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Needs public source rule capture plus a reliable xG / finishing-luck feed.",
      dataRequirements: [
        { label: "Public rule capture", status: "pending", detail: "Need the exact outside-source criteria before screening." },
        { label: "xG / finishing-luck feed", status: "pending", detail: "Need a reliable public data source for shot-quality and shooting/save percentage luck context." },
      ],
      unlockNotes: [
        "Reliable xG / finishing-luck source required.",
        "Public source rule capture required.",
      ],
      trackingNotes: ["External/source-based label should remain prominent."],
      records: [],
    },
    {
      id: "tonys-hot-bats",
      slug: "tonys-hot-bats",
      name: "Tony’s Hot Bats",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "blocked_missing_data",
      summary: "MLB lineup-form angle blocked until confirmed lineups, recent hitting form, and weather/park context are actually wired in.",
      snapshot: "Blocked: lineup and rolling-form feeds required.",
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
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Confirmed lineups, rolling hitting form, and weather/park context are required before honest automation.",
      dataRequirements: [
        { label: "Confirmed lineups", status: "pending", detail: "Need day-of projected/confirmed lineup inputs." },
        { label: "Rolling offense form model", status: "pending", detail: "Need a defined recent-hitting and power form feed." },
        { label: "Weather / park context", status: "pending", detail: "Need temperature, wind, and park-factor context for offense-heavy flags." },
      ],
      unlockNotes: [
        "Confirmed lineups required.",
        "Rolling offense form model required.",
        "Weather / park context required.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "falcons-fight-pummeled-pitchers",
      slug: "falcons-fight-pummeled-pitchers",
      name: "Falcons Fight Pummeled Pitchers",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "blocked_missing_data",
      summary: "MLB rebound spot for good arms off ugly starts, blocked until probable-pitcher, pitch-count, and prior-start damage data are connected.",
      snapshot: "Blocked: pitcher damage log required.",
      definition:
        "Look for pitchers with stable talent profiles coming off a public shelling, then evaluate the next start for overreaction in side or first-five pricing.",
      qualifierRules: [
        "Need a formal definition for what counts as 'pummeled' beyond earned runs alone.",
        "Must distinguish between bad luck, injury concern, and true skill collapse.",
        "Likely needs a first-five or side-only rule to avoid mixing bet types.",
      ],
      progressionLogic: [],
      thesis:
        "One ugly start can distort the next price, but that only matters if we can tell a fluky blow-up from a genuinely broken pitcher.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Tracked as blocked research until pitcher-quality and damage inputs are available.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Probable pitchers, prior-start damage logs, and pitch-count/context feeds are required.",
      dataRequirements: [
        { label: "Probable pitchers feed", status: "pending", detail: "Need day-of probable starters with confidence/confirmation." },
        { label: "Prior-start damage log", status: "pending", detail: "Need pitch-by-pitch or box-score context to classify a true shelling." },
        { label: "Pitch-count / health context", status: "pending", detail: "Need indicators that separate injury red flags from bad variance." },
      ],
      unlockNotes: [
        "Probable pitchers feed required.",
        "Prior-start damage log required.",
        "Pitch-count / health context required.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "falcons-fight-big-upset-follow-ups",
      slug: "falcons-fight-big-upset-follow-ups",
      name: "Falcons Fight Big Upset Follow-Ups",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "MLB post-upset follow-up concept parked until the actual upset threshold and next-game action are specified.",
      snapshot: "Parked in research.",
      definition:
        "Track teams after a loud underdog upset to see whether the next market overvalues momentum or underprices letdown.",
      qualifierRules: [
        "Need a strict definition of what counts as a big upset using pregame moneyline.",
        "Need to decide whether the angle fades the upset winner, backs the opponent, or changes by matchup context.",
        "Pitching and bullpen carryover rules likely matter and are not finalized.",
      ],
      progressionLogic: [],
      thesis:
        "The public can chase a headline upset too far, but this system is still parked because the follow-up action and thresholds are not locked.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Stored as research so the catalog is complete without pretending the rulebook exists.",
        },
      ],
      automationStatusLabel: "Parked / definition only",
      automationStatusDetail: "Need exact upset thresholds and next-game bet rules before honest tracking.",
      dataRequirements: [
        { label: "Upset threshold definition", status: "pending", detail: "Need exact moneyline bands for what qualifies as a major upset." },
        { label: "Next-game action rules", status: "pending", detail: "Need the real follow-up betting logic." },
      ],
      unlockNotes: [
        "Precise rules still not defined enough to automate honestly.",
        "Need exact upset threshold and follow-up action rules.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "quick-rips-f5",
      slug: "quick-rips-f5",
      name: "Quick Rips F5",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "blocked_missing_data",
      summary: "First-five MLB ripper concept blocked until F5 lines, probable pitchers, and a stable entry model exist in the pipeline.",
      snapshot: "Blocked: F5 lines + probable pitchers required.",
      definition:
        "An MLB first-five system intended to attack early-game pricing before bullpen variance takes over, likely driven by starter mismatch and opening-through-F5 market shape.",
      qualifierRules: [
        "Needs a declared F5 market scope: side, total, or both.",
        "Probable pitchers and lineup confirmation have to be locked before pricing is trusted.",
        "Starter mismatch rules need to be defined explicitly.",
      ],
      progressionLogic: [],
      thesis:
        "There is a real case for isolating first-five edges in baseball, but only if the app can capture the actual F5 prices and starter inputs instead of guessing them.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged now, blocked honestly until F5-specific data exists.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "F5 lines + probable pitchers required, along with a real starter-mismatch model.",
      dataRequirements: [
        { label: "F5 lines", status: "pending", detail: "F5 lines + totals feed required." },
        { label: "Probable pitchers", status: "pending", detail: "Need reliable probable-pitcher inputs and confirmations." },
        { label: "Starter-mismatch model", status: "pending", detail: "Need the actual rule set for what counts as a quick-rip edge." },
      ],
      unlockNotes: [
        "F5 lines + probable pitchers required.",
        "Starter-mismatch model required.",
      ],
      trackingNotes: [],
      records: [],
    },
    {
      id: "warren-sharp-computer-totals-model",
      slug: "warren-sharp-computer-totals-model",
      name: "Warren Sharp Computer Totals Model",
      league: "NFL",
      category: "external",
      owner: "External source",
      status: "source_based",
      trackabilityBucket: "blocked_missing_data",
      summary: "External-model totals concept blocked until an actual projections feed and line archive are attached.",
      snapshot: "Blocked: external totals projections feed required.",
      definition:
        "A catalog entry for externally sourced NFL totals-model thinking. Included for attribution and idea coverage, not as a claimed native Goosalytics record.",
      qualifierRules: [
        "Must remain labeled as external/source-based unless Goosalytics builds its own totals model.",
        "Requires actual model projection numbers and timestamps, not article blurbs.",
        "If later tracked, source-based results must remain separate from native systems.",
      ],
      progressionLogic: [],
      thesis:
        "Projection-driven totals can be worth surfacing, but only when a real model feed exists. Otherwise it is just branded commentary.",
      sourceNotes: [
        {
          label: "External/source-based",
          detail: "Reference concept only. No Goosalytics-owned totals model or verified record is implied.",
        },
      ],
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "External model projections feed required, plus totals open/close archive for honest logging.",
      dataRequirements: [
        { label: "External totals projections", status: "pending", detail: "External model projections feed required." },
        { label: "Totals line archive", status: "pending", detail: "Need opening/closing totals history and timestamps." },
      ],
      unlockNotes: [
        "External model projections feed required.",
        "Totals line archive required.",
      ],
      trackingNotes: ["Keep this separated from native Goosalytics systems if ever activated."],
      records: [],
    },
    {
      id: "fly-low-goose",
      slug: "fly-low-goose",
      name: "Fly Low Goose",
      league: "NFL",
      category: "native",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "Reserved NFL Goose-family slot parked until the actual qualifier logic exists on paper.",
      snapshot: "Parked: NFL Goose rules not finalized.",
      definition:
        "A placeholder for a future NFL Goose-family system, likely centered on low-event or under-the-radar game states once the real entry criteria are finalized.",
      qualifierRules: [
        "Do not track until the true qualifier rules are written down.",
        "Bet type, market timing, and any progression logic must be explicit before performance is published.",
      ],
      progressionLogic: [],
      thesis:
        "There may be an NFL Goose cousin worth shipping later, but right now this is a named slot in the catalog, not a live system.",
      sourceNotes: [
        {
          label: "Native placeholder",
          detail: "Included so the product can support future Goose-family systems without pretending the NFL version already exists.",
        },
      ],
      automationStatusLabel: "Parked / definition only",
      automationStatusDetail: "Precise rules still not defined enough to automate honestly.",
      dataRequirements: [
        { label: "True qualifier rules", status: "pending", detail: "Need the actual NFL Goose entry logic." },
      ],
      unlockNotes: [
        "Precise rules still not defined enough to automate honestly.",
        "Need the real NFL Goose qualifier rules.",
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
      trackabilityBucket: "blocked_missing_data",
      summary: "Source-based NFL teaser framework blocked until teaser prices, leg rules, and key-number screening are actually stored.",
      snapshot: "Blocked: teaser ledger required.",
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
      automationStatusLabel: "Blocked by missing data",
      automationStatusDetail: "Need teaser prices, leg-level settlement handling, and explicit key-number rule capture.",
      dataRequirements: [
        { label: "Teaser price ledger", status: "pending", detail: "Need distinct teaser pricing and grading inputs." },
        { label: "Key-number rule capture", status: "pending", detail: "Need explicit teaser-entry logic crossing through 3, 7, and related numbers." },
      ],
      unlockNotes: [
        "Teaser price ledger required.",
        "Explicit key-number rule capture required.",
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
    trackabilityBucket: (system.trackabilityBucket as SystemTrackabilityBucket) || base?.trackabilityBucket || "parked_definition_only",
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
    unlockNotes: Array.isArray((system as any).unlockNotes)
      ? (system as any).unlockNotes.filter(Boolean)
      : (base?.unlockNotes || []),
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
  system.trackabilityBucket = defaults.trackabilityBucket;
  system.summary = defaults.summary;
  system.snapshot = defaults.snapshot;
  system.definition = defaults.definition;
  system.qualifierRules = defaults.qualifierRules;
  system.progressionLogic = defaults.progressionLogic;
  system.thesis = defaults.thesis;
  system.sourceNotes = defaults.sourceNotes;
  system.automationStatusLabel = defaults.automationStatusLabel;
  system.automationStatusDetail = defaults.automationStatusDetail;
  system.unlockNotes = defaults.unlockNotes;
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
