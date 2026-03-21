import { promises as fs } from "fs";
import path from "path";
import type { AggregatedOdds } from "@/lib/books/types";
import { getMLBPlayerGameLog, getMLBSchedule } from "@/lib/mlb-api";
import { getMLBEnrichmentBoard } from "@/lib/mlb-enrichment";
import { findMLBOddsForGame, getMLBOdds } from "@/lib/mlb-odds";
import { getNBAGameSummary, getNBASchedule, getNBAStandings, getRecentNBAGames, type NBAGame, type NBATeamStanding } from "@/lib/nba-api";
import { getBestOdds } from "@/lib/odds-api";
import { getAggregatedOddsForSport } from "@/lib/odds-aggregator";

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
  recordKind?: "progression" | "qualifier" | "alert" | null;
  marketType?: string | null;
  alertLabel?: string | null;
  starterName?: string | null;
  starterEra?: number | null;
  currentMoneyline?: number | null;
  priorGameDate?: string | null;
  priorStartSummary?: string | null;
  lineupStatus?: string | null;
  weatherSummary?: string | null;
  parkFactorSummary?: string | null;
  bullpenSummary?: string | null;
  f5Summary?: string | null;
  marketAvailability?: string | null;
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

export type SystemRefreshOptions = {
  date?: string;
  daysAhead?: number;
};

type RefreshGooseOptions = SystemRefreshOptions;

type SystemTracker = {
  refresh: (data: SystemsTrackingData, options?: SystemRefreshOptions) => Promise<TrackedSystem>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "systems-tracking.json");
const NBA_GOOSE_SYSTEM_ID = "nba-goose-system";
const THE_BLOWOUT_SYSTEM_ID = "the-blowout";
const HOT_TEAMS_MATCHUP_SYSTEM_ID = "hot-teams-matchup";
const FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID = "falcons-fight-pummeled-pitchers";
const TONYS_HOT_BATS_SYSTEM_ID = "tonys-hot-bats";

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
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "Neutral NBA watchlist for teams coming off a massive recent result, tracked honestly as qualifiers until direction and pricing rules are proven.",
      snapshot: "Watchlist only: qualifier rows, not picks.",
      definition:
        "Track NBA teams whose most recent game within the last 3 days was a blowout win or loss of 18+ points, then log the next matchup when the spread stays within a manageable band and the opponent clears a basic competence filter.",
      qualifierRules: [
        "League must be NBA.",
        "Qualified team’s most recent completed game must have ended within the last 3 days.",
        "That most recent game margin must be at least 18 points either for or against the qualified team.",
        "Next-game spread from the qualified team perspective must have absolute value <= 6.5.",
        "Opponent season win percentage must be >= .450.",
        "Direction stays unresolved for v1, so rows are stored as watchlist qualifiers only rather than auto-picks.",
      ],
      progressionLogic: [],
      thesis:
        "Huge recent results can distort the next-game narrative, but without a settled bet-direction rule this belongs in honest qualifier tracking first, not pick marketing.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Implemented as a neutral qualifier tracker first because the bet direction after a blowout is still unresolved.",
        },
      ],
      automationStatusLabel: "Live qualifier watchlist",
      automationStatusDetail: "Qualifiers are generated from live NBA schedule, standings, recent results, and current spreads. Stored rows stay directional-neutral.",
      dataRequirements: [
        { label: "Recent NBA results", status: "ready", detail: "Used to confirm the most recent game margin and recency window." },
        { label: "Current full-game spread", status: "ready", detail: "Used to confirm the next-game spread stays within +/-6.5 from the qualified team perspective." },
        { label: "Opponent season win percentage", status: "ready", detail: "Used to keep the watchlist from firing on bottom-tier opponents." },
        { label: "Bet-direction rulebook", status: "partial", detail: "Still unresolved, so the product stores qualifier/watchlist rows instead of picks." },
      ],
      unlockNotes: [
        "Bet-direction logic still needs proof before this can become a picks system.",
        "Historical close-versus-margin work would strengthen the blowout trigger later.",
      ],
      trackingNotes: [
        "Rows are stored per qualifying team, so a single game can produce two watchlist rows if both clubs meet the blowout criteria.",
        "Spread is recorded from the qualifying team perspective to keep the neutral watchlist honest.",
      ],
      records: [],
    },
    {
      id: "hot-teams-matchup",
      slug: "hot-teams-matchup",
      name: "Hot Teams Matchup",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "NBA form-collision watchlist for games where two legitimately hot teams meet on a playable number with a posted total.",
      snapshot: "Watchlist only: hot-team qualifiers, not picks.",
      definition:
        "Track NBA matchups where both teams have won at least 4 of their last 5 completed games, both own season win percentages of .550 or better, the spread stays within +/-5.5, and the total is posted.",
      qualifierRules: [
        "League must be NBA.",
        "Both teams must have won at least 4 of their last 5 completed games.",
        "Both teams must have season win percentages of .550 or better.",
        "Current full-game spread must be within +/-5.5.",
        "A game total must be available.",
        "Direction stays unresolved for v1, so rows are stored as matchup watchlist qualifiers only.",
      ],
      progressionLogic: [],
      thesis:
        "When two genuinely hot teams collide, the market can struggle to price whether form carries, cancels out, or spills into the total. Until that direction is proven, this should stay a tracked discovery system.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Implemented as a single-row matchup watchlist so the qualifier can be logged without pretending the bet direction is solved.",
        },
      ],
      automationStatusLabel: "Live qualifier watchlist",
      automationStatusDetail: "Qualifiers are generated from live NBA standings, recent results, and current odds. Stored rows remain direction-neutral.",
      dataRequirements: [
        { label: "Recent last-5 results", status: "ready", detail: "Used to confirm both teams are at least 4-1 in their last five completed games." },
        { label: "Season win percentages", status: "ready", detail: "Used to confirm both teams clear the .550 quality threshold." },
        { label: "Current spread and total", status: "ready", detail: "Used to confirm the spread band and that a posted total exists." },
        { label: "Bet-direction rulebook", status: "partial", detail: "Still unresolved, so the product stores qualifier/watchlist rows rather than picks." },
      ],
      unlockNotes: [
        "Need proof on whether this is a side, total, or pass framework before it can graduate from watchlist to picks.",
      ],
      trackingNotes: [
        "Rows are stored once per game to avoid duplicate qualifiers from both team perspectives.",
        "The total line is noted in row metadata because totals availability is part of the v1 qualifier.",
      ],
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
      summary: "Late-season NHL urgency concept now shows live context rails, but the betting rulebook still is not strict enough to automate honestly.",
      snapshot: "Live context board wired; final betting rules still parked in research.",
      definition:
        "Look for late-season NHL teams with real standings urgency, style edges, or playoff-race pressure that may not be fully priced into the market.",
      qualifierRules: [
        "Use sourced goalie status plus derived rest/travel/fatigue/playoff-pressure as context, not as standalone bet triggers.",
        "Need exact standings-pressure thresholds rather than a generic 'must-win' label.",
        "Need a rule for whether confirmed starters, fatigue bands, and official-team news are mandatory inputs or tie-breakers only.",
        "Need a real pricing discipline rule so urgency alone does not become the bet.",
      ],
      progressionLogic: [],
      thesis:
        "Urgency can matter down the stretch, especially when goalie quality and schedule fatigue are misaligned, but the public also loves obvious playoff-race narratives. Swaggy is smarter now because those rails are visible; it still stays parked until the actual betting filters are written down.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged as research only until the stretch-drive rulebook becomes precise.",
        },
        {
          label: "Live context rails",
          detail: "Detail page now surfaces sourced MoneyPuck/goalie/news inputs alongside derived rest, travel, fatigue, and playoff-pressure heuristics. Visibility improved; auto-betting did not.",
        },
      ],
      automationStatusLabel: "Context live, bet logic parked",
      automationStatusDetail: "Swaggy now shows live goalie, rest/travel/fatigue, playoff-pressure, and lightweight official-team news context, but precise entry and pricing rules still are not defined honestly.",
      dataRequirements: [
        { label: "Standings urgency rules", status: "partial", detail: "Heuristic conference-cutline pressure is now live, but exact clinch/elimination/seed-pressure thresholds still need a real rulebook." },
        { label: "Goalie + fatigue context rail", status: "ready", detail: "Starter status plus derived rest/travel/fatigue context is now visible on the Swaggy detail page." },
        { label: "Official-team news rail", status: "partial", detail: "Lightweight NHL.com team-site/news links are live, but coach-quote and roster-impact tagging remain shallow." },
        { label: "Pricing discipline", status: "pending", detail: "Need explicit market thresholds so Swaggy does not become a narrative-only playoff-pressure angle." },
      ],
      unlockNotes: [
        "Precise rules still not defined enough to automate honestly.",
        "Need exact standings-urgency thresholds.",
        "Need to decide whether goalie confirmation, fatigue bands, and official-team news are hard filters or only supporting context.",
      ],
      trackingNotes: [
        "Swaggy detail page now pulls the live NHL context board so users can inspect urgency, fatigue, goalie, and official-news context directly.",
        "MoneyPuck/goalie/news stay sourced; rest/travel/fatigue/playoff-pressure remain explicitly derived heuristics.",
        "No claimed track record or auto-generated picks are shown because the final price/entry rulebook still is not defined.",
      ],
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
      summary: "MLB hitting-context foundation now surfaces lineup confirmation, venue/weather, park factor, bullpen workload, and market availability — but the actual rolling offense model is still intentionally not claimed.",
      snapshot: "Foundation live: context board only, not a picks engine.",
      definition:
        "A hitting-form concept designed to capture teams whose current contact, power, or lineup health creates a stronger run-production environment than season-long priors suggest.",
      qualifierRules: [
        "Use official MLB live-feed lineup status only; unconfirmed orders stay explicitly unconfirmed.",
        "Context rows can surface weather, park factor, bullpen workload, and market availability before a final offense trigger exists.",
        "A real Tony's Hot Bats qualifier still needs a defined recent-offense window and a noise-control rule for BABIP / short-term variance.",
        "Market context matters; totals and moneyline pricing are captured only when books are actually posting them.",
      ],
      progressionLogic: [],
      thesis:
        "The MLB market can lag when lineup quality changes faster than baseline team stats, but the trigger has to be tighter than 'team scored a lot lately.'",
      sourceNotes: [
        {
          label: "Native context foundation",
          detail: "This board now uses the MLB enrichment rail for official lineup status, weather, park factor, bullpen workload, and market availability context.",
        },
        {
          label: "Honesty policy",
          detail: "Rows are evidence/context only until a real rolling-offense trigger exists. Missing lineups or markets stay unresolved instead of being guessed.",
        },
      ],
      automationStatusLabel: "Foundation context board live",
      automationStatusDetail: "The app can now refresh a daily Tony's Hot Bats foundation board from MLB enrichment rails, but it still does not claim a rolling offense model or official picks.",
      dataRequirements: [
        { label: "Official lineup status", status: "partial", detail: "MLB live feed is connected, but pregame confirmation stays conservative until MLB actually publishes a usable order." },
        { label: "Weather / park context", status: "ready", detail: "Temperature, wind, and seeded park factors are now attached per game when available." },
        { label: "Bullpen workload context", status: "ready", detail: "Last-three-day bullpen usage context is attached as a workload rail, not a predictive claim." },
        { label: "Market availability context", status: "partial", detail: "Moneyline, total, and F5 availability are surfaced only when the books expose them." },
        { label: "Rolling offense form model", status: "pending", detail: "Still need the actual recent-contact / power / lineup-quality trigger logic before honest qualifiers exist." },
      ],
      unlockNotes: [
        "Rolling offense form model required.",
        "Need a defined recent-hitting window and noise-control rule before calling any row a Hot Bats qualifier.",
        "Official lineup status remains conservative when MLB has not published a batting order yet.",
      ],
      trackingNotes: [
        "Rows are daily context snapshots, not bets, not backtests, and not a claim that the full Tony's Hot Bats model is complete.",
        "Lineup status comes only from MLB's live feed; no third-party lineup scrape is used to fake certainty.",
        "Market availability notes stay tied to posted books/markets. No synthetic F5 or total lines are created.",
      ],
      records: [],
    },
    {
      id: FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID,
      slug: "falcons-fight-pummeled-pitchers",
      name: "Falcons Fight Pummeled Pitchers",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "MLB qualifier tracker for probable starters coming off a recent shelling, filtered by listed ERA and current moneyline. Alerts first, not official picks.",
      snapshot: "Tracking qualifiers and alert rows only; no published picks or backfilled claims.",
      definition:
        "Flag upcoming MLB starters whose previous start within 10 days was objectively ugly, then surface the next game only when the listed ERA and current moneyline stay inside the first-pass screen.",
      qualifierRules: [
        "Upcoming MLB game must list a probable starter.",
        "That same starter must have a prior start within the last 10 days.",
        "The prior start counts as 'pummeled' if earned runs >= 5, hits allowed >= 8, or innings pitched < 4.0.",
        "Listed ERA must be 4.50 or lower when MLB provides an ERA; missing ERA stays unresolved instead of guessed.",
        "Current moneyline for the starter's team must be between -140 and +125.",
      ],
      progressionLogic: [],
      thesis:
        "Markets can overreact to one loud blow-up outing from a still-competent starter, but the product should only log the setup honestly first and let users inspect the evidence before anyone calls it a picks engine.",
      sourceNotes: [
        {
          label: "Native qualifier tracker",
          detail: "This is a Goosalytics-owned MLB system slice built from probable starters, MLB pitching game logs, and current odds.",
        },
        {
          label: "Honesty policy",
          detail: "Rows are alerts/qualifiers only. Missing probable starters, ERA, prior-start context, or price inputs stay unresolved rather than guessed.",
        },
      ],
      automationStatusLabel: "Live qualifier tracking + alert rows",
      automationStatusDetail: "The app can now refresh and store qualified MLB rebound spots from probable starters, prior pitching logs, current moneyline pricing, and day-of enrichment context rails.",
      dataRequirements: [
        { label: "Probable pitchers feed", status: "ready", detail: "MLB schedule hydrate exposes day-of probable starters when listed." },
        { label: "Prior-start damage log", status: "ready", detail: "Starter pitching game logs provide earned runs, hits allowed, and innings pitched for the prior outing." },
        { label: "Current moneyline", status: "ready", detail: "Best available moneyline is pulled from the aggregated MLB odds feed when books are posting." },
        { label: "Lineup status/context", status: "partial", detail: "MLB live feed lineup state is attached only when a batting order is exposed; otherwise the row stays explicitly unconfirmed." },
        { label: "Weather", status: "partial", detail: "Open-Meteo forecast context is attached for mapped parks, with indoor/retractable caveats preserved." },
        { label: "Park factors", status: "ready", detail: "Seeded Baseball Savant park-factor context is available when the home venue mapping exists." },
        { label: "Bullpen fatigue", status: "partial", detail: "Recent bullpen workload context is derived from MLB boxscores and attached when the team board can be built." },
        { label: "F5 market availability", status: "partial", detail: "First-five pricing is surfaced only when books explicitly post F5 markets; nothing is inferred from full-game lines." },
      ],
      unlockNotes: [],
      trackingNotes: [
        "Rows represent tracked qualifiers and alerts, not auto-published bets.",
        "If a probable starter changes or odds move outside the band, the next refresh can remove the qualifier for that date.",
        "When ERA is missing from the MLB probable-starter payload, the row can still qualify but the missing ERA stays called out in the notes.",
        "MLB enrichment rails add context only; they do not currently change Falcons qualification thresholds.",
        "Missing lineup/weather/park/bullpen/F5 signals are labeled as unavailable or unconfirmed instead of inferred.",
      ],
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
const SYSTEM_TRACKERS: Record<string, SystemTracker> = {
  [NBA_GOOSE_SYSTEM_ID]: {
    refresh: refreshGooseSystemData,
  },
  [THE_BLOWOUT_SYSTEM_ID]: {
    refresh: refreshTheBlowoutSystemData,
  },
  [HOT_TEAMS_MATCHUP_SYSTEM_ID]: {
    refresh: refreshHotTeamsMatchupSystemData,
  },
  [FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID]: {
    refresh: refreshFalconsFightPummeledPitchersSystemData,
  },
  [TONYS_HOT_BATS_SYSTEM_ID]: {
    refresh: refreshTonysHotBatsSystemData,
  },
};

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
    recordKind: record.recordKind || null,
    marketType: record.marketType || null,
    alertLabel: record.alertLabel || null,
    starterName: record.starterName || null,
    starterEra: typeof record.starterEra === "number" ? record.starterEra : null,
    currentMoneyline: typeof record.currentMoneyline === "number" ? record.currentMoneyline : null,
    priorGameDate: record.priorGameDate || null,
    priorStartSummary: record.priorStartSummary || null,
    lineupStatus: record.lineupStatus || null,
    weatherSummary: record.weatherSummary || null,
    parkFactorSummary: record.parkFactorSummary || null,
    bullpenSummary: record.bullpenSummary || null,
    f5Summary: record.f5Summary || null,
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

function getTrackedSystem(data: SystemsTrackingData, systemId: string, factory: () => TrackedSystem) {
  let system = data.systems.find((entry) => entry.id === systemId);
  if (!system) {
    system = factory();
    data.systems = [system, ...data.systems];
    return system;
  }

  const defaults = factory();
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
  system.sourceNotes = defaults.sourceNotes.map((note) => ({ ...note }));
  system.automationStatusLabel = defaults.automationStatusLabel;
  system.automationStatusDetail = defaults.automationStatusDetail;
  system.unlockNotes = [...defaults.unlockNotes];
  system.trackingNotes = [...defaults.trackingNotes];
  system.dataRequirements = defaults.dataRequirements.map((item) => ({ ...item }));

  return system;
}

function getGooseSystem(data: SystemsTrackingData) {
  return getTrackedSystem(data, NBA_GOOSE_SYSTEM_ID, defaultGooseSystem);
}

function getTheBlowoutSystem(data: SystemsTrackingData) {
  return getTrackedSystem(data, THE_BLOWOUT_SYSTEM_ID, () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(THE_BLOWOUT_SYSTEM_ID)!));
}

function getHotTeamsMatchupSystem(data: SystemsTrackingData) {
  return getTrackedSystem(data, HOT_TEAMS_MATCHUP_SYSTEM_ID, () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(HOT_TEAMS_MATCHUP_SYSTEM_ID)!));
}

function getFalconsFightPummeledPitchersSystem(data: SystemsTrackingData) {
  return getTrackedSystem(
    data,
    FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID)!),
  );
}

function getTonysHotBatsSystem(data: SystemsTrackingData) {
  return getTrackedSystem(
    data,
    TONYS_HOT_BATS_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(TONYS_HOT_BATS_SYSTEM_ID)!),
  );
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

function daysBetween(dateA: string, dateB: string) {
  const left = new Date(`${dateA}T12:00:00Z`).getTime();
  const right = new Date(`${dateB}T12:00:00Z`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / (24 * 60 * 60 * 1000);
}

function formatPitchingSummary(stats: { inningsPitched: number; earnedRuns: number; hitsAllowed: number }) {
  return `${stats.inningsPitched.toFixed(1)} IP, ${stats.earnedRuns} ER, ${stats.hitsAllowed} H allowed`;
}

function isPummeledStart(stats: { inningsPitched: number; earnedRuns: number; hitsAllowed: number }) {
  return stats.earnedRuns >= 5 || stats.hitsAllowed >= 8 || stats.inningsPitched < 4;
}

function buildPummeledReasons(stats: { inningsPitched: number; earnedRuns: number; hitsAllowed: number }) {
  const reasons: string[] = [];
  if (stats.earnedRuns >= 5) reasons.push(`${stats.earnedRuns} ER`);
  if (stats.hitsAllowed >= 8) reasons.push(`${stats.hitsAllowed} H allowed`);
  if (stats.inningsPitched < 4) reasons.push(`${stats.inningsPitched.toFixed(1)} IP`);
  return reasons;
}

function applyFalconsFightPummeledPitchersReadiness(system: TrackedSystem) {
  const qualifiers = system.records.length;
  const withEra = system.records.filter((record) => record.starterEra != null).length;
  const withMoneyline = system.records.filter((record) => record.currentMoneyline != null).length;
  const withLineups = system.records.filter((record) => record.lineupStatus && !record.lineupStatus.toLowerCase().includes("unavailable")).length;
  const withWeather = system.records.filter((record) => record.weatherSummary && !record.weatherSummary.toLowerCase().includes("unavailable")).length;
  const withParkFactors = system.records.filter((record) => record.parkFactorSummary && !record.parkFactorSummary.toLowerCase().includes("unavailable")).length;
  const withBullpen = system.records.filter((record) => record.bullpenSummary && !record.bullpenSummary.toLowerCase().includes("unavailable")).length;
  const withF5 = system.records.filter((record) => record.f5Summary && !record.f5Summary.toLowerCase().includes("rail unavailable")).length;

  system.status = qualifiers > 0 ? "tracking" : "awaiting_data";

  const probableRequirement = findRequirement(system, "Probable pitchers feed");
  if (probableRequirement) {
    probableRequirement.status = "ready";
    probableRequirement.detail = qualifiers > 0
      ? `Probable starters were captured for ${qualifiers} tracked qualifier${qualifiers === 1 ? "" : "s"}.`
      : "MLB schedule hydrate exposes probable starters when listed on the board.";
  }

  const priorStartRequirement = findRequirement(system, "Prior-start damage log");
  if (priorStartRequirement) {
    priorStartRequirement.status = qualifiers > 0 ? "ready" : "partial";
    priorStartRequirement.detail = qualifiers > 0
      ? `Prior pitching logs were linked for ${qualifiers} qualifier${qualifiers === 1 ? "" : "s"} and stored with prior-start summaries.`
      : "Pitching game logs are connected, but no current-day qualifier has been stored yet.";
  }

  const moneylineRequirement = findRequirement(system, "Current moneyline");
  if (moneylineRequirement) {
    moneylineRequirement.status = withMoneyline > 0 ? "ready" : qualifiers > 0 ? "partial" : "pending";
    moneylineRequirement.detail = withMoneyline > 0
      ? `Current moneyline captured for ${withMoneyline} tracked qualifier${withMoneyline === 1 ? "" : "s"}.`
      : qualifiers > 0
        ? "At least one stored qualifier is missing a current moneyline from the odds feed."
        : "No qualifying starter has met the live moneyline band yet.";
  }

  const lineupRequirement = findRequirement(system, "Lineup status/context");
  if (lineupRequirement) {
    lineupRequirement.status = withLineups > 0 ? "ready" : qualifiers > 0 ? "partial" : "pending";
    lineupRequirement.detail = withLineups > 0
      ? `Lineup context was attached to ${withLineups} tracked qualifier${withLineups === 1 ? "" : "s"}, while missing or unconfirmed lineups stay labeled explicitly.`
      : qualifiers > 0
        ? "Qualifier rows exist, but MLB did not expose a usable lineup state for at least one row."
        : "No current qualifier rows yet to attach lineup context.";
  }

  const weatherRequirement = findRequirement(system, "Weather");
  if (weatherRequirement) {
    weatherRequirement.status = withWeather > 0 ? "ready" : qualifiers > 0 ? "partial" : "pending";
    weatherRequirement.detail = withWeather > 0
      ? `Weather context was attached to ${withWeather} tracked qualifier${withWeather === 1 ? "" : "s"}; indoor/retractable cases stay contextual instead of assumed open-air.`
      : qualifiers > 0
        ? "Weather rail was unavailable or intentionally inapplicable on at least one stored row."
        : "No current qualifier rows yet to attach weather context.";
  }

  const parkRequirement = findRequirement(system, "Park factors");
  if (parkRequirement) {
    parkRequirement.status = withParkFactors > 0 ? "ready" : qualifiers > 0 ? "partial" : "pending";
    parkRequirement.detail = withParkFactors > 0
      ? `Seeded park-factor context was attached to ${withParkFactors} tracked qualifier${withParkFactors === 1 ? "" : "s"}.`
      : qualifiers > 0
        ? "At least one stored row could not be matched to a seeded park-factor context."
        : "No current qualifier rows yet to attach park-factor context.";
  }

  const bullpenRequirement = findRequirement(system, "Bullpen fatigue");
  if (bullpenRequirement) {
    bullpenRequirement.status = withBullpen > 0 ? "ready" : qualifiers > 0 ? "partial" : "pending";
    bullpenRequirement.detail = withBullpen > 0
      ? `Bullpen workload context was attached to ${withBullpen} tracked qualifier${withBullpen === 1 ? "" : "s"}.`
      : qualifiers > 0
        ? "Bullpen fatigue context was unavailable for at least one stored qualifier."
        : "No current qualifier rows yet to attach bullpen context.";
  }

  const f5Requirement = findRequirement(system, "F5 market availability");
  if (f5Requirement) {
    f5Requirement.status = withF5 > 0 ? "ready" : qualifiers > 0 ? "partial" : "pending";
    f5Requirement.detail = withF5 > 0
      ? `Explicit first-five market availability was checked for ${withF5} tracked qualifier${withF5 === 1 ? "" : "s"}; no synthetic F5 pricing is inferred.`
      : qualifiers > 0
        ? "Stored qualifier rows were checked for F5 pricing, but books did not expose usable first-five markets."
        : "No current qualifier rows yet to evaluate F5 availability.";
  }

  system.automationStatusLabel = qualifiers > 0 ? "Live qualifier tracking + alert rows" : "Awaiting fresh qualifiers";
  system.automationStatusDetail = qualifiers > 0
    ? `${qualifiers} MLB qualifier${qualifiers === 1 ? "" : "s"} stored. ${withEra} with listed ERA, ${withMoneyline} with captured moneyline, ${withLineups} with lineup context, ${withWeather} with weather, ${withParkFactors} with park context, ${withBullpen} with bullpen context, and ${withF5} checked for F5 availability.`
    : "Refresh scans probable starters, prior pitching logs, listed ERA, moneyline, lineup status, weather, park factors, bullpen workload, and explicit F5 market availability for live qualifier rows.";
}

function applySimpleWatchlistReadiness(system: TrackedSystem) {
  const qualifiers = system.records.length;
  system.status = qualifiers > 0 ? "tracking" : "awaiting_data";
  system.automationStatusLabel = qualifiers > 0 ? "Live qualifier watchlist" : "Awaiting fresh qualifiers";
}

function applyTonysHotBatsReadiness(system: TrackedSystem) {
  const rows = system.records.length;
  const officialLineups = system.records.filter((record) => record.lineupStatus === "official").length;
  const partialLineups = system.records.filter((record) => record.lineupStatus === "partial").length;
  const weatherReady = system.records.filter((record) => record.weatherSummary && record.weatherSummary !== "Weather context unavailable.").length;
  const parkReady = system.records.filter((record) => record.parkFactorSummary && !record.parkFactorSummary.toLowerCase().includes("missing")).length;
  const bullpenReady = system.records.filter((record) => record.bullpenSummary && !record.bullpenSummary.toLowerCase().includes("unavailable")).length;
  const marketReady = system.records.filter((record) => record.marketType || record.currentMoneyline != null || record.f5Summary).length;

  system.status = rows > 0 ? "tracking" : "awaiting_data";
  system.automationStatusLabel = rows > 0 ? "Foundation context board live" : "Awaiting today's MLB board";
  system.automationStatusDetail = rows > 0
    ? `${rows} MLB game context row${rows === 1 ? "" : "s"} stored. ${officialLineups} official lineup${officialLineups === 1 ? "" : "s"}, ${partialLineups} partial lineup${partialLineups === 1 ? "" : "s"}, ${weatherReady} with weather, ${parkReady} with park factor, ${bullpenReady} with bullpen context, ${marketReady} with posted market context.`
    : "Refresh will build a same-day MLB context board from lineups, weather, park factors, bullpen usage, and posted markets when games exist.";

  const lineupRequirement = findRequirement(system, "Official lineup status");
  if (lineupRequirement) {
    lineupRequirement.status = officialLineups > 0 ? "ready" : partialLineups > 0 || rows > 0 ? "partial" : "pending";
    lineupRequirement.detail = officialLineups > 0
      ? `${officialLineups} stored row${officialLineups === 1 ? " has" : "s have"} an official batting order from the MLB live feed.`
      : rows > 0
        ? "The board is loading lineup status, but today's games are still partial/unconfirmed in MLB's live feed."
        : "No same-day MLB board has been stored yet.";
  }

  const weatherRequirement = findRequirement(system, "Weather / park context");
  if (weatherRequirement) {
    weatherRequirement.status = rows > 0 && weatherReady > 0 && parkReady > 0 ? "ready" : rows > 0 ? "partial" : "pending";
    weatherRequirement.detail = rows > 0
      ? `${weatherReady} row${weatherReady === 1 ? "" : "s"} include weather context and ${parkReady} include seeded park-factor context.`
      : "No same-day MLB board has been stored yet.";
  }

  const bullpenRequirement = findRequirement(system, "Bullpen workload context");
  if (bullpenRequirement) {
    bullpenRequirement.status = bullpenReady > 0 ? "ready" : rows > 0 ? "partial" : "pending";
    bullpenRequirement.detail = bullpenReady > 0
      ? `${bullpenReady} stored row${bullpenReady === 1 ? " includes" : "s include"} last-three-day bullpen workload context.`
      : rows > 0
        ? "Today's board exists, but bullpen context was unavailable for at least one side."
        : "No same-day MLB board has been stored yet.";
  }

  const marketRequirement = findRequirement(system, "Market availability context");
  if (marketRequirement) {
    marketRequirement.status = marketReady > 0 ? "ready" : rows > 0 ? "partial" : "pending";
    marketRequirement.detail = marketReady > 0
      ? `${marketReady} stored row${marketReady === 1 ? " carries" : "s carry"} posted moneyline/total/F5 context from available books.`
      : rows > 0
        ? "Games are on the board, but posted market context is still thin or unavailable from the feeds."
        : "No same-day MLB board has been stored yet.";
  }

  const offenseRequirement = findRequirement(system, "Rolling offense form model");
  if (offenseRequirement) {
    offenseRequirement.status = "pending";
    offenseRequirement.detail = rows > 0
      ? "Context rails are now live, but the actual recent-offense trigger logic is still not defined enough to label any row a Hot Bats qualifier."
      : "Need the actual recent-offense trigger logic before honest qualifiers can exist.";
  }
}

function getTeamPerspectiveSpread(event: AggregatedOdds, teamAbbrev: string) {
  if (teamAbbrev === event.awayAbbrev) return event.bestAwaySpread?.line ?? null;
  if (teamAbbrev === event.homeAbbrev) return event.bestHomeSpread?.line ?? null;
  return null;
}

function getEventTotalLine(event: AggregatedOdds) {
  return event.bestOver?.line ?? event.bestUnder?.line ?? null;
}

function getTeamRecentGamesBeforeDate(games: NBAGame[], teamAbbrev: string, beforeDate: string) {
  return games
    .filter((game) => game.date < beforeDate && (game.homeTeam.abbreviation === teamAbbrev || game.awayTeam.abbreviation === teamAbbrev))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function getTeamMargin(game: NBAGame, teamAbbrev: string) {
  if (game.homeScore == null || game.awayScore == null) return null;
  if (game.homeTeam.abbreviation === teamAbbrev) return game.homeScore - game.awayScore;
  if (game.awayTeam.abbreviation === teamAbbrev) return game.awayScore - game.homeScore;
  return null;
}

function countRecentWins(games: NBAGame[], teamAbbrev: string, beforeDate: string, limit = 5) {
  const sample = getTeamRecentGamesBeforeDate(games, teamAbbrev, beforeDate).slice(0, limit);
  const wins = sample.filter((game) => (getTeamMargin(game, teamAbbrev) ?? -Infinity) > 0).length;
  return { wins, games: sample };
}

function buildBlowoutRecord(
  event: AggregatedOdds,
  targetDate: string,
  teamAbbrev: string,
  recentGame: NBAGame,
  opponentStanding: NBATeamStanding,
): SystemTrackingRecord {
  const teamIsAway = event.awayAbbrev === teamAbbrev;
  const qualifiedTeam = teamIsAway ? event.awayTeam : event.homeTeam;
  const opponentTeam = teamIsAway ? event.homeTeam : event.awayTeam;
  const teamSpread = getTeamPerspectiveSpread(event, teamAbbrev);
  const recentMargin = getTeamMargin(recentGame, teamAbbrev);
  const marginLabel = recentMargin == null
    ? "recent result unavailable"
    : recentMargin > 0
      ? `off a ${recentMargin}-point win`
      : `off a ${Math.abs(recentMargin)}-point loss`;

  return normalizeRecord({
    id: `${THE_BLOWOUT_SYSTEM_ID}:${event.gameId}:${teamAbbrev}`,
    gameId: event.gameId,
    oddsEventId: event.oddsApiEventId ?? null,
    gameDate: targetDate,
    matchup: `${event.awayTeam} @ ${event.homeTeam}`,
    roadTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    closingSpread: teamSpread,
    source: "NBA schedule + standings + aggregated odds",
    notes: `${qualifiedTeam} watchlist • ${marginLabel} on ${recentGame.date} • next vs ${opponentTeam} (${opponentStanding.winPct.toFixed(3)} win pct) • spread ${teamSpread ?? "—"}`,
    lastSyncedAt: new Date().toISOString(),
  });
}

function buildHotTeamsMatchupRecord(
  event: AggregatedOdds,
  targetDate: string,
  awayStanding: NBATeamStanding,
  homeStanding: NBATeamStanding,
  awayWins: number,
  homeWins: number,
): SystemTrackingRecord {
  const totalLine = getEventTotalLine(event);
  return normalizeRecord({
    id: `${HOT_TEAMS_MATCHUP_SYSTEM_ID}:${event.gameId}`,
    gameId: event.gameId,
    oddsEventId: event.oddsApiEventId ?? null,
    gameDate: targetDate,
    matchup: `${event.awayTeam} @ ${event.homeTeam}`,
    roadTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    closingSpread: event.bestAwaySpread?.line ?? event.bestHomeSpread?.line ?? null,
    source: "NBA standings + recent results + aggregated odds",
    notes: `${event.awayTeam} last 5: ${awayWins}-1 (${awayStanding.winPct.toFixed(3)}) • ${event.homeTeam} last 5: ${homeWins}-1 (${homeStanding.winPct.toFixed(3)}) • total ${totalLine ?? "—"}`,
    lastSyncedAt: new Date().toISOString(),
  });
}

async function getNBAQualifierContext() {
  const [standings, recentGames] = await Promise.all([
    getNBAStandings(),
    getRecentNBAGames(14),
  ]);

  return {
    standingMap: new Map(standings.map((standing) => [standing.teamAbbrev, standing])),
    recentGames,
  };
}

async function getNBATargetEvents(targetDate: string, daysAhead = 2) {
  const aggregated = await getAggregatedOddsForSport("NBA");
  return aggregated.filter((event) => getEventDate(event.commenceTime) === targetDate);
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

async function getTheBlowoutQualifiers(targetDate: string, daysAhead = 2) {
  const [{ standingMap, recentGames }, events] = await Promise.all([
    getNBAQualifierContext(),
    getNBATargetEvents(targetDate, daysAhead),
  ]);

  const records: SystemTrackingRecord[] = [];

  for (const event of events) {
    for (const teamAbbrev of [event.awayAbbrev, event.homeAbbrev]) {
      const opponentAbbrev = teamAbbrev === event.awayAbbrev ? event.homeAbbrev : event.awayAbbrev;
      const opponentStanding = standingMap.get(opponentAbbrev);
      if (!opponentStanding || opponentStanding.winPct < 0.45) continue;

      const recentGame = getTeamRecentGamesBeforeDate(recentGames, teamAbbrev, targetDate)[0];
      if (!recentGame) continue;

      const recencyDays = daysBetween(targetDate, recentGame.date);
      if (!Number.isFinite(recencyDays) || recencyDays > 3) continue;

      const recentMargin = getTeamMargin(recentGame, teamAbbrev);
      if (recentMargin == null || Math.abs(recentMargin) < 18) continue;

      const teamSpread = getTeamPerspectiveSpread(event, teamAbbrev);
      if (teamSpread == null || Math.abs(teamSpread) > 6.5) continue;

      records.push(buildBlowoutRecord(event, targetDate, teamAbbrev, recentGame, opponentStanding));
    }
  }

  return records.sort((left, right) => left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup) || left.id.localeCompare(right.id));
}

async function getHotTeamsMatchupQualifiers(targetDate: string, daysAhead = 2) {
  const [{ standingMap, recentGames }, events] = await Promise.all([
    getNBAQualifierContext(),
    getNBATargetEvents(targetDate, daysAhead),
  ]);

  const records: SystemTrackingRecord[] = [];

  for (const event of events) {
    const awayStanding = standingMap.get(event.awayAbbrev);
    const homeStanding = standingMap.get(event.homeAbbrev);
    if (!awayStanding || !homeStanding) continue;
    if (awayStanding.winPct < 0.55 || homeStanding.winPct < 0.55) continue;

    const awayForm = countRecentWins(recentGames, event.awayAbbrev, targetDate, 5);
    const homeForm = countRecentWins(recentGames, event.homeAbbrev, targetDate, 5);
    if (awayForm.games.length < 5 || homeForm.games.length < 5) continue;
    if (awayForm.wins < 4 || homeForm.wins < 4) continue;

    const awaySpread = event.bestAwaySpread?.line;
    if (awaySpread == null || Math.abs(awaySpread) > 5.5) continue;
    if (getEventTotalLine(event) == null) continue;

    records.push(buildHotTeamsMatchupRecord(event, targetDate, awayStanding, homeStanding, awayForm.wins, homeForm.wins));
  }

  return records.sort((left, right) => left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup));
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
    applySimpleWatchlistReadiness(getTheBlowoutSystem(data));
    applySimpleWatchlistReadiness(getHotTeamsMatchupSystem(data));
    applyFalconsFightPummeledPitchersReadiness(getFalconsFightPummeledPitchersSystem(data));
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
  if (system.id === TONYS_HOT_BATS_SYSTEM_ID) {
    if (metrics.qualifiedGames > 0) {
      const officialLineups = system.records.filter((record) => record.lineupStatus?.toLowerCase().includes("official")).length;
      const weatherRows = system.records.filter((record) => record.weatherSummary && record.weatherSummary !== "Weather context unavailable.").length;
      return `${metrics.qualifiedGames} MLB context row${metrics.qualifiedGames === 1 ? "" : "s"} stored, ${officialLineups} with official lineup confirmation language, ${weatherRows} with weather context.`;
    }
    return system.snapshot || "No tracked sample yet.";
  }
  if (system.progressionLogic.length === 0) {
    if (metrics.qualifiedGames > 0) {
      const moneylineRows = system.records.filter((record) => record.currentMoneyline != null).length;
      return `${metrics.qualifiedGames} qualifier${metrics.qualifiedGames === 1 ? "" : "s"} stored${moneylineRows ? `, ${moneylineRows} with live moneyline context` : ""}.`;
    }
    return system.snapshot || "No tracked sample yet.";
  }
  if (metrics.completedSequences > 0 && metrics.sequenceWinRate != null) {
    return `${(metrics.sequenceWinRate * 100).toFixed(1)}% sequence win rate across ${metrics.completedSequences} settled sequence${metrics.completedSequences === 1 ? "" : "s"}.`;
  }
  if (metrics.qualifiedGames > 0) {
    return `${metrics.qualifiedGames} qualifier${metrics.qualifiedGames === 1 ? "" : "s"} stored${metrics.trackableGames ? `, ${metrics.trackableGames} with full quarter-line coverage` : ""}.`;
  }
  return system.snapshot || "No tracked sample yet.";
}

function getTrackableSystems(data: SystemsTrackingData) {
  return data.systems.filter((system) => system.trackabilityBucket === "trackable_now" && Boolean(SYSTEM_TRACKERS[system.id]));
}

function summarizeLineupStatus(status?: string | null) {
  if (!status) return "unconfirmed";
  return status;
}

function summarizeWeather(weather: any) {
  if (!weather) return "Weather context unavailable.";
  if (weather.note && (!weather.temperatureF && !weather.windSpeedMph)) return weather.note;
  const bits: string[] = [];
  if (typeof weather.temperatureF === "number") bits.push(`${Math.round(weather.temperatureF)}°F`);
  if (typeof weather.windSpeedMph === "number") bits.push(`${Math.round(weather.windSpeedMph)} mph wind`);
  if (typeof weather.windDirectionLabel === "string" && weather.windDirectionLabel) bits.push(weather.windDirectionLabel);
  if (typeof weather.condition === "string" && weather.condition) bits.push(weather.condition);
  return bits.length ? bits.join(" • ") : (weather.note || "Weather context unavailable.");
}

function summarizeParkFactor(parkFactor: any) {
  if (!parkFactor || parkFactor.status === "missing" || !parkFactor.metrics) return "Park factor missing from current seed.";
  const runs = typeof parkFactor.metrics.runs === "number" ? parkFactor.metrics.runs : null;
  const hr = typeof parkFactor.metrics.homeRuns === "number" ? parkFactor.metrics.homeRuns : null;
  const bits = [
    runs != null ? `Runs ${runs}` : null,
    hr != null ? `HR ${hr}` : null,
  ].filter(Boolean);
  return bits.length ? `${parkFactor.venueName}: ${bits.join(" • ")}` : `${parkFactor.venueName}: factor seed loaded.`;
}

function summarizeBullpen(team: any) {
  if (!team?.bullpen) return "Bullpen context unavailable.";
  return team.bullpen.summary || "Bullpen workload context loaded.";
}

function summarizeMarketAvailability(game: any) {
  const bits: string[] = [];
  if (typeof game?.bestMoneyline?.team === "string" && typeof game?.bestMoneyline?.price === "number") {
    bits.push(`${game.bestMoneyline.team} ML ${game.bestMoneyline.price > 0 ? "+" : ""}${game.bestMoneyline.price}`);
  }
  if (typeof game?.bestTotalLine === "number") bits.push(`Total ${game.bestTotalLine}`);
  if (typeof game?.markets?.f5?.completeness === "string") bits.push(`F5 ${game.markets.f5.completeness}`);
  return bits.length ? bits.join(" • ") : "Posted market context unavailable.";
}

async function refreshGooseSystemData(data: SystemsTrackingData, options: RefreshGooseOptions = {}): Promise<TrackedSystem> {
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
  return system;
}

async function refreshTheBlowoutSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getTheBlowoutSystem(data);
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  const freshRecords = await getTheBlowoutQualifiers(targetDate, options.daysAhead ?? 2);

  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup) || left.id.localeCompare(right.id);
  });
  applySimpleWatchlistReadiness(system);
  return system;
}

async function refreshHotTeamsMatchupSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getHotTeamsMatchupSystem(data);
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  const freshRecords = await getHotTeamsMatchupQualifiers(targetDate, options.daysAhead ?? 2);

  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup);
  });
  applySimpleWatchlistReadiness(system);
  return system;
}

async function buildFalconsQualifierRecord(input: {
  gameId: string;
  oddsEventId?: string;
  gameDate: string;
  matchup: string;
  roadTeam: string;
  homeTeam: string;
  starterName: string;
  starterEra: number | null;
  currentMoneyline: number;
  priorGameDate: string;
  inningsPitched: number;
  earnedRuns: number;
  hitsAllowed: number;
  moneylineBook?: string | null;
  lineupStatus?: string | null;
  weatherSummary?: string | null;
  parkFactorSummary?: string | null;
  bullpenSummary?: string | null;
  f5Summary?: string | null;
}) {
  const priorStats = {
    inningsPitched: input.inningsPitched,
    earnedRuns: input.earnedRuns,
    hitsAllowed: input.hitsAllowed,
  };
  const pummeledReasons = buildPummeledReasons(priorStats);
  const notes = [
    `Alert only — not an official pick.`,
    `Prior start ${input.priorGameDate}: ${formatPitchingSummary(priorStats)}${pummeledReasons.length ? ` (${pummeledReasons.join(", ")})` : ""}.`,
    input.starterEra != null ? `Listed ERA ${input.starterEra.toFixed(2)}.` : "Listed ERA unavailable from probable-starter feed.",
    `Current moneyline ${input.currentMoneyline > 0 ? "+" : ""}${input.currentMoneyline}${input.moneylineBook ? ` (${input.moneylineBook})` : ""}.`,
    input.lineupStatus || "Lineup status unavailable.",
    input.weatherSummary || "Weather context unavailable.",
    input.parkFactorSummary || "Park-factor context unavailable.",
    input.bullpenSummary || "Bullpen context unavailable.",
    input.f5Summary || "F5 market context unavailable.",
  ];

  return normalizeRecord({
    id: `falcons-fight-pummeled-pitchers:${input.gameId}:${slugify(input.starterName)}`,
    gameId: input.gameId,
    oddsEventId: input.oddsEventId ?? null,
    gameDate: input.gameDate,
    matchup: input.matchup,
    roadTeam: input.roadTeam,
    homeTeam: input.homeTeam,
    recordKind: "qualifier",
    marketType: "moneyline",
    alertLabel: "Tracked qualifier / system alert",
    starterName: input.starterName,
    starterEra: input.starterEra,
    currentMoneyline: input.currentMoneyline,
    priorGameDate: input.priorGameDate,
    priorStartSummary: formatPitchingSummary(priorStats),
    lineupStatus: input.lineupStatus ?? null,
    weatherSummary: input.weatherSummary ?? null,
    parkFactorSummary: input.parkFactorSummary ?? null,
    bullpenSummary: input.bullpenSummary ?? null,
    f5Summary: input.f5Summary ?? null,
    source: "MLB Stats API probable starters + pitching game logs + aggregated odds + MLB enrichment rails",
    notes: notes.join(" • "),
    lastSyncedAt: new Date().toISOString(),
  });
}

async function refreshTonysHotBatsSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getTrackedSystem(data, TONYS_HOT_BATS_SYSTEM_ID, () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(TONYS_HOT_BATS_SYSTEM_ID)!));
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const board = await getMLBEnrichmentBoard(targetDate);

  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  const freshRecords: SystemTrackingRecord[] = (board.games ?? []).map((game: any) => {
    const lineupStatuses = [game?.lineups?.away?.status, game?.lineups?.home?.status].filter(Boolean);
    const officialCount = lineupStatuses.filter((status: string) => status === "official").length;
    const partialCount = lineupStatuses.filter((status: string) => status === "partial").length;
    const lineupStatus = officialCount === 2
      ? "Both lineups official in MLB live feed."
      : officialCount > 0
        ? `${officialCount} lineup official, ${partialCount} partial, remainder unconfirmed.`
        : partialCount > 0
          ? `${partialCount} lineup partial, remainder unconfirmed.`
          : "Both lineups still unconfirmed in MLB live feed.";

    const weatherSummary = summarizeWeather(game?.weather?.forecast ? {
      ...game.weather.forecast,
      note: game?.weather?.note,
      condition: game?.weather?.forecast?.condition,
    } : game?.weather);
    const parkFactorSummary = summarizeParkFactor(game?.parkFactor);
    const bullpenSummary = [
      `${game?.matchup?.away?.abbreviation || "Away"}: ${summarizeBullpen(game?.matchup?.away)}`,
      `${game?.matchup?.home?.abbreviation || "Home"}: ${summarizeBullpen(game?.matchup?.home)}`,
    ].join(" • ");
    const marketAvailability = summarizeMarketAvailability(game);
    const currentMoneyline = typeof game?.bestMoneyline?.price === "number" ? game.bestMoneyline.price : null;
    const totalLine = typeof game?.bestTotalLine === "number" ? game.bestTotalLine : null;
    const f5Summary = typeof game?.markets?.f5?.completeness === "string"
      ? `F5 ${game.markets.f5.completeness}${Array.isArray(game?.markets?.f5?.supportedMarkets) && game.markets.f5.supportedMarkets.length ? ` (${game.markets.f5.supportedMarkets.join(", ")})` : ""}.`
      : "F5 market context unavailable.";

    const notes = [
      "Foundation row only — not an official pick.",
      `Lineups: ${lineupStatus}`,
      `Weather: ${weatherSummary}`,
      `Park: ${parkFactorSummary}`,
      `Bullpen: ${bullpenSummary}`,
      `Markets: ${marketAvailability}`,
      `Scope: ${board.scope?.lineups || "Lineup status is conservative."}`,
    ].join(" • ");

    return normalizeRecord({
      id: `${TONYS_HOT_BATS_SYSTEM_ID}:${game.gameId}`,
      gameId: game.gameId,
      oddsEventId: game?.oddsEventId ?? null,
      gameDate: game.date,
      matchup: `${game?.matchup?.away?.abbreviation || "AWAY"} @ ${game?.matchup?.home?.abbreviation || "HOME"}`,
      roadTeam: game?.matchup?.away?.abbreviation || "AWAY",
      homeTeam: game?.matchup?.home?.abbreviation || "HOME",
      recordKind: "qualifier",
      marketType: totalLine != null ? "context-total-board" : "context-board",
      alertLabel: "Context foundation / not a pick",
      currentMoneyline,
      lineupStatus,
      weatherSummary,
      parkFactorSummary,
      bullpenSummary,
      f5Summary,
      marketAvailability,
      source: "MLB enrichment board (lineups + weather + park factors + bullpen + posted markets)",
      notes,
      lastSyncedAt: new Date().toISOString(),
    });
  });

  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup);
  });
  applyTonysHotBatsReadiness(system);
  return system;
}

async function refreshFalconsFightPummeledPitchersSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getFalconsFightPummeledPitchersSystem(data);
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const [schedule, oddsEvents, enrichmentBoard] = await Promise.all([
    getMLBSchedule(options.daysAhead ?? 1),
    getMLBOdds(),
    getMLBEnrichmentBoard(targetDate),
  ]);

  const targetGames = schedule.filter((game) => game.date === targetDate && game.status !== "Final");
  const enrichmentByGameId = new Map((enrichmentBoard.games ?? []).map((game) => [game.gameId, game]));
  const freshRecords: SystemTrackingRecord[] = [];

  for (const game of targetGames) {
    const event = findMLBOddsForGame(oddsEvents, game.homeTeam.abbreviation, game.awayTeam.abbreviation);
    const enrichment = enrichmentByGameId.get(game.id);
    const starterCandidates = [
      {
        side: "away" as const,
        teamAbbrev: game.awayTeam.abbreviation,
        teamName: game.awayTeam.fullName,
        starter: game.awayTeam.probablePitcher,
      },
      {
        side: "home" as const,
        teamAbbrev: game.homeTeam.abbreviation,
        teamName: game.homeTeam.fullName,
        starter: game.homeTeam.probablePitcher,
      },
    ];

    for (const candidate of starterCandidates) {
      const starter = candidate.starter;
      if (!starter?.id || !starter.name) continue;
      if (starter.era != null && starter.era > 4.5) continue;

      const lineupSide = candidate.side === "away" ? enrichment?.lineups?.away : enrichment?.lineups?.home;
      const bullpenSide = candidate.side === "away" ? enrichment?.matchup?.away?.bullpen : enrichment?.matchup?.home?.bullpen;
      const lineupStatus = lineupSide
        ? `${candidate.teamAbbrev} lineup ${lineupSide.status}${lineupSide.players.length ? ` (${lineupSide.players.length}/9 hitters exposed)` : ""}${lineupSide.note ? ` — ${lineupSide.note}` : ""}.`
        : "Lineup rail unavailable for this game.";
      const weatherSummary = enrichment?.weather
        ? enrichment.weather.status === "available"
          ? `${enrichment.weather.venue?.name || game.venue?.name || game.homeTeam.fullName}: ${enrichment.weather.forecast?.temperatureF ?? "—"}°F, wind ${enrichment.weather.forecast?.windSpeedMph ?? "—"} mph, precip ${enrichment.weather.forecast?.precipitationProbability ?? "—"}%${enrichment.weather.note ? ` — ${enrichment.weather.note}` : ""}.`
          : enrichment.weather.status === "indoor"
            ? enrichment.weather.note || "Indoor/retractable venue context only."
            : enrichment.weather.note || "Weather unavailable."
        : "Weather rail unavailable for this game.";
      const parkFactorSummary = enrichment?.parkFactor
        ? enrichment.parkFactor.status === "available"
          ? enrichment.parkFactor.summary || `${game.homeTeam.abbreviation} park factor available.`
          : enrichment.parkFactor.note || "Park factor unavailable."
        : "Park-factor rail unavailable for this game.";
      const bullpenSummary = bullpenSide
        ? `${candidate.teamAbbrev} bullpen ${bullpenSide.level} fatigue: ${bullpenSide.summary}`
        : `${candidate.teamAbbrev} bullpen fatigue unavailable.`;
      const f5Summary = enrichment?.markets?.f5
        ? enrichment.markets.f5.available
          ? `F5 ${enrichment.markets.f5.supportedMarkets.join(" + ")} available (${enrichment.markets.f5.completeness}).`
          : `F5 not posted: ${enrichment.markets.f5.source.notes.join(" ")}`
        : "F5 rail unavailable for this game.";

      const moneyline = event
        ? getBestOdds(event, "h2h", candidate.side === "away" ? event.away_team : event.home_team)
        : null;
      const currentMoneyline = moneyline?.odds ?? null;
      if (currentMoneyline == null || currentMoneyline < -140 || currentMoneyline > 125) continue;

      const logs = await getMLBPlayerGameLog(Number(starter.id), Number(targetDate.slice(0, 4)), "pitching");
      const priorStart = logs.find((log) => log.gameDate && log.gameDate < targetDate && daysBetween(log.gameDate, targetDate) <= 10);
      if (!priorStart) continue;
      if (!isPummeledStart(priorStart)) continue;

      freshRecords.push(await buildFalconsQualifierRecord({
        gameId: game.id,
        oddsEventId: game.oddsEventId || event?.id,
        gameDate: game.date,
        matchup: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        roadTeam: game.awayTeam.abbreviation,
        homeTeam: game.homeTeam.abbreviation,
        starterName: starter.name,
        starterEra: starter.era ?? null,
        currentMoneyline,
        priorGameDate: priorStart.gameDate,
        inningsPitched: priorStart.inningsPitched,
        earnedRuns: priorStart.earnedRuns,
        hitsAllowed: priorStart.hitsAllowed,
        moneylineBook: moneyline?.book,
        lineupStatus,
        weatherSummary,
        parkFactorSummary,
        bullpenSummary,
        f5Summary,
      }));
    }
  }

  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup) || (left.starterName || "").localeCompare(right.starterName || "");
  });
  applyFalconsFightPummeledPitchersReadiness(system);
  return system;
}

export async function refreshTrackedSystem(systemId: string, options: SystemRefreshOptions = {}): Promise<TrackedSystem | null> {
  const tracker = SYSTEM_TRACKERS[systemId];
  if (!tracker) return null;

  const data = await readSystemsTrackingData();
  const system = await tracker.refresh(data, options);
  data.updatedAt = new Date().toISOString();
  await writeSystemsTrackingData(data);
  return system;
}

export async function refreshTrackableSystems(options: SystemRefreshOptions = {}): Promise<TrackedSystem[]> {
  const data = await readSystemsTrackingData();
  const systems = getTrackableSystems(data);
  const refreshed: TrackedSystem[] = [];

  for (const system of systems) {
    const tracker = SYSTEM_TRACKERS[system.id];
    if (!tracker) continue;
    refreshed.push(await tracker.refresh(data, options));
  }

  if (refreshed.length > 0) {
    data.updatedAt = new Date().toISOString();
    await writeSystemsTrackingData(data);
  }

  return refreshed;
}

export async function refreshTodayGooseSystem(options: RefreshGooseOptions = {}): Promise<TrackedSystem> {
  const system = await refreshTrackedSystem(NBA_GOOSE_SYSTEM_ID, options);
  if (!system) {
    throw new Error(`No tracker registered for ${NBA_GOOSE_SYSTEM_ID}`);
  }
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
