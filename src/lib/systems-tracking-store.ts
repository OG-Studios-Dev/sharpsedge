import { promises as fs } from "fs";
import path from "path";
import type { AggregatedOdds } from "@/lib/books/types";
import { getMLBPlayerGameLog, getMLBSchedule, type MLBPlayerGameLog } from "@/lib/mlb-api";
import { getMLBEnrichmentBoard } from "@/lib/mlb-enrichment";
import { findMLBOddsForGame, getMLBOdds } from "@/lib/mlb-odds";
import { getNBAGameSummary, getNBASchedule, getNBAStandings, getRecentNBAGames, type NBAGame, type NBATeamStanding } from "@/lib/nba-api";
import { getNBAHandleBoard, findHandleSplitsForGame, qualifiesHomeUnderdogMajorityHandle, qualifiesHomeSuperMajorityHandleCloseGame, type NBAHandleSplits } from "@/lib/nba-handle";
import { getBettingSplits, findGameSplits, getMarketSplits } from "@/lib/betting-splits";
import { getMarketHistoryRail, type MarketHistoryRail } from "@/lib/market-snapshot-history";
import { getBestOdds } from "@/lib/odds-api";
import { getAggregatedOddsForSport } from "@/lib/odds-aggregator";
import { getTodayNHLContextBoard, type NHLContextBoardGame, type NHLContextTeamBoardEntry } from "@/lib/nhl-context";
import { upsertSystemQualifiers, loadSystemQualifiers, getSystemPerformanceFromDb, type DbSystemQualifier, type DbSystemPerformanceSummary } from "@/lib/system-qualifiers-db";

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
export type SystemQualifierOutcome = "win" | "loss" | "push" | "pending" | "ungradeable" | "not_applicable";
export type SystemQualifierSettlementStatus = "settled" | "pending" | "ungradeable" | "not_applicable";

export type SystemQualificationLogEntry = {
  id: string;
  systemId: string;
  systemSlug: string;
  systemName: string;
  gameDate: string;
  loggedAt: string;
  qualifierId: string;
  recordKind: "qualifier" | "alert" | "progression";
  matchup: string;
  roadTeam: string;
  homeTeam: string;
  qualifiedTeam?: string | null;
  opponentTeam?: string | null;
  marketType?: string | null;
  actionLabel?: string | null;
  actionSide?: string | null;
  flatStakeUnits: number;
  settlementStatus: SystemQualifierSettlementStatus;
  outcome: SystemQualifierOutcome;
  netUnits: number | null;
  source?: string;
  notes?: string;
  recordSnapshot: SystemTrackingRecord;
  settledAt?: string | null;
  lastSyncedAt?: string;
};

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
  espnEventId?: string | null;
  gameDate: string;
  sourceHealthStatus?: "healthy" | "stale" | "degraded" | "missing" | null;
  freshnessSummary?: string | null;
  matchup: string;
  roadTeam: string;
  homeTeam: string;
  recordKind?: "progression" | "qualifier" | "alert" | null;
  marketType?: string | null;
  alertLabel?: string | null;
  starterName?: string | null;
  starterEra?: number | null;
  currentMoneyline?: number | null;
  falconsScore?: number | null;
  falconsScoreLabel?: string | null;
  falconsScoreComponents?: string[] | null;
  priorGameDate?: string | null;
  priorStartSummary?: string | null;
  lineupStatus?: string | null;
  weatherSummary?: string | null;
  parkFactorSummary?: string | null;
  bullpenSummary?: string | null;
  f5Summary?: string | null;
  marketAvailability?: string | null;
  qualifiedTeam?: string | null;
  opponentTeam?: string | null;
  xGoalsPercentage?: number | null;
  opponentXGoalsPercentage?: number | null;
  urgencyTier?: string | null;
  fatigueScore?: number | null;
  opponentFatigueScore?: number | null;
  goalieStatus?: string | null;
  opponentGoalieStatus?: string | null;
  totalLine?: number | null;
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
  qualificationLog: SystemQualificationLogEntry[];
};

export type SystemPerformanceSummary = {
  qualifiersLogged: number;
  gradedQualifiers: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  ungradeable: number;
  record: string;
  winPct: number | null;
  flatNetUnits: number | null;
  actionable: boolean;
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
  performance: SystemPerformanceSummary;
};

type QuarterScores = {
  firstQuarterRoadScore: number | null;
  firstQuarterHomeScore: number | null;
  thirdQuarterRoadScore: number | null;
  thirdQuarterHomeScore: number | null;
  gameCompleted: boolean;
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
const SWAGGY_STRETCH_DRIVE_SYSTEM_ID = "swaggy-stretch-drive";
const ROBBIES_RIPPER_FAST_5_SYSTEM_ID = "robbies-ripper-fast-5";
const BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID = "bigcat-bonaza-puckluck";
const BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID = "big-cats-nba-1q-under";
const COACH_NO_REST_SYSTEM_ID = "coach-no-rest";
const NBA_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID = "nba-home-dog-majority-handle";
const NBA_HOME_SUPER_MAJORITY_CLOSE_GAME_SYSTEM_ID = "nba-home-super-majority-close-game";
const FAT_TONYS_FADE_SYSTEM_ID = "fat-tonys-fade";
const NHL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID = "nhl-home-dog-majority-handle";
const NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID = "nhl-under-majority-handle";
const MLB_HOME_MAJORITY_HANDLE_SYSTEM_ID = "mlb-home-majority-handle";
const MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID = "mlb-under-majority-handle";
const NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID = "nfl-home-dog-majority-handle";
const GOOSE_SETTLEMENT_BACKFILL_LOOKBACK_DAYS = 7;

export const SYSTEM_LEAGUES = ["All", "NBA", "NHL", "MLB", "NFL"] as const;

function defaultGooseSystem(): TrackedSystem {
  return {
    id: NBA_GOOSE_SYSTEM_ID,
    slug: "nba-goose-system",
    name: "Mattys 1Q Chase NBA",
    league: "NBA",
    category: "native",
    owner: "Goosalytics Lab",
    status: "awaiting_data",
    trackabilityBucket: "trackable_now",
    summary:
      "Road favorite quarter ATS chase: 1Q first, then 3Q only if the opener loses.",
    snapshot: "🟢 FIRING | NBA regular season active. Road favorites qualifying daily.",
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
      "If lines or quarter scores are missing, the row stays pending before tip or becomes explicitly ungradeable after a final rather than being backfilled with guesses.",
    ],
    records: [],
  };
}

function seededCatalog(): TrackedSystem[] {
  return [
    defaultGooseSystem(),
    {
      id: BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID,
      slug: "big-cats-nba-1q-under",
      name: "Big Cats NBA 1Q Under",
      league: "NBA",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "NBA first-quarter under system built from historical total-band validation. Fires when full-game total sits in the 210 to 225 range.",
      snapshot: "🟢 LIVE | NBA totals board scanned daily for 210 to 225 full-game totals.",
      definition:
        "Flag NBA games with a posted full-game total between 210 and 225, then target the first-quarter under using a provisional threshold of 28% of the full-game total until exact sportsbook 1Q totals are captured live.",
      qualifierRules: [
        "League must be NBA.",
        "A posted full-game total is required.",
        "Full-game total must fall between 210 and 225 inclusive.",
        "Qualifier is a first-quarter under candidate, with provisional target line estimated at 28% of the full-game total.",
      ],
      progressionLogic: [],
      thesis:
        "Mid-range NBA totals have produced strong first-quarter under results in historical proxy testing. This system stays narrow and only fires inside the validated total band.",
      sourceNotes: [
        {
          label: "Historical proxy backtest",
          detail: "Validated on 10 years of NBA archive data using first-quarter scoring versus a 28% full-game-total proxy.",
        },
      ],
      automationStatusLabel: "Live qualifier rail",
      automationStatusDetail: "Refresh scans the NBA odds board daily and stores candidates when the posted full-game total lands in the validated 210 to 225 band.",
      dataRequirements: [
        { label: "NBA full-game total", status: "ready", detail: "Pulled from aggregated NBA odds board." },
        { label: "Exact sportsbook 1Q total", status: "pending", detail: "Current rail uses a 28% proxy until direct 1Q total capture is added." },
      ],
      unlockNotes: [
        "Add direct sportsbook 1Q total capture so the proxy can be replaced with exact live market lines.",
      ],
      trackingNotes: [
        "This is a live qualifier rail, but grading should remain conservative until exact 1Q totals are captured from books.",
      ],
      records: [],
    },
    {
      id: "beefs-bounce-back",
      slug: "beefs-bounce-back-big-ats-loss",
      name: "The Centurion Comeback",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_verification",
      trackabilityBucket: "blocked_missing_data",
      summary: "NBA revenge-cover angle for teams coming off a brutal ATS miss, cataloged honestly as blocked until prior-game line history is wired in.",
      snapshot: "🔴 BLOCKED | Prior-game ATS result feed not connected. Cannot qualify.",
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
      name: "Beefs Blowout",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "NBA blowout-reaction concept is cataloged but OFF until we define a real bet direction and pricing rule.",
      snapshot: "🔴 OFF | Bet direction unresolved. Not live until rulebook is defined.",
      definition:
        "Track NBA teams whose most recent game within the last 3 days was a blowout win or loss of 18+ points, then log the next matchup when the spread stays within a manageable band and the opponent clears a basic competence filter.",
      qualifierRules: [
        "League must be NBA.",
        "Qualified team's most recent completed game must have ended within the last 3 days.",
        "That most recent game margin must be at least 18 points either for or against the qualified team.",
        "Next-game spread from the qualified team perspective must have absolute value <= 6.5.",
        "Opponent season win percentage must be >= .450.",
        "Direction is unresolved, so this system stays off until a real picks rule is defined.",
      ],
      progressionLogic: [],
      thesis:
        "Huge recent results can distort the next-game narrative, but without a settled bet-direction rule this system should stay off rather than pretend to be live.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged only. Bet direction after a blowout is still unresolved, so this is not a live system yet.",
        },
      ],
      automationStatusLabel: "Off pending rulebook",
      automationStatusDetail: "NBA data rails exist, but the system remains off until bet direction and grading logic are defined honestly.",
      dataRequirements: [
        { label: "Recent NBA results", status: "ready", detail: "Used to confirm the most recent game margin and recency window." },
        { label: "Current full-game spread", status: "ready", detail: "Used to confirm the next-game spread stays within +/-6.5 from the qualified team perspective." },
        { label: "Opponent season win percentage", status: "ready", detail: "Available as a guardrail once the live rulebook exists." },
        { label: "Bet-direction rulebook", status: "pending", detail: "Still unresolved. System stays off until this is defined." },
      ],
      unlockNotes: [
        "Bet-direction logic must be defined before this can turn on.",
        "Historical close-versus-margin work would strengthen the blowout trigger later.",
      ],
      trackingNotes: [
        "This concept should not surface as live until it has a directional rule and grading path.",
        "Spread will be recorded from the qualifying team perspective once the live rulebook exists.",
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
      summary: "NBA hot-teams collision concept is OFF until we define whether the bet is side, total, or pass.",
      snapshot: "🔴 OFF | Direction unresolved. Not live until the rulebook is defined.",
      definition:
        "Track NBA matchups where both teams have won at least 4 of their last 5 completed games, both own season win percentages of .550 or better, the spread stays within +/-5.5, and the total is posted.",
      qualifierRules: [
        "League must be NBA.",
        "Both teams must have won at least 4 of their last 5 completed games.",
        "Both teams must have season win percentages of .550 or better.",
        "Current full-game spread must be within +/-5.5.",
        "A game total must be available.",
        "Direction is unresolved, so this system stays off until a real picks rule is defined.",
      ],
      progressionLogic: [],
      thesis:
        "When two genuinely hot teams collide, the market can struggle to price whether form carries, cancels out, or spills into the total. Until that direction is proven, this system should stay off.",
      sourceNotes: [
        {
          label: "Internal concept",
          detail: "Cataloged only. The matchup can be detected, but this is not a live system until the direction is solved.",
        },
      ],
      automationStatusLabel: "Off pending rulebook",
      automationStatusDetail: "NBA data rails exist, but this system remains off until side/total/pass logic is defined honestly.",
      dataRequirements: [
        { label: "Recent last-5 results", status: "ready", detail: "Used to confirm both teams are at least 4-1 in their last five completed games." },
        { label: "Season win percentages", status: "ready", detail: "Used to confirm both teams clear the .550 quality threshold." },
        { label: "Current spread and total", status: "ready", detail: "Used to confirm the spread band and that a posted total exists." },
        { label: "Bet-direction rulebook", status: "pending", detail: "Still unresolved. System stays off until this is defined." },
      ],
      unlockNotes: [
        "Need proof on whether this is a side, total, or pass framework before it can turn on.",
      ],
      trackingNotes: [
        "Rows are stored once per game to avoid duplicate qualifiers from both team perspectives.",
        "The total line is noted in row metadata because totals availability is part of the v1 qualifier.",
      ],
      records: [],
    },
    {
      id: FAT_TONYS_FADE_SYSTEM_ID,
      slug: "fat-tonys-road-chalk",
      name: "Fat Tony's Road Chalk",
      league: "NBA",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "tracking",
      trackabilityBucket: "trackable_now",
      summary: "Contrarian NBA fade: public piles one-sided on spread, line inflated in that direction, fade the inflated side. Both rails live — Action Network splits + Supabase-backed line-move history.",
      snapshot: "🟢 BOTH RAILS LIVE | Action Network splits + Supabase market-snapshot history wired. Fires when spread public >= 60% bets and line moved same direction (public inflation confirmed).",
      definition:
        "Fade NBA spread sides where public bets >= 60% on one side AND the line has moved in the same direction (market inflated by public action, not sharp counter). Back the contrarian side only when both conditions are confirmed.",
      qualifierRules: [
        "Spread bets% >= 60% on one side (primary source DK; FD fallback).",
        "Line-move history required: spread line must have moved >= 0.5 points in the SAME direction as the public side (confirmation of public inflation, not sharp reversal).",
        "Line-move source must have >= 2 Supabase snapshots for the game today (otherwise skip — no history = no qualifier).",
        "Faded side's best spread odds must be between -135 and +135 (not a blowout line or massive dog).",
        "Qualifier alert only — not a pick. No historical win-rate claimed.",
      ],
      progressionLogic: [],
      thesis:
        "A public-fade angle is only real if the public-position input is real AND line movement confirms inflation. Both rails are now live. This system fires qualifier alerts, not picks.",
      sourceNotes: [
        {
          label: "Action Network (DK primary + FD comparison)",
          detail: "Live as of 2026-03-29. Ingested via betting-splits.ts. Provides bets% and handle% per game/market for NBA, NHL, MLB, NFL.",
        },
        {
          label: "Line-move history — LIVE via Supabase",
          detail: "market-snapshot-history.ts now reads from Supabase market_snapshot_prices when filesystem has < 2 snapshots. Supabase gets hourly writes from the market-snapshot cron. Wired as of 2026-03-29.",
        },
      ],
      automationStatusLabel: "Both rails live — qualifier builder active",
      automationStatusDetail: "Public betting splits (Action Network DK+FD) and line-move history (Supabase market_snapshot_prices) both connected. refreshFuchsFadeSystemData fires daily, stores qualifier rows when spread public >= 60% + line moved same direction >= 0.5pt.",
      dataRequirements: [
        { label: "Public betting handle splits", status: "ready", detail: "Action Network DK (primary) + FD (comparison/fallback). Ingested via betting-splits.ts. Data confirmed live 2026-03-29." },
        { label: "Line-move history", status: "ready", detail: "market-snapshot-history.ts now reads Supabase market_snapshot_prices as primary fallback when filesystem has < 2 snapshots. Wired 2026-03-29." },
      ],
      unlockNotes: [
        "✅ Public betting handle splits: RESOLVED — Action Network DK+FD rail live.",
        "✅ Line-move history: RESOLVED — Supabase fallback wired in market-snapshot-history.ts (2026-03-29).",
      ],
      trackingNotes: [
        "Do not fake 'public is on X' claims without an actual source.",
        "Qualifier requires BOTH splits >= 60% bets AND line movement >= 0.5pt same direction — no partial fires.",
        "Line-move source field on MarketHistoryRail now reports 'supabase' or 'filesystem' for auditability.",
        "No claimed win rate. Watchlist only until sufficient graded rows accumulate.",
      ],
      records: [],
    },
    {
      id: COACH_NO_REST_SYSTEM_ID,
      slug: "coach-no-rest",
      name: "Coach, No Rest?",
      league: "NHL",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "NHL rest-disparity system. Backs the better-rested side when one team plays on zero rest (back-to-back) and the opponent has 2+ days off. Daily-trackable from NHL schedule data.",
      snapshot: "🟢 REST DISPARITY RAIL LIVE | Fires daily when B2B vs rested matchups exist on the NHL slate.",
      definition:
        "Flag NHL games where one team is playing on the second night of a back-to-back (0 rest days) while the opponent has had at least 2 days of rest. Back the rested side with price discipline — market underprices rest edges in the NHL because scheduling fatigue accumulates on rosters, depth lines, and goalies.",
      qualifierRules: [
        "The disadvantaged side must be on a back-to-back: 0 days rest (derived.rest.isBackToBack === true).",
        "The advantaged side must have at least 2 days of rest (derived.rest.restDays >= 2).",
        "The advantaged (rested) side is the qualifier. Alert direction: back the rested team.",
        "Goalie context is required for the B2B team: flag when B2B team is playing a backup or starter with compromised status.",
        "Price discipline: do not store rows where the rested side's best moneyline is below -175 (pricing already absorbed) or above +170 (too large an underdog to flag as a pure rest angle).",
        "Fatigue gap must exceed 15 points (derived.fatigueScore of B2B side minus rested side >= 15) to avoid noise from light-schedule games.",
      ],
      progressionLogic: [],
      thesis:
        "NHL back-to-back games create measurable depth and goalie fatigue disadvantages. When the rest gap is 2+ days, the market consistently underprices the advantage — especially late in the season when depth attrition compounds. This system is a rule-based screener, not a win-rate claim.",
      sourceNotes: [
        {
          label: "Native qualifier tracker",
          detail: "Coach, No Rest? is a Goosalytics-owned NHL rest-disparity screener built from NHL schedule data, derived fatigue context, and aggregated moneylines. Rest days and B2B status are derived from NHL API schedule via nhl-context.",
        },
        {
          label: "Honesty policy",
          detail: "Rows are qualifier alerts only. No claimed win rate or historical edge implied. Missing goalie status, odd pricing, or ambiguous rest context stay unresolved rather than guessed.",
        },
      ],
      automationStatusLabel: "Live rest-disparity qualifier board",
      automationStatusDetail: "Daily refresh scans the NHL context board for B2B vs rested matchups. Stores qualifier rows when rest disparity >= 2 days, fatigue gap >= 15 points, goalie context is captured, and price is within discipline band.",
      dataRequirements: [
        { label: "NHL schedule / rest rail", status: "ready", detail: "NHL API schedule provides game dates. derived.rest.restDays and derived.rest.isBackToBack computed per team per game via nhl-context." },
        { label: "Fatigue score rail", status: "ready", detail: "derived.fatigueScore computed from rest, travel, and schedule density per team via nhl-context." },
        { label: "Goalie context rail", status: "ready", detail: "Starter status (confirmed/probable/backup) sourced from NHL API via nhl-context." },
        { label: "Aggregated NHL moneylines", status: "ready", detail: "Best-available NHL moneylines per team from aggregated odds API." },
        { label: "Historical outcome validation", status: "pending", detail: "No settled record history yet. Need outcome data before any win-rate claim can be made." },
      ],
      unlockNotes: [
        "Rest rail is live — daily qualification can fire.",
        "Historical outcome validation still required before win-rate claims.",
      ],
      trackingNotes: [
        "Rows represent B2B vs rested qualifier alerts, not bets or picks.",
        "Slug 'coach-no-rest' is canonical. Old 'coaches-fuming-scoring-drought' system is retired.",
        "Market pricing context stored with each row but price band enforced at storage time, not grading time.",
      ],
      records: [],
    },
    {
      id: "swaggy-stretch-drive",
      slug: "swaggy-stretch-drive",
      name: "Swaggy's Stretch Drive",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "Late-season NHL qualifier tracker now uses explicit urgency, goalie, fatigue, MoneyPuck, and price gates. Alerts only - not a claimed mature edge.",
      snapshot: "🟢 FIRING | Late NHL regular season. Playoff urgency race is live — urgency gates active.",
      definition:
        "Look for late-season NHL teams with real standings urgency, acceptable goalie/fatigue posture, and enough underlying profile support that a moderate moneyline can still be justified without blindly paying for a 'must-win' story.",
      qualifierRules: [
        "Urgency is mandatory: target side must carry derived playoff-pressure tier high, while the opponent cannot also rate high urgency.",
        "Underlying support is mandatory: target side needs sourced MoneyPuck xGoalsPercentage of at least 0.515 and at least a 0.02 edge over the opponent.",
        "Goalie sanity check is mandatory: target starter must be confirmed or probable and not flagged as a backup; opponent missing a starter or using a backup counts as support, but urgency alone is never enough.",
        "Fatigue must be reasonable: target side cannot sit in the extreme fatigue band and cannot trail the opponent by a major fatigue gap.",
        "Price discipline is mandatory: only store rows when the best available moneyline for the qualifying side is between -145 and +115.",
        "Stored rows are qualifier alerts only. No auto-published picks, no synthetic backtest, and no fabricated settled history.",
      ],
      progressionLogic: [],
      thesis:
        "Urgency can matter late in the NHL season, but only when it is paired with real team-strength support and a price that has not fully absorbed the playoff-race narrative. Swaggy v1 is intentionally narrow: it screens for live spots worth inspection, not a finished betting model.",
      sourceNotes: [
        {
          label: "Native qualifier tracker",
          detail: "Swaggy is now rule-gated from internal qualifier logic using sourced odds, MoneyPuck snapshot data, and NHL API goalie/schedule/standings inputs.",
        },
        {
          label: "Sourced vs derived",
          detail: "MoneyPuck, goalie status, standings, and official-team news remain sourced. Rest, travel, fatigue, urgency labels, and final qualifier scoring are derived heuristics layered on top.",
        },
      ],
      automationStatusLabel: "Live qualifier tracking + price discipline",
      automationStatusDetail: "Refresh now scans the live NHL context board plus aggregated NHL moneylines and stores only conservative Swaggy qualifier rows that pass explicit urgency, xG, goalie, fatigue, and price gates.",
      dataRequirements: [
        { label: "Standings urgency rules", status: "ready", detail: "Swaggy now requires derived high urgency for the target side while excluding games where both teams rate as high urgency." },
        { label: "Goalie + fatigue context rail", status: "ready", detail: "Starter status plus derived rest/travel/fatigue context is used directly in the qualifier gate and stored with each row." },
        { label: "MoneyPuck team-strength rail", status: "ready", detail: "Sourced MoneyPuck xGoalsPercentage is required, along with a minimum absolute level and opponent edge threshold." },
        { label: "Official-team news rail", status: "partial", detail: "Official-team news remains visible/auditable, but it is supporting context only because quote/impact tagging is still shallow." },
        { label: "Pricing discipline", status: "ready", detail: "Best available moneyline must stay between -145 and +115, so obvious tax spots and long-shot narratives are filtered out." },
      ],
      unlockNotes: [
        "Still no claimed win rate or mature model edge - this is a first-pass qualifier screen only.",
        "Need better injury/news impact tagging to know when official-team posts materially change the spot.",
        "Need historical market snapshots and settlement policy before any honest performance claims or CLV studies.",
      ],
      trackingNotes: [
        "Swaggy detail page still pulls the live NHL context board so users can inspect urgency, fatigue, goalie, and official-news context directly.",
        "Stored Swaggy rows capture which side qualified, the live price, xG edge, urgency tier, fatigue comparison, and goalie posture in plain English.",
        "Rows are qualifier alerts only - no fake settled records or implied backtest were created.",
      ],
      records: [],
    },
    {
      id: "veal-bangers-zig-playoff-zigzag",
      slug: "veal-bangers-zig-playoff-zigzag",
      name: "Yo Adrian! Playoff ZigZag",
      league: "NHL",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "definition_only",
      trackabilityBucket: "parked_definition_only",
      summary: "Classic playoff zig-zag riff preserved exactly by name, but parked until the real rematch filters are defined beyond old-school folklore.",
      snapshot: "🟠 PLAYOFF-DORMANT | NHL playoffs begin ~April 2026. Rules not finalized — parked until series state is defined.",
      definition:
        "A playoff zig-zag style concept for NHL series where the market may overreact to the previous game's margin, puck luck, or special-teams noise before the next matchup in the same series.",
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
      id: BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID,
      slug: "bigcat-bonaza-puckluck",
      name: "BigCat Bonaza PuckLuck",
      league: "NHL",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "NHL 5v5 process-vs-results screener. Targets teams whose xG process diverges meaningfully from actual results — underfinishing teams (high xG%, low goals/xGoals ratio) are regression candidates. Daily qualification wired via MoneyPuck xGF season data. Partial PDO proxy: goalsAgainst not in current snapshot, so save-side luck requires a data upgrade.",
      snapshot: "🟡 DEFINED | xGF-based finishing luck qualifiable daily. Full PDO (save-side) blocked: goalsAgainst missing from MoneyPuck snapshot.",
      definition:
        "Screen NHL teams at 5v5 for meaningful divergence between their underlying process (xGoalsPercentage from MoneyPuck) and their actual results (goalsFor vs xGoalsFor finishing ratio). Teams generating strong expected-goal share but finishing below their xG rate are regression candidates — markets can overprice recent losing streaks without adjusting for unsustainable variance. Buy the process, not the scoreboard.",
      qualifierRules: [
        "5v5 focus via MoneyPuck xGoalsPercentage (season-level, all-situations proxy — not pure 5v5 split; blocker: MoneyPuck mirror does not expose strength-state splits).",
        "Process gate: team's xGoalsPercentage must be >= 0.505 (generating at least 50.5% of xG in games played). Minimum 25 games played in standings to avoid small-sample noise.",
        "Finishing luck gate (offense side): team's goalsFor / xGoalsFor ratio must be <= 0.96, meaning they are scoring at least 4% fewer goals than their expected-goal output predicts. This is the underfinishing / regression-up signal.",
        "Divergence framing: the team is a candidate to regress toward its xG process, not a guaranteed win. Markets may be undervaluing the team based on recent poor results that are partially variance-driven.",
        "Partial PDO proxy — offense side only: goalsAgainst is not available in the current MoneyPuck snapshot. Full PDO (goalsFor/xGoalsFor + goalsAgainst/xGoalsAgainst) requires a data upgrade. Current qualification captures only the finishing-luck (offense) side of variance.",
        "Daily game filter: only surface a team as a BigCat qualifier on days when they have a scheduled NHL game. No all-season static lists.",
        "Price discipline: best moneyline for the qualifying team must be between -170 and +250 to exclude obvious chalk and long-shot noise.",
      ],
      progressionLogic: [],
      thesis:
        "NHL goal-scoring is noisy over short stretches. A team generating > 50% of expected goals but finishing below their xG rate is likely experiencing short-term variance, not a structural collapse. The market often prices these teams based on recent results rather than underlying process. BigCat PuckLuck flags these divergences as daily regression opportunities — not guaranteed edges, but mathematically justified watchlist spots.",
      sourceNotes: [
        {
          label: "Native qualifier tracker",
          detail: "BigCat Bonaza PuckLuck is now a Goosalytics-native NHL screener using MoneyPuck season xG data and NHL standings. The 'externally inspired' framing is retired — this is now an independently defined system.",
        },
        {
          label: "Data limitation — partial PDO only",
          detail: "Full PDO requires goalsFor/xGoalsFor (offense finishing luck) AND goalsAgainst/xGoalsAgainst (goalie/defense luck). Current MoneyPuck snapshot provides xGoalsFor, xGoalsAgainst, and goalsFor but NOT goalsAgainst. Qualification fires on offense-side luck only until the data is upgraded.",
        },
        {
          label: "5v5 note",
          detail: "MoneyPuck xGoalsPercentage in the current mirror is all-situations season-level. Pure 5v5 split not available from the GitHub CSV mirror. This is a known limitation and is stated in every qualifier note.",
        },
      ],
      automationStatusLabel: "Live — offense-side finishing luck qualification active",
      automationStatusDetail: "Daily refresh uses MoneyPuck xGoalsPercentage and goalsFor/xGoalsFor ratio to flag underfinishing teams on that day's NHL slate. Partial PDO blocker: goalsAgainst not in snapshot, so save-side luck is not captured. Full PDO qualification requires upgrading the MoneyPuck feed to include goalsAgainst.",
      dataRequirements: [
        { label: "xGoalsPercentage (season)", status: "ready", detail: "MoneyPuck xGoalsPercentage live for all 32 teams via bundled snapshot + live mirror fallback." },
        { label: "xGoalsFor / goalsFor (finishing luck, offense)", status: "ready", detail: "xGoalsFor and goalsFor both in snapshot. goalsFor/xGoalsFor ratio computable to measure underfinishing." },
        { label: "goalsAgainst / xGoalsAgainst (finishing luck, defense/goalie)", status: "pending", detail: "goalsAgainst not in current MoneyPuck snapshot. xGoalsAgainst is available but actual goalsAgainst is missing. Full PDO blocked until feed is upgraded." },
        { label: "5v5 strength-state split", status: "pending", detail: "MoneyPuck GitHub mirror CSV does not expose 5v5-only xG. Current data is all-situations. Upgrade requires a different data source (e.g., Natural Stat Trick)." },
        { label: "NHL standings (sample gate)", status: "ready", detail: "NHL standings provide gamesPlayed for minimum-sample enforcement (25+ games required)." },
        { label: "Aggregated NHL moneylines", status: "ready", detail: "Best-available NHL moneylines per team from aggregated odds API for price discipline gate." },
        { label: "Historical outcome validation", status: "pending", detail: "No settled record history yet. Need outcomes before any win-rate claim." },
      ],
      unlockNotes: [
        "Offense-side finishing luck qualification live now.",
        "Full PDO: upgrade MoneyPuck feed to include goalsAgainst column.",
        "Pure 5v5 split: upgrade to Natural Stat Trick or direct MoneyPuck API (not GitHub mirror).",
      ],
      trackingNotes: [
        "Qualifier rows show xGoalsPercentage, goalsFor/xGoalsFor ratio, and partial PDO label.",
        "Every row notes 'partial PDO — offense side only' until goalsAgainst data is live.",
        "No synthetic backtest or claimed win rate. Alerts only.",
      ],
      records: [],
    },
    {
      id: "tonys-hot-bats",
      slug: "tonys-hot-bats",
      name: "Tony's Tight Bats",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "MLB tight-bats concept is OFF until recent-hitter context becomes a real directional picks rule with validation.",
      snapshot: "🟡 Context board live until a qualified Tony's Tight Bats pick fires. When it fires, it must render, persist, and grade as a real system pick.",
      definition:
        "A first-pass hitting-form concept designed to detect offenses whose confirmed top-of-order bats have shown real recent production and are playing in a friendlier same-day run environment than the baseline market may fully reflect.",
      qualifierRules: [
        "Use official MLB live-feed lineup status only; teams without an official batting order do not qualify.",
        "Recent-offense trigger is based on the first four confirmed hitters only, using MLB player game logs from the last 10 games.",
        "A live row would need at least three of the top four hitters to have 5+ logged recent games and a lineup-average of at least 1.00 hit/game, 1.60 total bases/game, and 0.55 runs+RBI/game.",
        "Run environment must help rather than fight the offense: hitter-friendly park, warm weather, or a taxed opposing bullpen can support the row.",
        "When the trigger fires, the system pick is the qualified team moneyline and must be logged, surfaced, and graded as a real system play.",
        "Market context matters; totals and moneyline pricing are captured only when books are actually posting them, and the qualified side must keep an actual posted number.",
      ],
      progressionLogic: [],
      thesis:
        "The market can be slow to fully price a lineup that is actually hitting right now, but this only becomes useful when recent production is anchored to confirmed hitters and paired with a credible same-day scoring environment.",
      sourceNotes: [
        {
          label: "Native early trigger board",
          detail: "This board now combines official MLB lineup IDs, MLB hitter game logs, and the MLB enrichment rail for weather, park factor, bullpen workload, and market availability context.",
        },
        {
          label: "Honesty policy",
          detail: "Non-trigger rows stay context only. Trigger rows become real qualified moneyline picks only when lineups, hitter form, and posted market context are present. No guessed picks.",
        },
      ],
      automationStatusLabel: "Context board + live pick trigger",
      automationStatusDetail: "Daily context rails exist. When the trigger fires with a qualified side and posted market, Tony's Tight Bats must surface, persist, and grade it as a live system moneyline pick.",
      dataRequirements: [
        { label: "Official lineup status", status: "partial", detail: "MLB live feed is connected. Only officially published batting orders qualify (conservative - no third-party lineup guesses)." },
        { label: "Top-of-order hitter game logs", status: "ready", detail: "Official lineup player IDs connect to MLB hitter game logs. 10-game sample: H/G, TB/G, R+RBI/G thresholds enforced." },
        { label: "Weather / park context", status: "ready", detail: "Open-Meteo temperature/wind and seeded Statcast park factors attached per game when available." },
        { label: "Bullpen workload context", status: "ready", detail: "Last-three-day bullpen usage context from MLB boxscores. High/moderate/low fatigue label per side." },
        { label: "Market availability context", status: "partial", detail: "Moneyline, total, and F5 availability surfaced only when books are posting them. No synthetic lines created." },
        { label: "Price discipline / validation layer", status: "partial", detail: "Posted moneyline context is required for a live trigger row. Line-history discipline can improve later, but triggered rows must already persist and grade honestly." },
      ],
      unlockNotes: [
        "Primary rails are live, but that is not enough to call this a live system.",
        "Price discipline and outcome validation still need to exist before this can turn on.",
        "Noise-control (BABIP / quality-of-contact) would strengthen triggers beyond raw last-10 production.",
        "Opponent starter quality not yet in the qualifier gate - can be added as next improvement.",
      ],
      trackingNotes: [
        "Any trigger row is a live system pick and must surface in qualified picks, record, and history.",
        "Lineup status comes only from MLB's live feed; no third-party lineup scrape is used to fake certainty.",
        "Market availability notes stay tied to posted books/markets. No synthetic F5 or total lines are created.",
      ],
      records: [],
    },
    {
      id: FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID,
      slug: "falcons-fight-pummeled-pitchers",
      name: "Veal Banged Up Pitchers",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "MLB qualifier tracker for probable starters coming off a recent shelling, filtered by listed ERA and current moneyline. Alerts first, not official picks.",
      snapshot: "Awaiting nightly QA refresh. If Falcons has no qualifiers, admin output must explain the blocker honestly.",
      definition:
        "Flag upcoming MLB starters whose previous start within 10 days was objectively ugly, then surface the next game only when the listed ERA and current moneyline stay inside the first-pass screen.",
      qualifierRules: [
        "Upcoming MLB game must list a probable starter.",
        "That same starter must have a prior start within the last 10 days.",
        "The prior start counts as 'pummeled' if earned runs >= 5, hits allowed >= 8, or innings pitched < 4.0.",
        "Listed ERA must be 5.25 or lower when MLB provides an ERA; missing ERA stays unresolved instead of guessed.",
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
      id: ROBBIES_RIPPER_FAST_5_SYSTEM_ID,
      slug: "robbies-ripper-fast-5",
      name: "Robbie's Ripper Fast 5",
      league: "MLB",
      category: "historical",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary: "MLB first-five qualifier board targeting starter mismatches when F5 markets are posted. Alerts when a meaningful quality gap and live F5 price both exist. Grading requires inning-level linescore data.",
      snapshot: "🟢 FIRING | MLB season open. F5 markets sparse early in season — board activates when books post lines.",
      definition:
        "Attack MLB first-five pricing before bullpen variance takes over by flagging games where one starter is meaningfully better than the other and an actual F5 market (side or total) has been posted by books. Qualifiers fire only when the starter mismatch is real and the F5 price exists. No synthetic lines are inferred.",
      qualifierRules: [
        "Both probable pitchers must be listed by MLB before the game qualifies.",
        "An F5 market (h2h_1st_5_innings or totals_1st_5_innings) must be explicitly posted by at least one book — no full-game-to-F5 inference.",
        "Starter mismatch requires a qualityScore gap of 12 or more points (ERA+WHIP blend scale 30–80) between the two starters.",
        "The qualifying side is the team with the better-quality starter.",
        "Weather: if temperature is available and below 40°F, or wind speed above 22 mph in an exposed park, a context note is added but does not automatically disqualify.",
        "Context-board rows are stored for every game with both probable pitchers even when the F5 market or mismatch gate does not fire, so the board reflects honest data coverage.",
      ],
      progressionLogic: [],
      thesis:
        "The first five innings isolate starter quality better than the full game does. When books post an actual F5 line and one starter is measurably better than the other by a quality-score gap, there may be a pricing inefficiency worth tracking. That claim stays honest only when both the mismatch and the market are real.",
      sourceNotes: [
        {
          label: "Native qualifier tracker",
          detail: "Robbie's Ripper Fast 5 is a Goosalytics-owned MLB system built from probable starters (ERA+WHIP quality scoring), the MLB enrichment F5 market rail, and park/weather/bullpen context.",
        },
        {
          label: "Honesty policy",
          detail: "Rows are qualifier alerts only. No F5 line is synthesized from full-game markets. Grading requires 5-inning linescore data from the MLB Stats API; rows stay pending until that data is available.",
        },
        {
          label: "Formerly Quick Rips F5",
          detail: "This system was previously cataloged as 'Quick Rips F5' (slug: quick-rips-f5). The old slug redirects to robbies-ripper-fast-5.",
        },
      ],
      automationStatusLabel: "Live qualifier board — F5 mismatch alerts when markets posted",
      automationStatusDetail: "Refreshes from the MLB enrichment board daily. Stores alert rows when both probable pitchers are listed, an F5 market exists, and the starter quality gap meets the 12-point threshold. Grading uses MLB Stats API per-inning linescore data when available.",
      dataRequirements: [
        { label: "F5 market availability", status: "ready", detail: "The aggregated odds feed exposes h2h_1st_5_innings and totals_1st_5_innings keys when books post them. Completeness is checked per-game on every refresh." },
        { label: "Probable pitchers + ERA/WHIP quality scoring", status: "ready", detail: "MLB schedule hydrate exposes probable starters with current ERA and WHIP. Quality score (30–80 scale) blends ERA+WHIP when both available." },
        { label: "Starter-mismatch gate", status: "ready", detail: "Quality gap of 12+ points on the 30–80 scale is the trigger. No fabricated adjustments." },
        { label: "Weather / park / bullpen context", status: "ready", detail: "Open-Meteo weather, seeded park factors, and bullpen workload context attached from the MLB enrichment board." },
        { label: "F5 inning linescore for grading", status: "partial", detail: "MLB Stats API /game/{gamePk}/linescore provides per-inning runs. Grading fires when 5 complete innings are confirmed. Rows stay pending if linescore is unavailable or game is live." },
      ],
      unlockNotes: [],
      trackingNotes: [
        "Alert rows are stored only when the F5 market is actually posted and the starter mismatch clears the gate.",
        "Context-board rows capture all games with probable pitchers so the data coverage is visible even when no alert fires.",
        "F5 side grading: qualifiedTeam leads (or ties) after 5 innings = win (or push). Home team extra-inning rules follow standard F5 settlement conventions (home team wins if leading after 5 complete away-team at-bats).",
        "F5 total grading: combined runs through 5 innings vs the posted total line.",
        "If inning linescore is unavailable after game completion, the row is explicitly marked ungradeable with a note explaining the blocker.",
      ],
      records: [],
    },
    {
      id: "warren-sharp-computer-totals-model",
      slug: "warren-sharp-computer-totals-model",
      name: "Dougy Magoo's AI Model",
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
      name: "Joey on the LOW LOW",
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
      name: "Goosies Teaser Pleaser",
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
    // ── NBA Handle Systems (Action Network splits rail) ───────────────────────
    {
      id: NBA_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
      slug: "nba-home-dog-majority-handle",
      name: "Home Dog with Majority Handle",
      league: "NBA",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "NBA home underdog receiving majority (≥ 55%) of ML handle dollars. Public money contradicts the spread favorite — potential steam on the dog or narrative mis-pricing.",
      snapshot: "🟡 RAIL LIVE | Action Network handle splits ingested. Qualification logic wired. Awaiting first game-day firing.",
      definition:
        "Flag NBA games where the home team is a moneyline underdog (homeML > 0) AND attracts ≥ 55% of ML handle dollars. The public money contradicts the odds. Either sharp money is pushing the home dog, or the away team is overpriced by narrative. Alert only — not a pick without further context.",
      qualifierRules: [
        "Home team must be a moneyline underdog: homeML > 0 in American odds.",
        "Home team must hold ≥ 60% of ML handle dollars (ml_home_money from Action Network). Tightened 2026-03-29 from 55% to reduce noise.",
        "Splits data must be marked splitsAvailable = true (≥ 1 book returning handle data).",
        "numBets threshold: minimum 200 bets tracked for the game before firing (low-volume games filtered).",
      ],
      progressionLogic: [],
      thesis:
        "When the public puts majority money on a home underdog — a team the market says should lose — either the market is wrong about the price or there's meaningful sharp activity contrarian to the spread. Both scenarios are worth flagging. The home-field component adds a structural overlay (scheduling quirks, rest, desperation spots).",
      sourceNotes: [
        {
          label: "Action Network public scoreboard API",
          detail:
            "Source: api.actionnetwork.com/web/v1/scoreboard/nba. Returns ml_home_money (handle %) and ml_home_public (ticket %) per game. No API key required. Cached 60 minutes. See src/lib/nba-handle.ts.",
        },
        {
          label: "Handle % vs ticket %",
          detail:
            "This system uses handle % (dollars bet), not ticket % (bet count). Handle tracks sharp money more reliably than raw ticket count, which reflects mass public bets.",
        },
        {
          label: "Honesty policy",
          detail:
            "If Action Network returns no splits for a game (splitsAvailable = false), that game is skipped. No inferred or synthetic splits are ever used.",
        },
      ],
      automationStatusLabel: "Rail live — qualifying",
      automationStatusDetail:
        "Action Network handle splits ingested via nba-handle.ts. qualifiesHomeUnderdogMajorityHandle() wired. Fires when home team is dog + ≥ 55% ML handle. Alert only.",
      dataRequirements: [
        {
          label: "NBA public ML handle %",
          status: "ready",
          detail: "Live from Action Network scoreboard API (ml_home_money field). No key required. nba-handle.ts.",
        },
        {
          label: "Home team moneyline",
          status: "ready",
          detail: "ml_home from Action Network odds row. Confirmed positive = underdog.",
        },
        {
          label: "Bet volume filter",
          status: "ready",
          detail: "num_bets field from AN odds row. Filter: ≥ 200 bets.",
        },
      ],
      unlockNotes: [
        "Rail is live. Threshold tightened to 60% (2026-03-29). Monitor firing frequency at new threshold.",
      ],
      trackingNotes: [
        "Alert only — do not imply a bet direction without separate value gate.",
        "Log qualifier rows once per game per day. Do not re-fire on refreshes unless date changes.",
        "Handle splits may update intra-day — final snapshot near game time is most meaningful.",
      ],
      records: [],
    },
    {
      id: NBA_HOME_SUPER_MAJORITY_CLOSE_GAME_SYSTEM_ID,
      slug: "nba-home-super-majority-close-game",
      name: "Home Super-Majority Handle (Close Game)",
      league: "NBA",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "NBA games where the home team attracts ≥ 65% of ML handle dollars AND the spread is within ±4 points. Super-majority public money on the home side in a genuinely competitive game.",
      snapshot: "🟡 RAIL LIVE | Action Network handle splits ingested. Qualification logic wired. Awaiting first game-day firing.",
      definition:
        "Flag NBA games where: (1) the home team holds ≥ 65% of ML handle dollars (super-majority), AND (2) the game spread is ±4 points or tighter. A super-majority handle in a close game suggests either home-field public bias or legitimate sharp support on a tight matchup. Alert only.",
      qualifierRules: [
        "Home team must hold ≥ 65% of ML handle dollars (ml_home_money from Action Network).",
        "Spread must be ±4 or tighter: |homeSpread| ≤ 4 (homeSpread = -spreadAway).",
        "Splits data must be marked splitsAvailable = true.",
        "numBets threshold: minimum 200 bets tracked before firing.",
        "Home team underdog status is NOT required (distinguishes from Home Dog system above).",
      ],
      progressionLogic: [],
      thesis:
        "In close NBA games (≤4 point spread), when the public piles 65%+ of handle on the home team, the away price is being structurally depressed by public home-team bias. In competitive games, this creates a recurring mis-pricing pattern worth monitoring — especially when the away team has legitimate contextual advantages (rest, form, travel).",
      sourceNotes: [
        {
          label: "Action Network public scoreboard API",
          detail:
            "Source: api.actionnetwork.com/web/v1/scoreboard/nba. Returns ml_home_money (handle %) and spread_away (line) per game. No API key required. Cached 60 minutes. See src/lib/nba-handle.ts.",
        },
        {
          label: "Spread source",
          detail:
            "Spread line taken from Action Network consensus odds row (bookId=15/DraftKings preferred). Home spread = -spreadAway.",
        },
        {
          label: "Honesty policy",
          detail:
            "If splitsAvailable = false or spread is null, game is skipped. No fabricated splits.",
        },
      ],
      automationStatusLabel: "Rail live — qualifying",
      automationStatusDetail:
        "Action Network handle splits ingested via nba-handle.ts. qualifiesHomeSuperMajorityHandleCloseGame() wired. Fires when ≥ 65% ML handle + spread ≤ ±4.",
      dataRequirements: [
        {
          label: "NBA public ML handle %",
          status: "ready",
          detail: "Live from Action Network scoreboard API (ml_home_money field). nba-handle.ts.",
        },
        {
          label: "Game spread line",
          status: "ready",
          detail: "spread_away from Action Network odds row. Home spread = -spreadAway.",
        },
        {
          label: "Bet volume filter",
          status: "ready",
          detail: "num_bets field. Filter: ≥ 200 bets.",
        },
      ],
      unlockNotes: [
        "Rail is live. Monitor game-day firing frequency to calibrate close-game threshold (currently ±4).",
        "Consider combining with spread trend context once system accumulates 20+ qualified games.",
      ],
      trackingNotes: [
        "Alert only — do not imply a bet direction without separate edge verification.",
        "The spread threshold (±4) is a starting point. Review after 4 weeks of data.",
        "Close-game definition intentionally conservative to filter out lopsided games.",
      ],
      records: [],
    },
    // ── NHL Handle Systems (Action Network splits rail) ──────────────────────
    {
      id: NHL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
      slug: "nhl-home-dog-majority-handle",
      name: "NHL Home Dog — Majority Handle",
      league: "NHL",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "NHL home underdog receiving majority (≥ 60%) of ML handle dollars. Public money contradicts the road favorite — potential steam or narrative mis-pricing. Threshold tightened 2026-03-29 from 55%.",
      snapshot: "🟡 RAIL LIVE | Action Network NHL splits ingested. Qualifier logic wired (≥ 60% ML handle). Line-move history rail wired — confirmation note added when ≥ 2 snapshots available.",
      definition:
        "Flag NHL games where the home team is a moneyline underdog (homeML > 0 in American odds) AND attracts ≥ 60% of ML handle dollars. When public money flows to a home dog at this level, it either signals genuine sharp action or a market that has over-priced the road team. Alert only — not a directional pick without further context and historical validation.",
      qualifierRules: [
        "Home team must be a moneyline underdog: bestHome.odds > 0 from aggregated NHL odds.",
        "Home team must hold ≥ 60% of ML handle dollars (mlHomeHandlePct from Action Network splits). Threshold tightened 2026-03-29 from 55% to reduce noise.",
        "Splits data must be available: mlSplitsAvailable = true on the BettingSplitsSnapshot.",
        "League must be NHL with a matching aggregated odds event for game-day price.",
        "Line-move confirmation added as context note: getMarketHistoryRail() checked when aggregated event is found. Qualifier fires regardless of line history — but 'line-confirmed' label applied when >= 2 snapshots exist and ML odds have moved.",
      ],
      progressionLogic: [],
      thesis:
        "NHL markets price road favourites sharply. When public handle flows to the home underdog instead, either sharp money is backing the home side or the away team is over-priced by narrative. The home-ice component adds a structural overlay that doesn't fully appear in the moneyline.",
      sourceNotes: [
        {
          label: "Action Network (DK primary + FD comparison)",
          detail: "NHL ML handle splits from Action Network scoreboard API via getBettingSplits(\"NHL\"). No API key required.",
        },
        {
          label: "Aggregated NHL moneylines",
          detail: "Home ML odds sourced from getAggregatedOddsForSport(\"NHL\") for the underdog check.",
        },
        {
          label: "Honesty policy",
          detail: "If splits are unavailable or no aggregated event matches, the game is skipped. No inferred splits.",
        },
      ],
      automationStatusLabel: "Rail live — qualifying",
      automationStatusDetail: "getBettingSplits(\"NHL\") + getAggregatedOddsForSport(\"NHL\") both connected. Fires when home team is dog + ≥ 55% ML handle.",
      dataRequirements: [
        { label: "NHL public ML handle %", status: "ready", detail: "Live from Action Network via getBettingSplits(\"NHL\")." },
        { label: "NHL home ML price", status: "ready", detail: "Live from getAggregatedOddsForSport(\"NHL\"). bestHome.odds > 0 = underdog." },
        { label: "Intraday line-move history", status: "ready", detail: "getMarketHistoryRail() reads from Supabase market_snapshot_prices (all sports captured hourly). Attached as context note on each qualifying record." },
      ],
      unlockNotes: [
        "Rail live. Threshold tightened to 60% (2026-03-29). Monitor first 2 weeks of game-day firing at new threshold.",
        "Line-move context now attached to each qualifier. Upgrade to direction-confirmed alert once win-rate history accumulates.",
      ],
      trackingNotes: [
        "Alert only — do not imply a bet direction without a separate value gate and historical validation.",
        "NHL handle data may be thinner than NBA early in the day; near-game snapshots are most meaningful.",
        "Line-move note is informational only — qualifier fires on splits threshold, not on line-move requirement.",
      ],
      records: [],
    },
    {
      id: NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
      slug: "nhl-under-majority-handle",
      name: "NHL Under — Majority Handle",
      league: "NHL",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "NHL games where the Under receives ≥ 62% of total handle. Public over-bias reversed at this level — sharper signal threshold. Tightened 2026-03-29 from 58%.",
      snapshot: "🟡 RAIL LIVE | Action Network NHL total splits ingested. Qualifier logic wired (≥ 62% Under handle). Line-move history context attached when available.",
      definition:
        "Flag NHL games where the Under side attracts ≥ 62% of total (O/U) handle dollars. Public bettors heavily favour Overs across major sports. When handle flows to the Under at this rate, it more reliably indicates sharp money or a structurally under-priced low-scoring scenario. Alert only.",
      qualifierRules: [
        "Under side must hold ≥ 62% of total handle (underHandlePct from Action Network splits). Threshold tightened 2026-03-29 from 58% to improve signal quality.",
        "Total splits must be available: totalSplitsAvailable = true on the BettingSplitsSnapshot.",
        "League must be NHL.",
        "Line-move context note attached when aggregated event found and >= 2 Supabase snapshots exist.",
      ],
      progressionLogic: [],
      thesis:
        "Public bettors are structurally biased toward Overs in hockey. When handle majority goes to the Under, it is often driven by sharp books or informed player activity rather than casual over-action. This creates a recurring watchlist signal worth tracking before any directional claim is made.",
      sourceNotes: [
        {
          label: "Action Network (DK primary + FD comparison)",
          detail: "NHL total handle splits from Action Network via getBettingSplits(\"NHL\").",
        },
        {
          label: "Honesty policy",
          detail: "No bet direction is implied. Qualifier is an alert that a non-standard handle pattern exists.",
        },
      ],
      automationStatusLabel: "Rail live — qualifying",
      automationStatusDetail: "getBettingSplits(\"NHL\") connected. Fires when Under ≥ 58% of total handle.",
      dataRequirements: [
        { label: "NHL public total handle %", status: "ready", detail: "Live from Action Network via getBettingSplits(\"NHL\"). totalSplitsAvailable required." },
        { label: "Intraday line-move history", status: "ready", detail: "getMarketHistoryRail() reads from Supabase market_snapshot_prices. Attached as context note per qualifying record." },
      ],
      unlockNotes: [
        "Rail live. Threshold tightened to 62% (2026-03-29). Review again after 3 weeks at new threshold.",
        "Line-move context now wired. Upgrade to direction-confirmed alert once pattern data accumulates.",
      ],
      trackingNotes: [
        "Alert only. No bet direction claimed. Track qualifier frequency and game context before adding a direction gate.",
        "Line-move note is informational — qualifier does not require line history to fire.",
      ],
      records: [],
    },
    // ── MLB Handle Systems (Action Network splits rail) ───────────────────────
    {
      id: MLB_HOME_MAJORITY_HANDLE_SYSTEM_ID,
      slug: "mlb-home-majority-handle",
      name: "MLB Home — Majority Handle",
      league: "MLB",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "MLB games where the home team receives ≥ 60% of ML handle dollars. Threshold tightened 2026-03-29 from 55% — 55% fires too broadly given home-team bias baseline. Alert only — watchlist until direction is validated.",
      snapshot: "🟡 RAIL LIVE | Action Network MLB splits ingested. Qualifier logic wired (≥ 60% ML handle). Line-move history context attached when available.",
      definition:
        "Flag MLB games where the home team holds ≥ 60% of ML handle dollars, regardless of whether they are a favourite or underdog. 60% is a meaningfully elevated signal over the typical home-team bias baseline. When handle majority reaches this level, the away team's price may be inflated by bias or the home side may carry genuine sharp interest. Alert only — watchlist until direction is validated.",
      qualifierRules: [
        "Home team must hold ≥ 60% of ML handle dollars (mlHomeHandlePct from Action Network splits). Tightened from 55% (2026-03-29) — 55% fires too broadly in MLB where home-team bias is structural.",
        "Splits data must be available: mlSplitsAvailable = true.",
        "League must be MLB.",
        "Line-move context note attached when aggregated event found and >= 2 Supabase snapshots exist.",
      ],
      progressionLogic: [],
      thesis:
        "Home-team bias in MLB betting is persistent. When home teams attract majority handle, the market may over-price them, creating value on the road side. Alternatively, genuine sharp action on a strong home team could explain the flow. This system tracks the pattern for investigation before any bet direction is claimed.",
      sourceNotes: [
        {
          label: "Action Network (DK primary + FD comparison)",
          detail: "MLB ML handle splits from Action Network via getBettingSplits(\"MLB\").",
        },
      ],
      automationStatusLabel: "Rail live — qualifying",
      automationStatusDetail: "getBettingSplits(\"MLB\") connected. Fires when home team ≥ 55% ML handle.",
      dataRequirements: [
        { label: "MLB public ML handle %", status: "ready", detail: "Live from Action Network via getBettingSplits(\"MLB\")." },
        { label: "Intraday line-move history", status: "ready", detail: "getMarketHistoryRail() reads from Supabase market_snapshot_prices. Attached as context note per qualifying record." },
      ],
      unlockNotes: [
        "Rail live. Threshold tightened to 60% (2026-03-29). Watchlist-only until sample accumulates. Review again after 4 weeks at new threshold.",
        "Line-move context now wired. Direction still unresolved — do not claim value without validated edge.",
      ],
      trackingNotes: [
        "Watchlist alert only — no bet direction implied. 60% handle is the minimum for a non-trivial signal in MLB.",
        "Line-move note is informational — qualifier does not require line history to fire.",
      ],
      records: [],
    },
    {
      id: MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
      slug: "mlb-under-majority-handle",
      name: "MLB Under — Majority Handle",
      league: "MLB",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "MLB games where the Under receives ≥ 62% of total handle. Threshold tightened 2026-03-29 from 58% — sharper under signal, less noise from borderline splits.",
      snapshot: "🟡 RAIL LIVE | Action Network MLB total splits ingested. Qualifier logic wired (≥ 62% Under handle). Line-move history context attached when available.",
      definition:
        "Flag MLB games where the Under attracts ≥ 62% of total handle. Public bettors have a strong over-bias in baseball. At 62%+ under handle, the signal more reliably indicates sharp or informed activity rather than casual bettors or variance. Alert only.",
      qualifierRules: [
        "Under side must hold ≥ 62% of total handle (underHandlePct from Action Network splits). Tightened from 58% (2026-03-29) — 58% fires too broadly in MLB; 62% is a more distinct signal.",
        "Total splits must be available: totalSplitsAvailable = true.",
        "League must be MLB.",
        "Line-move context note attached when aggregated event found and >= 2 Supabase snapshots exist.",
      ],
      progressionLogic: [],
      thesis:
        "Baseball public bettors tend to favour Overs — pitcher matchups, park factors, and scoring environments make high-scoring games more exciting to bet. When handle flips to the Under at 58%+, the move is more likely to reflect sharp positioning rather than casual bets.",
      sourceNotes: [
        {
          label: "Action Network (DK primary + FD comparison)",
          detail: "MLB total handle splits from Action Network via getBettingSplits(\"MLB\").",
        },
      ],
      automationStatusLabel: "Rail live — qualifying",
      automationStatusDetail: "getBettingSplits(\"MLB\") connected. Fires when Under ≥ 58% of total handle.",
      dataRequirements: [
        { label: "MLB public total handle %", status: "ready", detail: "Live from Action Network via getBettingSplits(\"MLB\"). totalSplitsAvailable required." },
        { label: "Intraday line-move history", status: "ready", detail: "getMarketHistoryRail() reads from Supabase market_snapshot_prices. Attached as context note per qualifying record." },
      ],
      unlockNotes: [
        "Rail live. Threshold tightened to 62% (2026-03-29). Track frequency at new threshold before adding directional claim.",
      ],
      trackingNotes: [
        "Alert only. No bet direction claimed. Starter context and park factors are useful overlays before acting.",
        "Line-move note is informational — qualifier does not require line history to fire.",
      ],
      records: [],
    },
    // ── NFL Handle Systems (dormant / off-season) ─────────────────────────────
    {
      id: NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
      slug: "nfl-home-dog-majority-handle",
      name: "NFL Home Dog — Majority Handle",
      league: "NFL",
      category: "native",
      owner: "Goosalytics Lab",
      status: "awaiting_data",
      trackabilityBucket: "trackable_now",
      summary:
        "NFL home underdog receiving majority (≥ 55%) of ML handle. System logic is wired and ready; dormant during the off-season (no current NFL slate).",
      snapshot: "🔴 OFF-SEASON | NFL regular season resumes ~Sep 2026. System logic wired — will auto-activate when slate exists.",
      definition:
        "Flag NFL games where the home team is a moneyline underdog AND attracts ≥ 55% of ML handle dollars. Mirrors the NBA and NHL home-dog handle systems. NFL home-field advantage is meaningful and the public's bias toward road favourites can create mis-pricing in close matchups.",
      qualifierRules: [
        "League must be NFL with active games on the current slate.",
        "Home team must be a moneyline underdog: bestHome.odds > 0.",
        "Home team must hold ≥ 55% of ML handle dollars from Action Network splits.",
        "Total splits must be available (splitsAvailable = true).",
        "System is dormant between end of Super Bowl and start of regular season (~Feb–Aug).",
      ],
      progressionLogic: [],
      thesis:
        "NFL home dogs are structurally undervalued in public betting. When the market makes a team a home underdog but public handle still favours them, the combination of home-field edge and potential sharp action makes it a worthwhile alert to track.",
      sourceNotes: [
        {
          label: "Action Network (DK primary + FD comparison)",
          detail: "NFL ML handle splits from Action Network via getBettingSplits(\"NFL\"). Off-season returns empty board.",
        },
      ],
      automationStatusLabel: "Wired — dormant off-season",
      automationStatusDetail: "getBettingSplits(\"NFL\") connected. NFL slate empty Mar–Aug. Qualifier logic will fire automatically when September slate begins.",
      dataRequirements: [
        { label: "NFL public ML handle %", status: "ready", detail: "getBettingSplits(\"NFL\") ready. Returns empty board during off-season." },
        { label: "NFL home ML price", status: "ready", detail: "getAggregatedOddsForSport(\"NFL\") ready. Returns empty during off-season." },
      ],
      unlockNotes: [
        "System logic is fully wired. Will auto-activate at September 2026 kickoff.",
        "Review 55% ML handle threshold against Week 1 data before the season.",
      ],
      trackingNotes: [
        "Off-season status is honest — no fake qualifiers stored during dormant period.",
        "Refresh function runs but returns zero records when no NFL slate exists.",
      ],
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
  [SWAGGY_STRETCH_DRIVE_SYSTEM_ID]: {
    refresh: refreshSwaggyStretchDriveSystemData,
  },
  [ROBBIES_RIPPER_FAST_5_SYSTEM_ID]: {
    refresh: refreshRobbiesRipperFast5SystemData,
  },
    [COACH_NO_REST_SYSTEM_ID]: {
    refresh: refreshCoachNoRestSystemData,
  },
    [FAT_TONYS_FADE_SYSTEM_ID]: {
    refresh: refreshFuchsFadeSystemData,
  },
  [BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID]: {
    refresh: refreshBigCatsNBA1QUnderSystemData,
  },
    [NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID]: {
    refresh: refreshNHLUnderMajorityHandleSystemData,
  },
    [MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID]: {
    refresh: refreshMLBUnderMajorityHandleSystemData,
  },
  [NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID]: {
    refresh: refreshNFLHomeDogMajorityHandleSystemData,
  },
};

function defaultData(): SystemsTrackingData {
  return {
    updatedAt: new Date().toISOString(),
    systems: SYSTEM_TEMPLATES.map((system) => normalizeSystem(system)),
    qualificationLog: [],
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
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `system-${Date.now()}`;
}

function normalizeRecord(record: Partial<SystemTrackingRecord>): SystemTrackingRecord {
  const normalizedMarketType = record.marketType || null;
  const normalizedRecordKind = (() => {
    if (record.recordKind === "progression") return "progression";
    if (record.recordKind === "alert") return "alert";
    if (record.recordKind === "qualifier") {
      const isContextBoard = normalizedMarketType === "context-board" || normalizedMarketType === "context-total-board";
      const hasActionableSide = Boolean(record.qualifiedTeam) || normalizedMarketType === "total" || normalizedMarketType === "f5-total";
      return !isContextBoard && hasActionableSide ? "qualifier" : "alert";
    }
    return null;
  })();

  return {
    id: record.id || `system_row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    gameId: record.gameId || undefined,
    oddsEventId: record.oddsEventId ?? null,
    espnEventId: record.espnEventId ?? null,
    gameDate: record.gameDate || "",
    sourceHealthStatus: record.sourceHealthStatus || null,
    freshnessSummary: record.freshnessSummary || null,
    matchup: record.matchup || "",
    roadTeam: record.roadTeam || "",
    homeTeam: record.homeTeam || "",
    recordKind: normalizedRecordKind,
    marketType: record.marketType || null,
    marketAvailability: record.marketAvailability || null,
    alertLabel: record.alertLabel || null,
    starterName: record.starterName || null,
    starterEra: typeof record.starterEra === "number" ? record.starterEra : null,
    currentMoneyline: typeof record.currentMoneyline === "number" ? record.currentMoneyline : null,
    falconsScore: typeof record.falconsScore === "number" ? record.falconsScore : null,
    falconsScoreLabel: record.falconsScoreLabel || null,
    falconsScoreComponents: Array.isArray(record.falconsScoreComponents) ? record.falconsScoreComponents.filter(Boolean) : null,
    priorGameDate: record.priorGameDate || null,
    priorStartSummary: record.priorStartSummary || null,
    lineupStatus: record.lineupStatus || null,
    weatherSummary: record.weatherSummary || null,
    parkFactorSummary: record.parkFactorSummary || null,
    bullpenSummary: record.bullpenSummary || null,
    f5Summary: record.f5Summary || null,
    qualifiedTeam: record.qualifiedTeam || null,
    opponentTeam: record.opponentTeam || null,
    xGoalsPercentage: typeof record.xGoalsPercentage === "number" ? record.xGoalsPercentage : null,
    opponentXGoalsPercentage: typeof record.opponentXGoalsPercentage === "number" ? record.opponentXGoalsPercentage : null,
    urgencyTier: record.urgencyTier || null,
    fatigueScore: typeof record.fatigueScore === "number" ? record.fatigueScore : null,
    opponentFatigueScore: typeof record.opponentFatigueScore === "number" ? record.opponentFatigueScore : null,
    goalieStatus: record.goalieStatus || null,
    opponentGoalieStatus: record.opponentGoalieStatus || null,
    totalLine: typeof record.totalLine === "number" ? record.totalLine : null,
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

function normalizeQualificationLogEntry(entry: Partial<SystemQualificationLogEntry> | null | undefined): SystemQualificationLogEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const qualifierId = typeof entry.qualifierId === "string" && entry.qualifierId ? entry.qualifierId : null;
  const systemId = typeof entry.systemId === "string" && entry.systemId ? entry.systemId : null;
  if (!qualifierId || !systemId) return null;
  const snapshot = normalizeRecord((entry.recordSnapshot || {}) as Partial<SystemTrackingRecord>);
  const recordKind = entry.recordKind === "alert" || entry.recordKind === "progression" ? entry.recordKind : "qualifier";
  const settlementStatus: SystemQualifierSettlementStatus = entry.settlementStatus === "settled"
    || entry.settlementStatus === "ungradeable"
    || entry.settlementStatus === "not_applicable"
    ? entry.settlementStatus
    : "pending";
  const outcome: SystemQualifierOutcome = entry.outcome === "win"
    || entry.outcome === "loss"
    || entry.outcome === "push"
    || entry.outcome === "pending"
    || entry.outcome === "ungradeable"
    || entry.outcome === "not_applicable"
    ? entry.outcome
    : settlementStatus === "ungradeable"
      ? "ungradeable"
      : settlementStatus === "pending"
        ? "pending"
        : "not_applicable";
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : `${systemId}:${qualifierId}`,
    systemId,
    systemSlug: typeof entry.systemSlug === "string" && entry.systemSlug ? entry.systemSlug : slugify(systemId),
    systemName: typeof entry.systemName === "string" && entry.systemName ? entry.systemName : systemId,
    gameDate: typeof entry.gameDate === "string" && entry.gameDate ? entry.gameDate : snapshot.gameDate,
    loggedAt: typeof entry.loggedAt === "string" && entry.loggedAt ? entry.loggedAt : (snapshot.lastSyncedAt || new Date().toISOString()),
    qualifierId,
    recordKind,
    matchup: typeof entry.matchup === "string" && entry.matchup ? entry.matchup : snapshot.matchup,
    roadTeam: typeof entry.roadTeam === "string" && entry.roadTeam ? entry.roadTeam : snapshot.roadTeam,
    homeTeam: typeof entry.homeTeam === "string" && entry.homeTeam ? entry.homeTeam : snapshot.homeTeam,
    qualifiedTeam: typeof entry.qualifiedTeam === "string" ? entry.qualifiedTeam : (snapshot.qualifiedTeam || null),
    opponentTeam: typeof entry.opponentTeam === "string" ? entry.opponentTeam : (snapshot.opponentTeam || null),
    marketType: typeof entry.marketType === "string" ? entry.marketType : (snapshot.marketType || null),
    actionLabel: typeof entry.actionLabel === "string" ? entry.actionLabel : null,
    actionSide: typeof entry.actionSide === "string" ? entry.actionSide : null,
    flatStakeUnits: typeof entry.flatStakeUnits === "number" && Number.isFinite(entry.flatStakeUnits) ? entry.flatStakeUnits : 1,
    settlementStatus,
    outcome,
    netUnits: typeof entry.netUnits === "number" && Number.isFinite(entry.netUnits) ? entry.netUnits : null,
    source: typeof entry.source === "string" ? entry.source : snapshot.source,
    notes: typeof entry.notes === "string" ? entry.notes : snapshot.notes,
    recordSnapshot: snapshot,
    settledAt: typeof entry.settledAt === "string" ? entry.settledAt : null,
    lastSyncedAt: typeof entry.lastSyncedAt === "string" ? entry.lastSyncedAt : snapshot.lastSyncedAt,
  };
}

// Systems with real W/L grading (NBA Goose via quarter ATS; Swaggy + Falcons via ML; Robbie's Ripper via F5 inning linescore)
const ML_GRADEABLE_SYSTEM_IDS = new Set([
  SWAGGY_STRETCH_DRIVE_SYSTEM_ID,
  FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID,
  ROBBIES_RIPPER_FAST_5_SYSTEM_ID,
  BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID,
  COACH_NO_REST_SYSTEM_ID,
  FAT_TONYS_FADE_SYSTEM_ID,
  BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID,
  // Totals systems — use the same pending/grader pipeline, graded by gradePendingTotalQualifiers
  NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
  MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
]);

const ACTIONABLE_SYSTEM_IDS = new Set([
  NBA_GOOSE_SYSTEM_ID,
  SWAGGY_STRETCH_DRIVE_SYSTEM_ID,
  FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID,
  ROBBIES_RIPPER_FAST_5_SYSTEM_ID,
  COACH_NO_REST_SYSTEM_ID,
  FAT_TONYS_FADE_SYSTEM_ID,
  NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
  MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
  BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID,
]);

const PARKED_SYSTEM_IDS = new Set([
  THE_BLOWOUT_SYSTEM_ID,
  HOT_TEAMS_MATCHUP_SYSTEM_ID,
  TONYS_HOT_BATS_SYSTEM_ID,
  BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID,
  NBA_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
  NBA_HOME_SUPER_MAJORITY_CLOSE_GAME_SYSTEM_ID,
  NHL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
  MLB_HOME_MAJORITY_HANDLE_SYSTEM_ID,
  NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
]);

function systemHasActionableTracking(system: TrackedSystem) {
  return ACTIONABLE_SYSTEM_IDS.has(system.id);
}

function systemIsMLGradeable(system: TrackedSystem) {
  return ML_GRADEABLE_SYSTEM_IDS.has(system.id);
}

function isGooseRecordUngradeable(record: SystemTrackingRecord) {
  if (record.recordKind !== "progression") return false;
  const hasFinalScores = record.firstQuarterRoadScore != null && record.firstQuarterHomeScore != null;
  if (!hasFinalScores) return false;
  if (record.firstQuarterSpread == null) return true;
  if (record.bet1Result === "loss") {
    return record.thirdQuarterSpread == null || record.thirdQuarterRoadScore == null || record.thirdQuarterHomeScore == null;
  }
  return false;
}

function buildQualificationLogEntry(system: TrackedSystem, record: SystemTrackingRecord): SystemQualificationLogEntry {
  const actionable = systemHasActionableTracking(system);
  const isML = systemIsMLGradeable(system);
  const marketType = record.marketType || null;
  const isTotalQualifier = marketType === "total" || marketType === "f5-total";
  const totalDirection = marketType === "total"
    ? "under"
    : marketType === "f5-total"
      ? "over"
      : null;
  const actionLabel = marketType === "f5-total"
    ? `${system.name} F5 total qualifier`
    : marketType === "f5-moneyline"
      ? `${system.name} F5 side qualifier`
      : isTotalQualifier
        ? `${system.name} total qualifier`
        : `${system.name} ML qualifier`;

  // For ML-gradeable systems (Swaggy, Falcons): emit pending entries — grading happens via system-grader + Supabase
  if (isML) {
    return {
      id: `${system.id}:${record.id}`,
      systemId: system.id,
      systemSlug: system.slug,
      systemName: system.name,
      gameDate: record.gameDate,
      loggedAt: record.lastSyncedAt || new Date().toISOString(),
      qualifierId: record.id,
      recordKind: record.recordKind === "alert" || record.recordKind === "progression" ? record.recordKind : "qualifier",
      matchup: record.matchup,
      roadTeam: record.roadTeam,
      homeTeam: record.homeTeam,
      qualifiedTeam: record.qualifiedTeam || null,
      opponentTeam: record.opponentTeam || null,
      marketType: marketType || "moneyline",
      actionLabel,
      actionSide: isTotalQualifier ? totalDirection : (record.qualifiedTeam || null),
      flatStakeUnits: 1,
      settlementStatus: "pending",
      outcome: "pending",
      netUnits: null,
      source: record.source,
      notes: record.notes,
      recordSnapshot: normalizeRecord(record),
      settledAt: null,
      lastSyncedAt: record.lastSyncedAt,
    };
  }

  // For NBA Goose (quarter ATS progression system)
  const ungradeable = actionable && isGooseRecordUngradeable(record);
  const settled = actionable && !ungradeable && record.sequenceResult != null && record.sequenceResult !== "pending";
  const outcome: SystemQualifierOutcome = actionable
    ? (settled && (record.sequenceResult === "win" || record.sequenceResult === "loss" || record.sequenceResult === "push")
      ? record.sequenceResult
      : ungradeable
        ? "ungradeable"
        : "pending")
    : "not_applicable";
  const settlementStatus: SystemQualifierSettlementStatus = actionable
    ? (settled ? "settled" : ungradeable ? "ungradeable" : "pending")
    : "not_applicable";
  return {
    id: `${system.id}:${record.id}`,
    systemId: system.id,
    systemSlug: system.slug,
    systemName: system.name,
    gameDate: record.gameDate,
    loggedAt: record.lastSyncedAt || new Date().toISOString(),
    qualifierId: record.id,
    recordKind: record.recordKind === "alert" || record.recordKind === "progression" ? record.recordKind : "qualifier",
    matchup: record.matchup,
    roadTeam: record.roadTeam,
    homeTeam: record.homeTeam,
    qualifiedTeam: record.qualifiedTeam || null,
    opponentTeam: record.opponentTeam || null,
    marketType: record.marketType || null,
    actionLabel: actionable ? `${system.name} flat 1u qualifier` : null,
    actionSide: actionable ? (record.qualifiedTeam || record.roadTeam || null) : null,
    flatStakeUnits: 1,
    settlementStatus,
    outcome,
    netUnits: actionable
      ? (record.sequenceResult === "win" ? 1 : record.sequenceResult === "loss" ? -1 : record.sequenceResult === "push" ? 0 : null)
      : null,
    source: record.source,
    notes: record.notes,
    recordSnapshot: normalizeRecord(record),
    settledAt: settled ? (record.lastSyncedAt || new Date().toISOString()) : null,
    lastSyncedAt: record.lastSyncedAt,
  };
}

function upsertSystemQualificationLog(data: SystemsTrackingData, system: TrackedSystem) {
  const retained = (data.qualificationLog || []).filter((entry) => entry.systemId !== system.id);
  const fresh = system.records
    .filter((record) => {
      if (!systemHasActionableTracking(system)) return true;
      if (record.recordKind === "progression") return true;
      if (record.marketType === "total" || record.marketType === "f5-total") return true;
      return Boolean(record.qualifiedTeam);
    })
    .map((record) => buildQualificationLogEntry(system, record));
  data.qualificationLog = [...retained, ...fresh].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate)
      || left.systemName.localeCompare(right.systemName)
      || left.matchup.localeCompare(right.matchup)
      || left.qualifierId.localeCompare(right.qualifierId);
  });
}

function getSystemPerformanceSummary(system: TrackedSystem, data?: SystemsTrackingData): SystemPerformanceSummary {
  const actionable = systemHasActionableTracking(system);
  const log = (data?.qualificationLog || []).filter((entry) => entry.systemId === system.id);
  const relevant = actionable
    ? log.filter((entry) => entry.settlementStatus !== "not_applicable")
    : [];
  const wins = relevant.filter((entry) => entry.outcome === "win").length;
  const losses = relevant.filter((entry) => entry.outcome === "loss").length;
  const pushes = relevant.filter((entry) => entry.outcome === "push").length;
  const pending = relevant.filter((entry) => entry.outcome === "pending").length;
  const ungradeable = relevant.filter((entry) => entry.outcome === "ungradeable").length;
  const gradedQualifiers = wins + losses + pushes;
  const flatNetUnits = gradedQualifiers > 0
    ? Number(relevant.reduce((total, entry) => total + (entry.netUnits ?? 0), 0).toFixed(2))
    : null;
  return {
    qualifiersLogged: log.length,
    gradedQualifiers,
    wins,
    losses,
    pushes,
    pending,
    ungradeable,
    record: actionable ? `${wins}-${losses}-${pushes}` : "qualifier-only",
    winPct: actionable && wins + losses > 0 ? wins / (wins + losses) : null,
    flatNetUnits,
    actionable,
  };
}

async function writeSystemsTrackingData(data: SystemsTrackingData) {
  await ensureStore();
  for (const system of data.systems) {
    upsertSystemQualificationLog(data, system);
  }
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

  // Supabase persistence — await so refresh callers see consistent DB-backed state
  const actionableEntries = (data.qualificationLog || []).filter(
    (entry) => entry.settlementStatus !== "not_applicable",
  );
  if (actionableEntries.length > 0) {
    try {
      await upsertSystemQualifiers(actionableEntries);
    } catch (err) {
      console.warn("[systems-tracking] Supabase upsert failed (graceful skip):", err instanceof Error ? err.message : err);
    }
  }
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
  const system = getTrackedSystem(data, NBA_GOOSE_SYSTEM_ID, defaultGooseSystem);
  system.records = system.records.map((record) => normalizeGooseRecord(record));
  return system;
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

function isNumericId(value?: string | null) {
  return Boolean(value && /^\d+$/.test(value));
}

function normalizeTeamLabel(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGooseRecord(record: SystemTrackingRecord) {
  const closingSpread = typeof record.closingSpread === "number" ? record.closingSpread : null;
  const qualifiedTeam = record.qualifiedTeam || (closingSpread !== null && closingSpread < 0 ? record.roadTeam : null);
  const opponentTeam = record.opponentTeam || (qualifiedTeam ? (qualifiedTeam === record.roadTeam ? record.homeTeam : record.roadTeam) : null);
  return normalizeRecord({
    ...record,
    recordKind: "progression",
    espnEventId: record.espnEventId ?? (isNumericId(record.oddsEventId) ? record.oddsEventId : null),
    qualifiedTeam,
    opponentTeam,
  });
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
  const ungradeableRows = system.records.filter((record) => isGooseRecordUngradeable(record));

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
      ? `Settled from ESPN quarter linescores for ${completedRows.length} stored sequence${completedRows.length === 1 ? "" : "s"}.${ungradeableRows.length ? ` ${ungradeableRows.length} final row${ungradeableRows.length === 1 ? " is" : "s are"} explicitly ungradeable because a required quarter line or score is still missing.` : ""}`
      : ungradeableRows.length > 0
        ? `${ungradeableRows.length} final row${ungradeableRows.length === 1 ? " is" : "s are"} explicitly ungradeable because a required quarter line or score is still missing.`
        : hasQualifiedRows
          ? "Qualifiers exist, but at least one required quarter score or quarter line is still missing or still waiting on game completion."
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function summarizeFalconsScore(score: number) {
  if (score >= 75) return "strong alert";
  if (score >= 60) return "qualified";
  return "thin qualifier";
}

function scoreFalconsQualifier(input: {
  starterEra: number | null;
  currentMoneyline: number;
  inningsPitched: number;
  earnedRuns: number;
  hitsAllowed: number;
  lineupStatus?: string | null;
  weatherSummary?: string | null;
  parkFactorSummary?: string | null;
  bullpenSummary?: string | null;
  f5Summary?: string | null;
}) {
  let score = 50;
  const components: string[] = [];

  const damagePoints = clamp((input.earnedRuns - 4) * 6, 0, 18)
    + clamp((input.hitsAllowed - 7) * 2, 0, 8)
    + (input.inningsPitched < 4 ? 8 : input.inningsPitched < 5 ? 3 : 0);
  if (damagePoints > 0) {
    score += damagePoints;
    components.push(`prior-start damage +${damagePoints.toFixed(0)} (${input.earnedRuns} ER, ${input.hitsAllowed} H, ${input.inningsPitched.toFixed(1)} IP)`);
  }

  if (input.starterEra != null) {
    const eraPoints = clamp((4.5 - input.starterEra) * 4, 0, 10);
    if (eraPoints > 0) {
      score += eraPoints;
      components.push(`listed ERA support +${eraPoints.toFixed(0)} (${input.starterEra.toFixed(2)})`);
    }
  } else {
    components.push("listed ERA missing (no score change)");
  }

  const absMoneyline = Math.abs(input.currentMoneyline);
  let pricePoints = 0;
  if (input.currentMoneyline >= -125 && input.currentMoneyline <= 110) pricePoints = 8;
  else if (input.currentMoneyline >= -135 && input.currentMoneyline <= 125) pricePoints = 5;
  else if (absMoneyline <= 140) pricePoints = 2;
  score += pricePoints;
  components.push(`market band +${pricePoints} (${input.currentMoneyline > 0 ? "+" : ""}${input.currentMoneyline})`);

  const lineupText = String(input.lineupStatus || "").toLowerCase();
  if (lineupText.includes("official")) {
    score += 6;
    components.push("official lineup context +6");
  } else if (lineupText.includes("partial")) {
    score += 2;
    components.push("partial lineup context +2");
  } else {
    components.push("lineup unconfirmed (no score boost)");
  }

  const parkText = String(input.parkFactorSummary || "").toLowerCase();
  if (parkText.includes("hitter") || parkText.includes("boost") || parkText.includes("favors hitters")) {
    score += 4;
    components.push("park context +4");
  }

  const weatherText = String(input.weatherSummary || "").toLowerCase();
  if (weatherText.includes("wind out") || weatherText.includes("warming") || weatherText.includes("hot")) {
    score += 3;
    components.push("weather context +3");
  }

  const bullpenText = String(input.bullpenSummary || "").toLowerCase();
  if (bullpenText.includes("high fatigue")) {
    score += 4;
    components.push("bullpen fatigue context +4");
  } else if (bullpenText.includes("moderate fatigue")) {
    score += 2;
    components.push("bullpen fatigue context +2");
  }

  const f5Text = String(input.f5Summary || "").toLowerCase();
  if (f5Text.includes("available")) {
    score += 1;
    components.push("F5 market posted +1");
  }

  const finalScore = Math.round(clamp(score, 0, 100));
  return {
    score: finalScore,
    label: summarizeFalconsScore(finalScore),
    components,
  };
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

  const scoredRows = system.records.filter((record) => typeof record.falconsScore === "number");
  const averageScore = scoredRows.length
    ? Math.round(scoredRows.reduce((sum, record) => sum + (record.falconsScore || 0), 0) / scoredRows.length)
    : null;

  system.automationStatusLabel = qualifiers > 0 ? "Live qualifier tracking + weighted alert rows" : "Nightly QA required — no Falcons qualifiers";
  system.automationStatusDetail = qualifiers > 0
    ? `${qualifiers} MLB qualifier${qualifiers === 1 ? "" : "s"} stored. Avg Falcons score ${averageScore ?? "-"}/100. ${withEra} with listed ERA, ${withMoneyline} with captured moneyline, ${withLineups} with lineup context, ${withWeather} with weather, ${withParkFactors} with park context, ${withBullpen} with bullpen context, and ${withF5} checked for F5 availability.`
    : "No Falcons qualifiers stored tonight. Run QA on starter availability, prior-start damage gate, moneyline band, and odds matching before calling this system healthy.";
}

function applySimpleWatchlistReadiness(system: TrackedSystem) {
  const qualifiers = system.records.length;
  system.status = "awaiting_verification";
  system.trackabilityBucket = "blocked_missing_data";
  system.automationStatusLabel = qualifiers > 0 ? "Off pending rulebook" : "Off";
  system.automationStatusDetail = qualifiers > 0
    ? `${qualifiers} internal qualifier row${qualifiers === 1 ? " exists" : "s exist"}, but this system stays off until bet direction and grading logic are defined honestly.`
    : "System is off until a real bet-direction rule and grading path are defined.";
}

function applyTonysHotBatsReadiness(system: TrackedSystem) {
  const rows = system.records.length;
  const officialLineups = system.records.filter((record) => record.lineupStatus === "official").length;
  const partialLineups = system.records.filter((record) => record.lineupStatus === "partial").length;
  const triggeredRows = system.records.filter((record) => record.recordKind === "qualifier").length;
  const contextRows = system.records.filter((record) => record.recordKind === "alert").length;
  const weatherReady = system.records.filter((record) => record.weatherSummary && record.weatherSummary !== "Weather context unavailable.").length;
  const parkReady = system.records.filter((record) => record.parkFactorSummary && !record.parkFactorSummary.toLowerCase().includes("missing")).length;
  const bullpenReady = system.records.filter((record) => record.bullpenSummary && !record.bullpenSummary.toLowerCase().includes("unavailable")).length;
  const marketReady = system.records.filter((record) => record.marketType || record.currentMoneyline != null || record.f5Summary).length;
  const recentOffenseReady = system.records.filter((record) => record.notes?.includes("Recent offense trigger:")).length;

  system.status = rows > 0 ? "tracking" : "awaiting_verification";
  system.trackabilityBucket = triggeredRows > 0 ? "trackable_now" : "blocked_missing_data";
  system.automationStatusLabel = triggeredRows > 0 ? "Live system picks" : rows > 0 ? "Context board live" : "Off";
  system.automationStatusDetail = rows > 0
    ? `${rows} MLB game row${rows === 1 ? "" : "s"} stored. ${triggeredRows} system pick${triggeredRows === 1 ? "" : "s"}, ${contextRows} context row${contextRows === 1 ? "" : "s"}, ${officialLineups} official lineup${officialLineups === 1 ? "" : "s"}, ${partialLineups} partial lineup${partialLineups === 1 ? "" : "s"}, ${recentOffenseReady} with recent-offense scoring, ${weatherReady} with weather, ${parkReady} with park factor, ${bullpenReady} with bullpen context, ${marketReady} with posted market context.`
    : "System is off until official lineup context, price discipline, and validation support a real live picks rule.";

  const lineupRequirement = findRequirement(system, "Official lineup status");
  if (lineupRequirement) {
    lineupRequirement.status = officialLineups > 0 ? "ready" : partialLineups > 0 || rows > 0 ? "partial" : "pending";
    lineupRequirement.detail = officialLineups > 0
      ? `${officialLineups} stored row${officialLineups === 1 ? " has" : "s have"} an official batting order from the MLB live feed.`
      : rows > 0
        ? "The board is loading lineup status, but today's games are still partial/unconfirmed in MLB's live feed."
        : "No same-day MLB board has been stored yet.";
  }

  const topOrderRequirement = findRequirement(system, "Top-of-order hitter game logs");
  if (topOrderRequirement) {
    topOrderRequirement.status = recentOffenseReady > 0 ? "ready" : officialLineups > 0 ? "partial" : rows > 0 ? "partial" : "pending";
    topOrderRequirement.detail = recentOffenseReady > 0
      ? `${recentOffenseReady} stored row${recentOffenseReady === 1 ? " includes" : "s include"} recent top-of-order hitter scoring built from MLB game logs.`
      : officialLineups > 0
        ? "Official lineups exist, but recent hitter sample thresholds did not produce a scored live trigger yet."
        : rows > 0
          ? "The game board exists, but hitter-log scoring cannot finalize until MLB exposes official lineup IDs."
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

  const validationRequirement = findRequirement(system, "Price discipline / validation layer");
  if (validationRequirement) {
    validationRequirement.status = triggeredRows > 0 ? "ready" : rows > 0 ? "partial" : "pending";
    validationRequirement.detail = triggeredRows > 0
      ? "Triggered rows now count as live moneyline system picks and must persist into qualifier history for grading. Further price-history discipline can still improve the model."
      : rows > 0
        ? "Context rows are live, but no qualified side has fired yet. When one does, it must persist and grade as a moneyline system pick."
        : "No same-day MLB board has been stored yet.";
  }
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSignedNumber(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function extractBullpenFatigueLevel(summary: string | null | undefined) {
  const text = String(summary || "").toLowerCase();
  if (text.includes("high fatigue")) return "high" as const;
  if (text.includes("moderate fatigue")) return "moderate" as const;
  return "low" as const;
}

async function getRecentHitterProduction(playerId: string) {
  const numericId = Number(playerId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return { games: 0, hitsPerGame: 0, totalBasesPerGame: 0, runsRbiPerGame: 0 };
  }

  const season = new Date().getFullYear();
  const logs = await getMLBPlayerGameLog(numericId, season, "hitting");
  const sample = logs.slice(0, 10);
  if (!sample.length) {
    return { games: 0, hitsPerGame: 0, totalBasesPerGame: 0, runsRbiPerGame: 0 };
  }

  return {
    games: sample.length,
    hitsPerGame: Number((average(sample.map((log) => log.hits || 0))).toFixed(2)),
    totalBasesPerGame: Number((average(sample.map((log) => log.totalBases || 0))).toFixed(2)),
    runsRbiPerGame: Number((average(sample.map((log) => (log.runs || 0) + (log.rbis || 0)))).toFixed(2)),
  };
}

async function buildTonysHotBatsTrigger(game: any) {
  const lineupSides = [game?.lineups?.away, game?.lineups?.home].filter(Boolean);
  const officialSides = lineupSides.filter((side: any) => side?.status === "official");
  if (!officialSides.length) return null;

  const candidates = await Promise.all(officialSides.map(async (side: any) => {
    const topFour = Array.isArray(side?.players) ? side.players.slice(0, 4) : [];
    const playerStats = await Promise.all(topFour.map(async (player: any) => ({
      player,
      stats: await getRecentHitterProduction(String(player?.playerId || "")),
    })));
    const qualifiedStats = playerStats.filter((entry) => entry.stats.games >= 5);
    if (qualifiedStats.length < 3) return null;

    const avgHits = average(qualifiedStats.map((entry) => entry.stats.hitsPerGame));
    const avgTotalBases = average(qualifiedStats.map((entry) => entry.stats.totalBasesPerGame));
    const avgRunsRbi = average(qualifiedStats.map((entry) => entry.stats.runsRbiPerGame));

    const weather = game?.weather;
    const weatherBoost = weather?.status === "available"
      && typeof weather?.forecast?.temperatureF === "number"
      && weather.forecast.temperatureF >= 72
      && typeof weather?.forecast?.windSpeedMph === "number"
      && weather.forecast.windSpeedMph <= 15;
    const park = game?.parkFactor;
    const parkBoost = park?.status === "available" && typeof park?.metrics?.runs === "number" && park.metrics.runs >= 102;
    const opponentEntry = side?.teamAbbrev === game?.matchup?.away?.abbreviation ? game?.matchup?.home : game?.matchup?.away;
    const bullpenLevel = extractBullpenFatigueLevel(opponentEntry?.bullpen?.summary);
    const bullpenBoost = bullpenLevel !== "low";

    const qualifies = avgHits >= 1.0 && avgTotalBases >= 1.6 && avgRunsRbi >= 0.55 && (weatherBoost || parkBoost || bullpenBoost);
    const supportCount = [weatherBoost, parkBoost, bullpenBoost].filter(Boolean).length;
    const score = Math.round(Math.min(100,
      avgHits * 22
      + avgTotalBases * 16
      + avgRunsRbi * 18
      + supportCount * 8
      + (qualifiedStats.length >= 4 ? 4 : 0)
    ));

    return {
      teamAbbrev: side.teamAbbrev,
      qualifies,
      score,
      qualifiedStats,
      avgHits: Number(avgHits.toFixed(2)),
      avgTotalBases: Number(avgTotalBases.toFixed(2)),
      avgRunsRbi: Number(avgRunsRbi.toFixed(2)),
      weatherBoost,
      parkBoost,
      bullpenBoost,
      bullpenLevel,
      supportCount,
    };
  }));

  const ranked = candidates.filter(Boolean).sort((a: any, b: any) => (b?.score || 0) - (a?.score || 0));
  const winner = ranked.find((entry: any) => entry?.qualifies) || null;
  if (!winner) return null;

  const topHitters = winner.qualifiedStats.map((entry: any) => {
    const name = entry.player?.name || "Unknown";
    return `${name} (${entry.stats.games}g: ${entry.stats.hitsPerGame.toFixed(2)} H/G, ${entry.stats.totalBasesPerGame.toFixed(2)} TB/G, ${entry.stats.runsRbiPerGame.toFixed(2)} R+RBI/G)`;
  });

  const reasons = [
    `Top-of-order avg ${winner.avgHits.toFixed(2)} H/G`,
    `${winner.avgTotalBases.toFixed(2)} TB/G`,
    `${winner.avgRunsRbi.toFixed(2)} R+RBI/G`,
  ];
  if (winner.parkBoost) reasons.push("hitter-friendly park");
  if (winner.weatherBoost) reasons.push("supportive weather");
  if (winner.bullpenBoost) reasons.push(`${winner.teamAbbrev === game?.matchup?.away?.abbreviation ? game?.matchup?.home?.abbreviation : game?.matchup?.away?.abbreviation} bullpen ${winner.bullpenLevel} fatigue`);

  return {
    teamAbbrev: winner.teamAbbrev,
    score: winner.score,
    label: winner.score >= 75 ? "Strong early trigger" : winner.score >= 62 ? "Live early trigger" : "Borderline early trigger",
    topHitters,
    rationale: reasons.join(" • "),
  };
}

function getTeamPerspectiveSpread(event: AggregatedOdds, teamAbbrev: string) {
  if (teamAbbrev === event.awayAbbrev) return event.bestAwaySpread?.line ?? null;
  if (teamAbbrev === event.homeAbbrev) return event.bestHomeSpread?.line ?? null;
  return null;
}

function getEventTotalLine(event: AggregatedOdds) {
  return event.bestOver?.line ?? event.bestUnder?.line ?? null;
}
function getNHLMoneylineForTeam(event: AggregatedOdds, teamAbbrev: string) {
  if (teamAbbrev === event.awayAbbrev) return event.bestAway;
  if (teamAbbrev === event.homeAbbrev) return event.bestHome;
  return null;
}

function summarizeSwaggyGoalie(entry: NHLContextTeamBoardEntry) {
  const starter = entry.sourced.goalie.starter;
  if (!starter) return "starter unavailable";
  const status = starter.status === "confirmed" ? "confirmed" : starter.status === "probable" ? "probable" : "tbd";
  return `${starter.name} (${status}${starter.isBackup ? ", backup" : ""})`;
}

function formatMoneyline(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "-";
  return `${price > 0 ? "+" : ""}${price}`;
}

function buildSwaggyQualifierRecord(input: {
  boardGame: NHLContextBoardGame;
  qualified: NHLContextTeamBoardEntry;
  opponent: NHLContextTeamBoardEntry;
  event: AggregatedOdds;
  currentMoneyline: number;
  moneylineBook: string | null;
}) {
  const xg = input.qualified.sourced.moneyPuck?.xGoalsPercentage ?? null;
  const oppXg = input.opponent.sourced.moneyPuck?.xGoalsPercentage ?? null;
  const xgEdge = xg != null && oppXg != null ? Number((xg - oppXg).toFixed(3)) : null;
  const qualifiedGoalie = summarizeSwaggyGoalie(input.qualified);
  const opponentGoalie = summarizeSwaggyGoalie(input.opponent);
  const totalLine = getEventTotalLine(input.event);

  const availabilityFlags = [
    ...input.qualified.derived.news.labels,
    ...input.opponent.derived.news.labels,
  ];

  // PP efficiency context
  const ppEff = input.qualified.derived.ppEfficiency;
  const ppEffNote = ppEff.ppEfficiencyDifferential != null
    ? `PP eff diff ${ppEff.ppEfficiencyDifferential > 0 ? '+' : ''}${ppEff.ppEfficiencyDifferential.toFixed(3)} (${ppEff.tier})${ppEff.netSpecialTeamsDifferential != null ? ` • net ST ${ppEff.netSpecialTeamsDifferential > 0 ? '+' : ''}${ppEff.netSpecialTeamsDifferential.toFixed(3)}` : ''}.`
    : `PP efficiency: ${ppEff.note || 'unavailable'}.`;

  // Goalie strength splits context
  const goalieStrength = input.qualified.derived.goalie.strengthSplits;
  const goalieStrengthNote = goalieStrength
    ? `Opp goalie SV%: EV ${goalieStrength.evSavePct.toFixed(3)}, PP ${goalieStrength.ppSavePct.toFixed(3)} (${goalieStrength.ppShotsAgainst} PA).`
    : null;

  // Injury context
  const injuryReport = input.qualified.sourced.injuries;
  const oppInjuryReport = input.opponent.sourced.injuries;
  const injuryNote = (injuryReport.confirmedOutCount > 0 || injuryReport.dayToDayCount > 0 || oppInjuryReport.confirmedOutCount > 0)
    ? `${input.qualified.teamAbbrev} injuries: ${injuryReport.confirmedOutCount} confirmed out, ${injuryReport.dayToDayCount} DTD. ${input.opponent.teamAbbrev}: ${oppInjuryReport.confirmedOutCount} confirmed out, ${oppInjuryReport.dayToDayCount} DTD.`
    : null;

  const notes = [
    'Qualifier alert only — not an official pick or backtest claim.',
    `${input.qualified.teamAbbrev} urgency ${input.qualified.derived.playoffPressure.urgencyTier} vs ${input.opponent.teamAbbrev} ${input.opponent.derived.playoffPressure.urgencyTier}.`,
    `MoneyPuck xG% ${xg != null ? xg.toFixed(3) : '—'} vs ${oppXg != null ? oppXg.toFixed(3) : '—'}${xgEdge != null ? ` (edge ${xgEdge > 0 ? '+' : ''}${xgEdge.toFixed(3)})` : ''}.`,
    ppEffNote,
    `${input.qualified.teamAbbrev} fatigue ${input.qualified.derived.fatigueScore ?? '—'} vs ${input.opponent.teamAbbrev} ${input.opponent.derived.fatigueScore ?? '—'}.`,
    `${input.qualified.teamAbbrev} goalie ${qualifiedGoalie}; ${input.opponent.teamAbbrev} goalie ${opponentGoalie}.`,
    goalieStrengthNote,
    `${input.qualified.teamAbbrev} ML ${formatMoneyline(input.currentMoneyline)}${input.moneylineBook ? ` (${input.moneylineBook})` : ''}${totalLine != null ? ` • total ${totalLine}` : ''}.`,
    injuryNote,
    availabilityFlags.length ? `Official availability/news tags: ${Array.from(new Set(availabilityFlags)).join(', ')}.` : 'Official-team news remains supporting context only.',
    input.qualified.sourced.news.items[0]?.title ? `Official news: ${input.qualified.sourced.news.items[0].title}` : 'Official-team news remains supporting context only.',
  ].filter(Boolean) as string[];

  return normalizeRecord({
    id: `${SWAGGY_STRETCH_DRIVE_SYSTEM_ID}:${input.boardGame.gameId}:${input.qualified.teamAbbrev}`,
    gameId: String(input.boardGame.gameId),
    oddsEventId: input.event.oddsApiEventId ?? null,
    gameDate: input.boardGame.gameDate,
    matchup: `${input.boardGame.matchup.awayTeam.abbrev} @ ${input.boardGame.matchup.homeTeam.abbrev}`,
    roadTeam: input.boardGame.matchup.awayTeam.abbrev,
    homeTeam: input.boardGame.matchup.homeTeam.abbrev,
    recordKind: 'qualifier',
    marketType: 'moneyline',
    alertLabel: 'Tracked qualifier / system alert',
    sourceHealthStatus: availabilityFlags.length ? "healthy" : "degraded",
    freshnessSummary: availabilityFlags.length ? `Official availability approximation tags present: ${Array.from(new Set(availabilityFlags)).join(", ")}.` : "No official availability tags extracted from team-site links for this matchup.",
    currentMoneyline: input.currentMoneyline,
    marketAvailability: totalLine != null ? `Moneyline + total posted${input.moneylineBook ? ` (${input.moneylineBook} best ML)` : ''}.` : `Moneyline posted${input.moneylineBook ? ` (${input.moneylineBook} best ML)` : ''}.`,
    qualifiedTeam: input.qualified.teamAbbrev,
    opponentTeam: input.opponent.teamAbbrev,
    xGoalsPercentage: xg,
    opponentXGoalsPercentage: oppXg,
    urgencyTier: input.qualified.derived.playoffPressure.urgencyTier,
    fatigueScore: input.qualified.derived.fatigueScore,
    opponentFatigueScore: input.opponent.derived.fatigueScore,
    goalieStatus: qualifiedGoalie,
    opponentGoalieStatus: opponentGoalie,
    totalLine,
    source: 'NHL standings + MoneyPuck snapshot + NHL API goalie/news context + aggregated NHL odds',
    notes: notes.join(' • '),
    lastSyncedAt: new Date().toISOString(),
  });
}

function qualifiesForSwaggy(entry: NHLContextTeamBoardEntry, opponent: NHLContextTeamBoardEntry, price: number | null) {
  if (entry.derived.playoffPressure.urgencyTier !== 'high') return false;
  if (opponent.derived.playoffPressure.urgencyTier === 'high') return false;

  const xg = entry.sourced.moneyPuck?.xGoalsPercentage ?? null;
  const oppXg = opponent.sourced.moneyPuck?.xGoalsPercentage ?? null;
  if (xg == null || oppXg == null) return false;
  if (xg < 0.515) return false;
  if (xg - oppXg < 0.02) return false;

  const starter = entry.sourced.goalie.starter;
  if (!starter) return false;
  if (starter.isBackup) return false;
  if (starter.status !== 'confirmed' && starter.status !== 'probable') return false;

  const fatigue = entry.derived.fatigueScore;
  const oppFatigue = opponent.derived.fatigueScore;
  if (fatigue != null && fatigue >= 55) return false;
  if (fatigue != null && oppFatigue != null && fatigue - oppFatigue >= 15) return false;

  if (typeof price !== 'number' || !Number.isFinite(price)) return false;
  if (price < -145 || price > 115) return false;

  return true;
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
    notes: `${qualifiedTeam} watchlist • ${marginLabel} on ${recentGame.date} • next vs ${opponentTeam} (${opponentStanding.winPct.toFixed(3)} win pct) • spread ${teamSpread ?? "-"}`,
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
    notes: `${event.awayTeam} last 5: ${awayWins}-1 (${awayStanding.winPct.toFixed(3)}) • ${event.homeTeam} last 5: ${homeWins}-1 (${homeStanding.winPct.toFixed(3)}) • total ${totalLine ?? "-"}`,
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
      gameCompleted: false,
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

  const competition = summary?.header?.competitions?.[0];
  const statusType = competition?.status?.type;
  const gameCompleted = statusType?.completed === true || statusType?.state === "post" || String(statusType?.description || "").toLowerCase() === "final";

  return {
    firstQuarterRoadScore: toScore(awayLinescores[0]),
    firstQuarterHomeScore: toScore(homeLinescores[0]),
    thirdQuarterRoadScore: toScore(awayLinescores[2]),
    thirdQuarterHomeScore: toScore(homeLinescores[2]),
    gameCompleted,
  };
}

function isGooseQualifier(event: AggregatedOdds) {
  const awaySpread = event.bestAwaySpread?.line;
  return typeof awaySpread === "number" && awaySpread <= -5.5;
}

function getGooseMarketNotePrefixes(event: AggregatedOdds) {
  const notes: string[] = [];
  if (event.bestAwaySpread?.book) notes.push(`FG ${event.bestAwaySpread.book}`);
  if (event.bestAwayFirstQuarterSpread?.book) notes.push(`1Q ${event.bestAwayFirstQuarterSpread.book}`);
  if (event.bestAwayThirdQuarterSpread?.book) notes.push(`3Q ${event.bestAwayThirdQuarterSpread.book}`);
  return notes;
}

function extractGooseStaticNotes(notes?: string | null) {
  return String(notes || "")
    .split(" • ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => (
      !/^awaiting espn [13]q score$/i.test(entry)
      && !/^final but espn [13]q score missing$/i.test(entry)
      && !/^[13]q line missing(?: after final)?$/i.test(entry)
      && !/^marked ungradeable until real quarter inputs exist$/i.test(entry)
    ));
}

function buildGooseRecordNotes(input: {
  prefixNotes?: string[];
  firstQuarterSpread: number | null;
  thirdQuarterSpread: number | null;
  scores: QuarterScores;
  bet1Result: TrackedBetResult;
  sequenceResult: SequenceResult;
}) {
  const notes = [...(input.prefixNotes || [])];
  const { scores, bet1Result, sequenceResult } = input;
  if (scores.firstQuarterRoadScore == null || scores.firstQuarterHomeScore == null) {
    notes.push(scores.gameCompleted ? "Final but ESPN 1Q score missing" : "Awaiting ESPN 1Q score");
  } else if (bet1Result === "loss" && (scores.thirdQuarterRoadScore == null || scores.thirdQuarterHomeScore == null)) {
    notes.push(scores.gameCompleted ? "Final but ESPN 3Q score missing" : "Awaiting ESPN 3Q score");
  }
  if (bet1Result === "loss" && input.thirdQuarterSpread == null) {
    notes.push(scores.gameCompleted ? "3Q line missing after final" : "3Q line missing");
  }
  if (input.firstQuarterSpread == null) {
    notes.push(scores.gameCompleted ? "1Q line missing after final" : "1Q line missing");
  }
  if (sequenceResult === "pending" && scores.gameCompleted) {
    notes.push("Marked ungradeable until real quarter inputs exist");
  }
  return notes.join(" • ");
}

function buildGooseProgressionRecord(record: Partial<SystemTrackingRecord>, scores: QuarterScores, notePrefixes: string[] = []) {
  const normalized = normalizeGooseRecord(normalizeRecord(record));
  const bet1Result = resolveSpreadResult(
    scores.firstQuarterRoadScore,
    scores.firstQuarterHomeScore,
    normalized.firstQuarterSpread ?? null,
  );
  const bet2Result = bet1Result === "loss"
    ? resolveSpreadResult(
        scores.thirdQuarterRoadScore,
        scores.thirdQuarterHomeScore,
        normalized.thirdQuarterSpread ?? null,
      )
    : null;
  const derived = deriveSequence(bet1Result, bet2Result);
  const finalSequenceResult = derived.sequenceResult === "pending" && scores.gameCompleted ? "pending" : derived.sequenceResult;
  const finalEstimatedNetUnits = finalSequenceResult == null ? null : derived.estimatedNetUnits;
  const missingBits = [
    normalized.firstQuarterSpread == null ? "1Q line" : null,
    bet1Result === "loss" && normalized.thirdQuarterSpread == null ? "3Q line" : null,
    scores.firstQuarterRoadScore == null || scores.firstQuarterHomeScore == null ? "1Q score" : null,
    bet1Result === "loss" && (scores.thirdQuarterRoadScore == null || scores.thirdQuarterHomeScore == null) ? "3Q score" : null,
  ].filter(Boolean) as string[];

  return normalizeGooseRecord({
    ...normalized,
    firstQuarterRoadScore: scores.firstQuarterRoadScore,
    firstQuarterHomeScore: scores.firstQuarterHomeScore,
    thirdQuarterRoadScore: scores.thirdQuarterRoadScore,
    thirdQuarterHomeScore: scores.thirdQuarterHomeScore,
    bet1Result,
    bet2Result,
    sequenceResult: finalSequenceResult,
    estimatedNetUnits: finalEstimatedNetUnits,
    sourceHealthStatus: missingBits.length ? "degraded" : "healthy",
    freshnessSummary: missingBits.length
      ? `${scores.gameCompleted ? "Final but missing settlement inputs" : "Missing settlement inputs"}: ${missingBits.join(", ")}.`
      : "Quarter lines and settlement inputs captured for current state.",
    notes: buildGooseRecordNotes({
      prefixNotes: notePrefixes,
      firstQuarterSpread: normalized.firstQuarterSpread ?? null,
      thirdQuarterSpread: normalized.thirdQuarterSpread ?? null,
      scores,
      bet1Result,
      sequenceResult: derived.sequenceResult,
    }),
    lastSyncedAt: new Date().toISOString(),
  });
}

function findEspnGameForGooseRecord(record: SystemTrackingRecord, games: NBAGame[]) {
  const targetDate = record.gameDate;
  const roadTeam = normalizeTeamLabel(record.roadTeam);
  const homeTeam = normalizeTeamLabel(record.homeTeam);
  return games.find((game) => (
    game.date === targetDate
    && normalizeTeamLabel(game.awayTeam.fullName) === roadTeam
    && normalizeTeamLabel(game.homeTeam.fullName) === homeTeam
  )) || null;
}

function resolveStoredGooseEspnEventId(record: SystemTrackingRecord, games: NBAGame[]) {
  if (record.espnEventId) return record.espnEventId;
  if (isNumericId(record.oddsEventId)) return record.oddsEventId!;
  return findEspnGameForGooseRecord(record, games)?.id || null;
}

function shouldBackfillGooseSettlement(record: SystemTrackingRecord, targetDate: string) {
  if (record.gameDate >= targetDate) return false;
  if (daysBetween(record.gameDate, targetDate) > GOOSE_SETTLEMENT_BACKFILL_LOOKBACK_DAYS) return false;
  return record.sequenceResult !== "win" && record.sequenceResult !== "loss" && record.sequenceResult !== "push";
}

async function backfillRecentGooseSettlements(records: SystemTrackingRecord[], targetDate: string) {
  const normalizedRecords = records.map((record) => normalizeGooseRecord(record));
  const candidates = normalizedRecords.filter((record) => shouldBackfillGooseSettlement(record, targetDate));
  if (candidates.length === 0) return normalizedRecords;

  const recentGames = await getRecentNBAGames(GOOSE_SETTLEMENT_BACKFILL_LOOKBACK_DAYS + 1);

  return Promise.all(normalizedRecords.map(async (record) => {
    if (!shouldBackfillGooseSettlement(record, targetDate)) return record;
    const espnEventId = resolveStoredGooseEspnEventId(record, recentGames);
    if (!espnEventId) return record;
    const scores = await getQuarterScores(espnEventId);
    return buildGooseProgressionRecord(
      {
        ...record,
        espnEventId,
      },
      scores,
      extractGooseStaticNotes(record.notes),
    );
  }));
}

async function buildGooseRecord(event: AggregatedOdds, espnEventId?: string | null): Promise<SystemTrackingRecord> {
  const scores = await getQuarterScores(espnEventId ?? null);
  return buildGooseProgressionRecord({
    id: `nba-goose:${event.gameId}`,
    gameId: event.gameId,
    oddsEventId: event.oddsApiEventId ?? null,
    espnEventId: espnEventId ?? null,
    gameDate: getEventDate(event.commenceTime),
    matchup: `${event.awayTeam} @ ${event.homeTeam}`,
    roadTeam: event.awayTeam,
    homeTeam: event.homeTeam,
    recordKind: "progression",
    closingSpread: event.bestAwaySpread?.line ?? null,
    firstQuarterSpread: event.bestAwayFirstQuarterSpread?.line ?? null,
    thirdQuarterSpread: event.bestAwayThirdQuarterSpread?.line ?? null,
    source: "The Odds API + ESPN summary",
  }, scores, getGooseMarketNotePrefixes(event));
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
      qualificationLog: Array.isArray(parsed?.qualificationLog)
        ? parsed.qualificationLog.map(normalizeQualificationLogEntry).filter(Boolean)
        : [],
    } as SystemsTrackingData;
    applyGooseReadiness(getGooseSystem(data));
    applySimpleWatchlistReadiness(getTheBlowoutSystem(data));
    applySimpleWatchlistReadiness(getHotTeamsMatchupSystem(data));
    applyFalconsFightPummeledPitchersReadiness(getFalconsFightPummeledPitchersSystem(data));
    applyTonysHotBatsReadiness(getTonysHotBatsSystem(data));
    applyRobbiesRipperFast5Readiness(getRobbiesRipperFast5System(data));
    for (const system of data.systems) {
      if (PARKED_SYSTEM_IDS.has(system.id)) {
        system.trackabilityBucket = "parked_definition_only";
        system.status = "paused";
        system.snapshot = system.snapshot || "Parked for deeper analysis. Not firing live.";
      }
      if (system.id === SWAGGY_STRETCH_DRIVE_SYSTEM_ID) {
        const qualifiers = system.records.length;
        const withMoneyline = system.records.filter((record) => record.currentMoneyline != null).length;
        const withXg = system.records.filter((record) => record.xGoalsPercentage != null && record.opponentXGoalsPercentage != null).length;
        const withGoalies = system.records.filter((record) => record.goalieStatus || record.opponentGoalieStatus).length;
        const withTotals = system.records.filter((record) => record.totalLine != null).length;
        system.status = qualifiers > 0 ? "tracking" : "awaiting_data";
        system.snapshot = qualifiers > 0
          ? `${qualifiers} Swaggy qualifier${qualifiers === 1 ? "" : "s"} stored.`
          : system.snapshot || "No Swaggy qualifiers met the current rule-gated screen.";
        system.automationStatusLabel = qualifiers > 0 ? "Live qualifier tracking + price discipline" : "Awaiting fresh qualifiers";
        system.automationStatusDetail = qualifiers > 0
          ? `${qualifiers} NHL qualifier${qualifiers === 1 ? "" : "s"} passed the urgency + MoneyPuck + goalie + fatigue + price screen. ${withMoneyline} stored with moneyline, ${withXg} with xG context, ${withGoalies} with goalie context, and ${withTotals} with posted totals context.`
          : "Refresh scans live NHL context and aggregated moneylines, then stores only teams that pass strict urgency, xG, goalie, fatigue, and price gates. No rows are created when the board does not qualify honestly.";
      }
      upsertSystemQualificationLog(data, system);
    }
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
      const triggeredRows = system.records.filter((record) => record.recordKind === "alert").length;
      const weatherRows = system.records.filter((record) => record.weatherSummary && record.weatherSummary !== "Weather context unavailable.").length;
      return `${metrics.qualifiedGames} MLB game${metrics.qualifiedGames === 1 ? "" : "s"} on board — ${triggeredRows} early trigger${triggeredRows === 1 ? "" : "s"}, ${officialLineups} official lineup${officialLineups === 1 ? "" : "s"}, ${weatherRows} with weather context.`;
    }
    return system.snapshot || "No tracked sample yet.";
  }

  if (system.id === SWAGGY_STRETCH_DRIVE_SYSTEM_ID) {
    if (metrics.qualifiedGames > 0) {
      const withXg = system.records.filter((record) => record.xGoalsPercentage != null).length;
      const withMoneyline = system.records.filter((record) => record.currentMoneyline != null).length;
      return `${metrics.qualifiedGames} Swaggy qualifier${metrics.qualifiedGames === 1 ? "" : "s"} — ${withXg} with xG edge, ${withMoneyline} with live price.`;
    }
    return system.snapshot || "No Swaggy qualifiers met the rule-gated screen.";
  }

  if (system.id === FALCONS_FIGHT_PUMMELED_PITCHERS_SYSTEM_ID) {
    if (metrics.qualifiedGames > 0) {
      const scoredRows = system.records.filter((record) => typeof record.falconsScore === "number");
      const avgScore = scoredRows.length
        ? Math.round(scoredRows.reduce((sum, r) => sum + (r.falconsScore ?? 0), 0) / scoredRows.length)
        : null;
      const strongAlerts = scoredRows.filter((r) => (r.falconsScore ?? 0) >= 75).length;
      return `${metrics.qualifiedGames} Falcons qualifier${metrics.qualifiedGames === 1 ? "" : "s"}${avgScore != null ? ` — avg score ${avgScore}/100` : ""}${strongAlerts > 0 ? `, ${strongAlerts} strong alert${strongAlerts === 1 ? "" : "s"}` : ""}.`;
    }
    return system.snapshot || "No Falcons qualifiers met the current screen.";
  }

  if (system.id === THE_BLOWOUT_SYSTEM_ID) {
    if (metrics.qualifiedGames > 0) {
      const withSpread = system.records.filter((record) => record.closingSpread != null).length;
      return `${metrics.qualifiedGames} Blowout watchlist qualifier${metrics.qualifiedGames === 1 ? "" : "s"} — ${withSpread} with spread context.`;
    }
    return system.snapshot || "No Blowout qualifiers today.";
  }

  if (system.id === HOT_TEAMS_MATCHUP_SYSTEM_ID) {
    if (metrics.qualifiedGames > 0) {
      const withTotal = system.records.filter((record) => record.totalLine != null).length;
      return `${metrics.qualifiedGames} Hot Teams matchup${metrics.qualifiedGames === 1 ? "" : "es"} — ${withTotal} with posted total.`;
    }
    return system.snapshot || "No Hot Teams collisions today.";
  }

  if (system.progressionLogic.length === 0) {
    if (metrics.qualifiedGames > 0) {
      const moneylineRows = system.records.filter((record) => record.currentMoneyline != null).length;
      return `${metrics.qualifiedGames} qualifier${metrics.qualifiedGames === 1 ? "" : "s"} stored${moneylineRows ? `, ${moneylineRows} with live moneyline context` : ""}.`;
    }
    return system.snapshot || "No tracked sample yet.";
  }

  // Progression system (e.g. NBA Goose)
  if (metrics.completedSequences > 0 && metrics.sequenceWinRate != null) {
    const netStr = metrics.estimatedNetUnits != null
      ? ` (net ${metrics.estimatedNetUnits > 0 ? "+" : ""}${metrics.estimatedNetUnits.toFixed(1)}u)`
      : "";
    return `${(metrics.sequenceWinRate * 100).toFixed(1)}% seq win rate across ${metrics.completedSequences} settled${netStr} • ${metrics.stepOneWinRate != null ? `${(metrics.stepOneWinRate * 100).toFixed(1)}% 1Q win rate` : ""} • ${metrics.rescueRate != null ? `${(metrics.rescueRate * 100).toFixed(1)}% rescue rate` : ""}.`;
  }
  if (metrics.qualifiedGames > 0) {
    return `${metrics.qualifiedGames} qualifier${metrics.qualifiedGames === 1 ? "" : "s"} stored${metrics.trackableGames ? `, ${metrics.trackableGames} with full quarter-line coverage` : ""}.`;
  }
  return system.snapshot || "No tracked sample yet.";
}

function getTrackableSystems(data: SystemsTrackingData) {
  return data.systems.filter((system) => {
    if (!SYSTEM_TRACKERS[system.id]) return false;
    if (PARKED_SYSTEM_IDS.has(system.id)) return false;
    const templateBucket = SYSTEM_TEMPLATE_MAP.get(system.id)?.trackabilityBucket;
    return system.trackabilityBucket === "trackable_now" || templateBucket === "trackable_now";
  });
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

  system.records = await backfillRecentGooseSettlements([...priorRecords, ...freshRecords], targetDate);
  system.records = system.records.sort((left, right) => {
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
  qualifiedTeam: string;
  opponentTeam: string;
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
  const falconsScore = scoreFalconsQualifier({
    starterEra: input.starterEra,
    currentMoneyline: input.currentMoneyline,
    inningsPitched: input.inningsPitched,
    earnedRuns: input.earnedRuns,
    hitsAllowed: input.hitsAllowed,
    lineupStatus: input.lineupStatus,
    weatherSummary: input.weatherSummary,
    parkFactorSummary: input.parkFactorSummary,
    bullpenSummary: input.bullpenSummary,
    f5Summary: input.f5Summary,
  });

  const notes = [
    `System pick qualifier — if this row fires, it is a real tracked system pick.`,
    `Falcons score ${falconsScore.score}/100 (${falconsScore.label}).`,
    `Prior start ${input.priorGameDate}: ${formatPitchingSummary(priorStats)}${pummeledReasons.length ? ` (${pummeledReasons.join(", ")})` : ""}.`,
    input.starterEra != null ? `Listed ERA ${input.starterEra.toFixed(2)}.` : "Listed ERA unavailable from probable-starter feed.",
    `Current moneyline ${input.currentMoneyline > 0 ? "+" : ""}${input.currentMoneyline}${input.moneylineBook ? ` (${input.moneylineBook})` : ""}.`,
    input.lineupStatus || "Lineup status unavailable.",
    input.weatherSummary || "Weather context unavailable.",
    input.parkFactorSummary || "Park-factor context unavailable.",
    input.bullpenSummary || "Bullpen context unavailable.",
    input.f5Summary || "F5 market context unavailable.",
    `Score components: ${falconsScore.components.join("; ")}.`,
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
    qualifiedTeam: input.qualifiedTeam,
    opponentTeam: input.opponentTeam,
    alertLabel: "Tracked qualifier / system alert",
    starterName: input.starterName,
    starterEra: input.starterEra,
    currentMoneyline: input.currentMoneyline,
    falconsScore: falconsScore.score,
    falconsScoreLabel: falconsScore.label,
    falconsScoreComponents: falconsScore.components,
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
  const freshRecords: SystemTrackingRecord[] = [];

  for (const game of (board.games ?? [])) {
    const lineupStatuses = [game?.lineups?.away?.status, game?.lineups?.home?.status].filter(Boolean);
    const officialCount = lineupStatuses.filter((status: string) => status === "official").length;
    const partialCount = lineupStatuses.filter((status: string) => status === "partial").length;
    const lineupStatus = officialCount === 2
      ? "official"
      : officialCount > 0 || partialCount > 0
        ? "partial"
        : "unconfirmed";
    const lineupStatusDetail = officialCount === 2
      ? "Both lineups official in MLB live feed."
      : officialCount > 0
        ? `${officialCount} lineup official, ${partialCount} partial, remainder unconfirmed.`
        : partialCount > 0
          ? `${partialCount} lineup partial, remainder unconfirmed.`
          : "Both lineups still unconfirmed in MLB live feed.";

    const weatherSummary = summarizeWeather(game?.weather?.forecast ? {
      ...game.weather.forecast,
      note: game?.weather?.note,
    } : game?.weather);
    const parkFactorSummary = summarizeParkFactor(game?.parkFactor);
    const bullpenSummary = [
      `${game?.matchup?.away?.abbreviation || "Away"}: ${summarizeBullpen(game?.matchup?.away)}`,
      `${game?.matchup?.home?.abbreviation || "Home"}: ${summarizeBullpen(game?.matchup?.home)}`,
    ].join(" • ");
    const marketAvailability = summarizeMarketAvailability(game);
    const currentMoneyline = null;
    const totalLine = typeof game?.markets?.f5?.total?.line === "number" ? game.markets.f5.total.line : null;
    const f5Summary = typeof game?.markets?.f5?.completeness === "string"
      ? `F5 ${game.markets.f5.completeness}${Array.isArray(game?.markets?.f5?.supportedMarkets) && game.markets.f5.supportedMarkets.length ? ` (${game.markets.f5.supportedMarkets.join(", ")})` : ""}.`
      : "F5 market context unavailable.";
    const trigger = await buildTonysHotBatsTrigger(game);

    const notes = [
      trigger
        ? `Recent offense trigger: ${trigger.teamAbbrev} • score ${trigger.score}/100 • ${trigger.label}`
        : "No early trigger qualified from the confirmed top-of-order sample.",
      `Lineups: ${lineupStatusDetail}`,
      `Weather: ${weatherSummary}`,
      `Park: ${parkFactorSummary}`,
      `Bullpen: ${bullpenSummary}`,
      `Markets: ${marketAvailability}`,
      trigger ? `Why now: ${trigger.rationale}` : "Why now: waiting on either official lineup IDs, stronger recent production, or a better run environment.",
      trigger && trigger.topHitters.length ? `Top hitters: ${trigger.topHitters.join(" | ")}` : "Top hitters: official-lineup recent production sample not strong enough yet.",
      `Scope: ${board.scope?.lineups || "Lineup status is conservative."}`,
      "Label policy: when the trigger fires, this becomes a real tracked system pick. Non-trigger rows stay context only.",
    ].join(" • ");

    freshRecords.push(normalizeRecord({
      id: `${TONYS_HOT_BATS_SYSTEM_ID}:${game.gameId}`,
      gameId: game.gameId,
      oddsEventId: null,
      gameDate: game.date,
      matchup: `${game?.matchup?.away?.abbreviation || "AWAY"} @ ${game?.matchup?.home?.abbreviation || "HOME"}`,
      roadTeam: game?.matchup?.away?.abbreviation || "AWAY",
      homeTeam: game?.matchup?.home?.abbreviation || "HOME",
      recordKind: trigger ? "qualifier" : "alert",
      marketType: trigger ? (totalLine != null ? "total" : "moneyline") : (totalLine != null ? "context-total-board" : "context-board"),
      qualifiedTeam: trigger?.teamAbbrev ?? null,
      opponentTeam: trigger ? ((trigger.teamAbbrev === (game?.matchup?.away?.abbreviation || "AWAY")) ? (game?.matchup?.home?.abbreviation || "HOME") : (game?.matchup?.away?.abbreviation || "AWAY")) : null,
      alertLabel: trigger ? `Tony's Tight Bats system pick — ${trigger.teamAbbrev}` : "Context board / no trigger",
      currentMoneyline,
      lineupStatus,
      weatherSummary,
      parkFactorSummary,
      bullpenSummary,
      f5Summary,
      marketAvailability,
      source: trigger
        ? "Official MLB lineup IDs + MLB hitter game logs + MLB enrichment board"
        : "MLB enrichment board (lineups + weather + park factors + bullpen + posted markets)",
      notes,
      sourceHealthStatus: game?.sourceHealth?.status ?? null,
      freshnessSummary: game?.sourceHealth?.checks?.length
        ? game.sourceHealth.checks.map((check: any) => `${check.label}: ${check.status}`).join(" • ")
        : null,
      lastSyncedAt: new Date().toISOString(),
    }));
  }

  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup);
  });
  applyTonysHotBatsReadiness(system);
  return system;
}

async function refreshSwaggyStretchDriveSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getTrackedSystem(data, SWAGGY_STRETCH_DRIVE_SYSTEM_ID, () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(SWAGGY_STRETCH_DRIVE_SYSTEM_ID)!));
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const [board, aggregated] = await Promise.all([
    getTodayNHLContextBoard(),
    getAggregatedOddsForSport("NHL"),
  ]);

  const targetGames = (board.games || []).filter((game) => game.gameDate === targetDate);
  const freshRecords: SystemTrackingRecord[] = [];
  const audit = {
    gamesScanned: targetGames.length,
    matchedOddsEvent: 0,
    teamChecks: 0,
    failedNoOddsEvent: 0,
    failedUrgency: 0,
    failedOpponentUrgency: 0,
    failedMissingXg: 0,
    failedWeakXg: 0,
    failedXgEdge: 0,
    failedMissingGoalie: 0,
    failedBackupGoalie: 0,
    failedGoalieStatus: 0,
    failedFatigue: 0,
    failedFatigueGap: 0,
    failedNoPrice: 0,
    failedPriceBand: 0,
  };

  for (const game of targetGames) {
    const event = findAggregatedEventForSplitsGame(
      aggregated,
      game.matchup.homeTeam.abbrev,
      game.matchup.awayTeam.abbrev,
      game.gameDate,
    );
    if (!event) {
      audit.failedNoOddsEvent += 1;
      continue;
    }
    audit.matchedOddsEvent += 1;

    const candidates = [
      { qualified: game.teams.away, opponent: game.teams.home, price: getNHLMoneylineForTeam(event, game.teams.away.teamAbbrev)?.odds ?? null, book: getNHLMoneylineForTeam(event, game.teams.away.teamAbbrev)?.book ?? null },
      { qualified: game.teams.home, opponent: game.teams.away, price: getNHLMoneylineForTeam(event, game.teams.home.teamAbbrev)?.odds ?? null, book: getNHLMoneylineForTeam(event, game.teams.home.teamAbbrev)?.book ?? null },
    ];

    for (const candidate of candidates) {
      audit.teamChecks += 1;
      const entry = candidate.qualified;
      const opponent = candidate.opponent;
      const price = candidate.price;
      const xg = entry.sourced.moneyPuck?.xGoalsPercentage ?? null;
      const oppXg = opponent.sourced.moneyPuck?.xGoalsPercentage ?? null;
      const starter = entry.sourced.goalie.starter;
      const fatigue = entry.derived.fatigueScore;
      const oppFatigue = opponent.derived.fatigueScore;

      if (entry.derived.playoffPressure.urgencyTier !== 'high' && entry.derived.playoffPressure.urgencyTier !== 'medium') {
        audit.failedUrgency += 1;
        continue;
      }
      if (opponent.derived.playoffPressure.urgencyTier === 'high') {
        audit.failedOpponentUrgency += 1;
        continue;
      }
      if (xg == null || oppXg == null) {
        audit.failedMissingXg += 1;
        continue;
      }
      if (xg < 0.515) {
        audit.failedWeakXg += 1;
        continue;
      }
      if (xg - oppXg < 0.02) {
        audit.failedXgEdge += 1;
        continue;
      }
      if (!starter) {
        audit.failedMissingGoalie += 1;
        continue;
      }
      if (starter.isBackup) {
        audit.failedBackupGoalie += 1;
        continue;
      }
      if (starter.status !== 'confirmed' && starter.status !== 'probable') {
        audit.failedGoalieStatus += 1;
        continue;
      }
      if (typeof price !== "number" || !Number.isFinite(price)) {
        audit.failedNoPrice += 1;
        continue;
      }
      if (price < -150 || price > -110) {
        audit.failedPriceBand += 1;
        continue;
      }
      if (fatigue != null && fatigue >= 55) {
        audit.failedFatigue += 1;
        continue;
      }
      if (fatigue != null && oppFatigue != null && fatigue - oppFatigue >= 15) {
        audit.failedFatigueGap += 1;
        continue;
      }
      if (typeof price !== 'number' || !Number.isFinite(price)) {
        audit.failedNoPrice += 1;
        continue;
      }
      if (price < -150 || price > -110) {
        audit.failedPriceBand += 1;
        continue;
      }

      freshRecords.push(buildSwaggyQualifierRecord({
        boardGame: game,
        qualified: entry,
        opponent,
        event,
        currentMoneyline: price,
        moneylineBook: candidate.book,
      }));
    }
  }

  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup) || (left.qualifiedTeam || "").localeCompare(right.qualifiedTeam || "");
  });

  const qualifiers = freshRecords.length;
  const withMoneyline = system.records.filter((record) => record.currentMoneyline != null).length;
  const withXg = system.records.filter((record) => record.xGoalsPercentage != null && record.opponentXGoalsPercentage != null).length;
  const withGoalies = system.records.filter((record) => record.goalieStatus || record.opponentGoalieStatus).length;
  const withTotals = system.records.filter((record) => record.totalLine != null).length;
  const auditSummary = `Audit ${audit.gamesScanned} games / ${audit.teamChecks} team checks • no odds event ${audit.failedNoOddsEvent} • urgency ${audit.failedUrgency} • opp urgency ${audit.failedOpponentUrgency} • xG missing ${audit.failedMissingXg} • xG floor ${audit.failedWeakXg} • xG edge ${audit.failedXgEdge} • goalie missing ${audit.failedMissingGoalie} • backup ${audit.failedBackupGoalie} • goalie status ${audit.failedGoalieStatus} • fatigue ${audit.failedFatigue} • fatigue gap ${audit.failedFatigueGap} • no price ${audit.failedNoPrice} • price band ${audit.failedPriceBand}.`;

  system.status = qualifiers > 0 ? "tracking" : "awaiting_data";
  system.snapshot = qualifiers > 0
    ? `${qualifiers} Swaggy qualifier${qualifiers === 1 ? "" : "s"} stored for ${targetDate}. ${auditSummary}`
    : `No Swaggy qualifiers met the rule-gated screen for ${targetDate}. ${auditSummary}`;
  system.automationStatusLabel = qualifiers > 0 ? "Live qualifier tracking + price discipline" : "Awaiting fresh qualifiers";
  system.automationStatusDetail = qualifiers > 0
    ? `${qualifiers} NHL qualifier${qualifiers === 1 ? "" : "s"} passed the urgency + MoneyPuck + goalie + fatigue + price screen. ${withMoneyline} stored with moneyline, ${withXg} with xG context, ${withGoalies} with goalie context, and ${withTotals} with posted totals context. ${auditSummary}`
    : `Refresh scans live NHL context and aggregated moneylines, then stores only teams that pass strict urgency, xG, goalie, fatigue, and price gates. ${auditSummary}`;

  return system;
}

function applyRobbiesRipperFast5Readiness(system: TrackedSystem) {
  const actionableQualifiers = system.records.filter((r) => r.recordKind === "qualifier").length;
  const contextBoard = system.records.filter((r) => r.marketType === "context-board").length;
  const gamesWithF5 = system.records.filter((r) => r.f5Summary && !r.f5Summary.includes("none") && !r.f5Summary.includes("unavailable")).length;
  const total = system.records.length;

  system.status = total > 0 ? "tracking" : "awaiting_data";
  system.automationStatusLabel = actionableQualifiers > 0
    ? "Live F5 system picks — starter mismatch + F5 market confirmed"
    : total > 0
      ? "Context board live — awaiting F5 market posts"
      : "Awaiting MLB board";
  system.automationStatusDetail = total > 0
    ? `${total} game${total === 1 ? "" : "s"} on board — ${actionableQualifiers} system pick${actionableQualifiers === 1 ? "" : "s"}, ${contextBoard} context-board, ${gamesWithF5} with F5 market posted.`
    : "Refresh will build a same-day MLB board from probable pitchers, F5 market rail, and enrichment context.";
}

function getRobbiesRipperFast5System(data: SystemsTrackingData) {
  return getTrackedSystem(
    data,
    ROBBIES_RIPPER_FAST_5_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(ROBBIES_RIPPER_FAST_5_SYSTEM_ID)!),
  );
}

/**
 * Robbie's Ripper Fast 5 qualifier logic.
 *
 * Fires an alert row when:
 *   1. Both probable pitchers are listed by MLB
 *   2. An F5 market (h2h_1st_5_innings or totals_1st_5_innings) is explicitly posted
 *   3. The starter quality gap is >= 12 points on the 30–80 ERA+WHIP scale
 *
 * Stores a context-board row for every game that has both probable pitchers,
 * even when the F5 market or mismatch threshold does not fire.
 */
async function refreshRobbiesRipperFast5SystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getRobbiesRipperFast5System(data);
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const board = await getMLBEnrichmentBoard(targetDate);

  const priorRecords = system.records.filter((record) => record.gameDate !== targetDate);
  const freshRecords: SystemTrackingRecord[] = [];

  const audit = {
    gamesScanned: (board.games ?? []).length,
    alerts: 0,
    contextBoard: 0,
    missingBothPitchers: 0,
    missingF5Market: 0,
    belowMismatchThreshold: 0,
  };

  for (const game of (board.games ?? [])) {
    const awayPitcher = game?.matchup?.away?.probablePitcher ?? game?.probableStarters?.away ?? null;
    const homePitcher = game?.matchup?.home?.probablePitcher ?? game?.probableStarters?.home ?? null;

    const awayQuality = game?.starterQuality?.away ?? null;
    const homeQuality = game?.starterQuality?.home ?? null;

    const f5Market = game?.markets?.f5 ?? null;
    const f5Available = f5Market?.available === true;
    const f5Completeness = f5Market?.completeness ?? "none";
    const f5SupportedMarkets: string[] = Array.isArray(f5Market?.supportedMarkets) ? f5Market.supportedMarkets : [];
    const f5ML = f5Market?.moneyline ?? null;
    const f5Total = f5Market?.total ?? null;
    const hasF5Moneyline = Boolean(f5ML?.away?.odds != null || f5ML?.home?.odds != null);
    const hasF5Total = Boolean(f5Total?.line != null && (f5Total?.overOdds != null || f5Total?.underOdds != null));

    // Summarise market info
    const marketAvailability = f5Available
      ? `F5 ${f5Completeness}${f5SupportedMarkets.length ? ` (${f5SupportedMarkets.join(", ")})` : ""}${f5Total?.line != null ? ` • total ${f5Total.line}` : ""}${f5ML?.away?.odds != null ? ` • away ML ${f5ML.away.odds > 0 ? "+" : ""}${f5ML.away.odds}` : ""}${f5ML?.home?.odds != null ? ` • home ML ${f5ML.home.odds > 0 ? "+" : ""}${f5ML.home.odds}` : ""}`
      : "F5 none";

    const weatherSummary = (() => {
      const w = game?.weather;
      if (!w) return "Weather context unavailable.";
      const forecast = w.forecast;
      if (!forecast) return w.note || "Weather context unavailable.";
      const bits: string[] = [];
      if (typeof forecast.temperatureF === "number") bits.push(`${Math.round(forecast.temperatureF)}°F`);
      if (typeof forecast.windSpeedMph === "number") bits.push(`${Math.round(forecast.windSpeedMph)} mph wind`);
      return bits.length ? bits.join(" • ") : (w.note || "Weather context unavailable.");
    })();

    const parkFactorSummary = (() => {
      const pf = game?.parkFactor;
      if (!pf || pf.status === "missing" || !pf.metrics) return "Park factor missing from current seed.";
      const runs = typeof pf.metrics.runs === "number" ? `Runs ${pf.metrics.runs}` : null;
      const hr = typeof pf.metrics.homeRuns === "number" ? `HR ${pf.metrics.homeRuns}` : null;
      const bits = [runs, hr].filter(Boolean);
      return bits.length ? `${pf.venueName || game?.matchup?.home?.fullName || "Park"}: ${bits.join(" • ")}` : `Park factor available.`;
    })();

    const awayBullpen = game?.matchup?.away?.bullpen;
    const homeBullpen = game?.matchup?.home?.bullpen;
    const bullpenSummary = [
      awayBullpen?.summary ? `${game?.matchup?.away?.abbreviation || "Away"}: ${awayBullpen.summary}` : null,
      homeBullpen?.summary ? `${game?.matchup?.home?.abbreviation || "Home"}: ${homeBullpen.summary}` : null,
    ].filter(Boolean).join(" • ") || "Bullpen context unavailable.";

    const awayAbbrev = game?.matchup?.away?.abbreviation || "AWAY";
    const homeAbbrev = game?.matchup?.home?.abbreviation || "HOME";
    const matchup = `${awayAbbrev} @ ${homeAbbrev}`;

    // Check qualifier gates
    const hasBothPitchers = Boolean(awayPitcher?.name && homePitcher?.name);
    if (!hasBothPitchers) {
      audit.missingBothPitchers += 1;
    }

    const awayQScore = awayQuality?.qualityScore ?? null;
    const homeQScore = homeQuality?.qualityScore ?? null;
    const qualityGap = awayQScore != null && homeQScore != null ? Math.abs(awayQScore - homeQScore) : null;
    const mismatchQualifies = qualityGap != null && qualityGap >= 12;

    // Determine which side has the better starter (qualifiedTeam for the alert)
    let qualifiedTeam: string | null = null;
    let qualifiedMoneyline: number | null = null;
    if (mismatchQualifies && awayQScore != null && homeQScore != null) {
      if (awayQScore > homeQScore) {
        qualifiedTeam = awayAbbrev;
        qualifiedMoneyline = f5ML?.away?.odds ?? null;
      } else {
        qualifiedTeam = homeAbbrev;
        qualifiedMoneyline = f5ML?.home?.odds ?? null;
      }
    }

    const isAlert = hasBothPitchers && f5Available && mismatchQualifies;
    if (!f5Available && hasBothPitchers) audit.missingF5Market += 1;
    if (hasBothPitchers && f5Available && !mismatchQualifies) audit.belowMismatchThreshold += 1;

    // Build starter summary
    const awayStarterSummary = awayQuality?.summary ?? (awayPitcher?.name ? `${awayPitcher.name} (no ERA context)` : "No probable starter listed");
    const homeStarterSummary = homeQuality?.summary ?? (homePitcher?.name ? `${homePitcher.name} (no ERA context)` : "No probable starter listed");

    const f5Summary = f5Available
      ? `F5 ${f5Completeness}${f5SupportedMarkets.length ? ` (${f5SupportedMarkets.join(", ")})` : ""}.`
      : "F5 none.";

    // Shared context notes (used by both alert records and context-board records)
    const postedMarketsNote = f5Available
      ? `Posted F5 options: ${[hasF5Moneyline ? "moneyline" : null, hasF5Total ? "total" : null].filter(Boolean).join(" + ") || "unknown"}.`
      : "";
    const bothMarketsNote = hasF5Moneyline && hasF5Total
      ? "Both F5 moneyline and F5 total are posted — each is tracked as a separate actionable record."
      : null;

    // Shared record fields common to every record emitted for this game
    const sharedProps = {
      gameId: game.gameId,
      oddsEventId: null as null,
      gameDate: game.date,
      matchup,
      roadTeam: awayAbbrev,
      homeTeam: homeAbbrev,
      qualifiedTeam: isAlert ? qualifiedTeam : null,
      opponentTeam: isAlert ? (qualifiedTeam === awayAbbrev ? homeAbbrev : awayAbbrev) : null,
      marketAvailability,
      f5Summary,
      weatherSummary,
      parkFactorSummary,
      bullpenSummary,
      sourceHealthStatus: (game?.sourceHealth?.status ?? null) as "healthy" | "stale" | "degraded" | "missing" | null,
      freshnessSummary: game?.sourceHealth?.checks?.length
        ? game.sourceHealth.checks.map((check: any) => `${check.label}: ${check.status}`).join(" • ")
        : null,
      lastSyncedAt: new Date().toISOString(),
    };

    if (isAlert) {
      // ── Alert path: emit one record per posted F5 market type ─────────────
      // When both moneyline AND total are posted for a qualifying game, we
      // create two independent actionable records so neither option is hidden.
      type AlertMarket = { suffix: string; marketType: string; label: string; moneyline: number | null; recordTotalLine: number | null; marketNote: string };
      const alertMarkets: AlertMarket[] = [];

      const mlSuffix   = hasF5Moneyline && hasF5Total ? ":ml"    : "";
      const totSuffix  = hasF5Moneyline && hasF5Total ? ":total" : "";

      if (hasF5Moneyline) {
        const mlOdds = qualifiedMoneyline;
        alertMarkets.push({
          suffix: mlSuffix,
          marketType: "f5-moneyline",
          label: hasF5Total ? "Ripper F5 alert — moneyline" : "Ripper F5 alert",
          moneyline: mlOdds,
          recordTotalLine: null,
          marketNote: `F5 moneyline — ${qualifiedTeam}${mlOdds != null ? ` ${mlOdds > 0 ? "+" : ""}${mlOdds}` : " (odds not captured)"}`,
        });
      }

      if (hasF5Total) {
        const overLine  = f5Total?.line ?? null;
        const overOdds  = f5Total?.overOdds ?? null;
        const underOdds = f5Total?.underOdds ?? null;
        const overStr   = overOdds  != null ? ` • over ${overOdds > 0 ? "+" : ""}${overOdds}`   : "";
        const underStr  = underOdds != null ? ` • under ${underOdds > 0 ? "+" : ""}${underOdds}` : "";
        alertMarkets.push({
          suffix: totSuffix,
          marketType: "f5-total",
          label: hasF5Moneyline ? "Ripper F5 alert — total" : "Ripper F5 alert",
          moneyline: null,
          recordTotalLine: overLine,
          marketNote: `F5 total — line ${overLine ?? "n/a"}${overStr}${underStr}`,
        });
      }

      // Fallback: alert triggered but no market captured yet (rare)
      if (alertMarkets.length === 0) {
        alertMarkets.push({
          suffix: "",
          marketType: "context-board",
          label: "Ripper F5 alert — market pending",
          moneyline: null,
          recordTotalLine: null,
          marketNote: "F5 alert qualified but no specific market line captured.",
        });
      }

      for (const market of alertMarkets) {
        const alertNotes = [
          `Ripper alert: ${qualifiedTeam} has quality edge (gap ${qualityGap} pts) • ${awayStarterSummary} vs ${homeStarterSummary}`,
          `F5: ${marketAvailability}`,
          postedMarketsNote,
          bothMarketsNote,
          `This record: ${market.marketNote}`,
          `Weather: ${weatherSummary}`,
          `Park: ${parkFactorSummary}`,
          `Bullpen: ${bullpenSummary}`,
        ].filter(Boolean).join(" • ");

      freshRecords.push(normalizeRecord({
        ...sharedProps,
        id: `${ROBBIES_RIPPER_FAST_5_SYSTEM_ID}:${game.gameId}${market.suffix}`,
        recordKind: "qualifier",
        marketType: market.marketType,
        alertLabel: market.label,
        currentMoneyline: market.moneyline,
          totalLine: market.recordTotalLine ?? (f5Total?.line ?? null),
          source: "MLB enrichment board (F5 market rail + ERA/WHIP starter quality + weather + park + bullpen)",
          notes: alertNotes,
        }));
      }

      audit.alerts += 1; // count alert-qualifying games, not individual market records
    } else {
      // ── Context-board path: single record per game ─────────────────────────
      const contextNotes = [
        hasBothPitchers
          ? `Context board: ${awayStarterSummary} vs ${homeStarterSummary}${qualityGap != null ? ` • quality gap ${qualityGap} pts (threshold 12)` : ""}`
          : "Context board: at least one probable starter still unlisted.",
        `F5: ${marketAvailability}`,
        postedMarketsNote,
        `Weather: ${weatherSummary}`,
        `Park: ${parkFactorSummary}`,
        `Bullpen: ${bullpenSummary}`,
        !f5Available ? "Waiting on F5 market to post." : "",
        !mismatchQualifies && hasBothPitchers ? `Quality gap ${qualityGap ?? "—"} pts below 12-pt mismatch threshold.` : "",
      ].filter(Boolean).join(" • ");

      freshRecords.push(normalizeRecord({
        ...sharedProps,
        id: `${ROBBIES_RIPPER_FAST_5_SYSTEM_ID}:${game.gameId}`,
        recordKind: "alert",
        marketType: "context-board",
        alertLabel: "Context board / no trigger",
        currentMoneyline: null,
        totalLine: f5Total?.line ?? null,
        source: "MLB enrichment board (lineups + weather + park factors + bullpen + posted markets)",
        notes: contextNotes,
      }));

      audit.contextBoard += 1;
    }
  }

  system.records = [...priorRecords, ...freshRecords].sort((left, right) => {
    return left.gameDate.localeCompare(right.gameDate) || left.matchup.localeCompare(right.matchup);
  });

  // alertRecordCount = total records emitted for alert-qualifying games (may be 2 per game when both ML+total posted)
  // audit.alerts = number of alert-qualifying games (always 1 per game, regardless of how many markets were posted)
  const alertRecordCount = freshRecords.filter((r) => r.recordKind === "qualifier").length;
  const auditSummary = `Scanned ${audit.gamesScanned} games • ${audit.alerts} alert game${audit.alerts === 1 ? "" : "s"} (${alertRecordCount} system pick record${alertRecordCount === 1 ? "" : "s"}) • ${audit.contextBoard} context-board • missing pitchers ${audit.missingBothPitchers} • no F5 market ${audit.missingF5Market} • below mismatch threshold ${audit.belowMismatchThreshold}.`;

  system.status = freshRecords.length > 0 ? "tracking" : "awaiting_data";
  system.snapshot = alertRecordCount > 0
    ? `${audit.alerts} Ripper F5 alert game${audit.alerts === 1 ? "" : "s"} today (${alertRecordCount} actionable F5 option${alertRecordCount === 1 ? "" : "s"}) — F5 market posted with meaningful starter mismatch. ${auditSummary}`
    : freshRecords.length > 0
      ? `Context board loaded (${freshRecords.length} games). No F5 alert qualified today. ${auditSummary}`
      : `No MLB games found for ${targetDate}. ${auditSummary}`;
  system.automationStatusLabel = alertRecordCount > 0 ? `Live F5 alert — ${alertRecordCount} actionable option${alertRecordCount === 1 ? "" : "s"} (starter mismatch + F5 market confirmed)` : "Context board live — awaiting F5 market posts";
  system.automationStatusDetail = auditSummary;

  // Update data requirements based on current state
  const f5Req = findRequirement(system, "F5 market availability");
  if (f5Req) {
    const gamesWithF5 = freshRecords.filter((r) => r.f5Summary && !r.f5Summary.includes("none") && !r.f5Summary.includes("unavailable")).length;
    f5Req.status = gamesWithF5 > 0 ? "ready" : "partial";
    f5Req.detail = gamesWithF5 > 0
      ? `F5 markets posted for ${gamesWithF5} game${gamesWithF5 === 1 ? "" : "s"} today. Rail checks h2h_1st_5_innings and totals_1st_5_innings keys from aggregated odds.`
      : "F5 market rail is connected but books have not posted F5 lines for today's games yet.";
  }
  const pitcherReq = findRequirement(system, "Probable pitchers + ERA/WHIP quality scoring");
  if (pitcherReq) {
    const gamesWithBoth = freshRecords.filter((r) => !r.notes?.includes("at least one probable starter still unlisted")).length;
    pitcherReq.status = gamesWithBoth > 0 ? "ready" : "partial";
    pitcherReq.detail = gamesWithBoth > 0
      ? `Both probable starters listed for ${gamesWithBoth} game${gamesWithBoth === 1 ? "" : "s"}. ERA+WHIP quality scores computed.`
      : "MLB schedule hydrate is connected but not all games have both probable pitchers listed yet.";
  }
  const linescoreReq = findRequirement(system, "F5 inning linescore for grading");
  if (linescoreReq) {
    linescoreReq.status = "partial";
    linescoreReq.detail = "MLB Stats API /game/{gamePk}/linescore grading is wired. Rows stay pending until 5 complete innings are confirmed or the game is final with available inning data.";
  }

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
  const audit = {
    gamesScanned: targetGames.length,
    starterChecks: 0,
    matchedEventGames: 0,
    failedNoEvent: 0,
    failedNoProbableStarter: 0,
    failedEra: 0,
    failedNoMoneyline: 0,
    failedMoneylineBand: 0,
    failedNoPriorStart: 0,
    failedNotPummeled: 0,
  };

  for (const game of targetGames) {
    const event = findMLBOddsForGame(oddsEvents, game.homeTeam.abbreviation, game.awayTeam.abbreviation);
    if (event) audit.matchedEventGames += 1;
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
      audit.starterChecks += 1;
      const starter = candidate.starter;
      if (!starter?.id || !starter.name) {
        audit.failedNoProbableStarter += 1;
        continue;
      }
      if (starter.era != null && starter.era > 5.25) {
        audit.failedEra += 1;
        continue;
      }

      const lineupSide = candidate.side === "away" ? enrichment?.lineups?.away : enrichment?.lineups?.home;
      const bullpenSide = candidate.side === "away" ? enrichment?.matchup?.away?.bullpen : enrichment?.matchup?.home?.bullpen;
      const lineupStatus = lineupSide
        ? `${candidate.teamAbbrev} lineup ${lineupSide.status}${lineupSide.players.length ? ` (${lineupSide.players.length}/9 hitters exposed)` : ""}${lineupSide.note ? ` - ${lineupSide.note}` : ""}.`
        : "Lineup rail unavailable for this game.";
      const weatherSummary = enrichment?.weather
        ? enrichment.weather.status === "available"
          ? `${enrichment.weather.venue?.name || game.venue?.name || game.homeTeam.fullName}: ${enrichment.weather.forecast?.temperatureF ?? "-"}°F, wind ${enrichment.weather.forecast?.windSpeedMph ?? "-"} mph, precip ${enrichment.weather.forecast?.precipitationProbability ?? "-"}%${enrichment.weather.note ? ` - ${enrichment.weather.note}` : ""}.`
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

      if (!event) {
        audit.failedNoEvent += 1;
        continue;
      }
      const moneyline = getBestOdds(event, "h2h", candidate.side === "away" ? event.away_team : event.home_team);
      const currentMoneyline = moneyline?.odds ?? null;
      if (currentMoneyline == null) {
        audit.failedNoMoneyline += 1;
        continue;
      }
      if (currentMoneyline < -140 || currentMoneyline > 125) {
        audit.failedMoneylineBand += 1;
        continue;
      }

      const logs = await getMLBPlayerGameLog(Number(starter.id), Number(targetDate.slice(0, 4)), "pitching");
      const priorStart = logs.find((log) => log.gameDate && log.gameDate < targetDate && daysBetween(log.gameDate, targetDate) <= 10);
      if (!priorStart) {
        audit.failedNoPriorStart += 1;
        continue;
      }
      if (!isPummeledStart(priorStart)) {
        audit.failedNotPummeled += 1;
        continue;
      }

      freshRecords.push(await buildFalconsQualifierRecord({
        gameId: game.id,
        oddsEventId: game.oddsEventId || event?.id,
        gameDate: game.date,
        matchup: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        roadTeam: game.awayTeam.abbreviation,
        homeTeam: game.homeTeam.abbreviation,
        qualifiedTeam: candidate.teamAbbrev,
        opponentTeam: candidate.side === "away" ? game.homeTeam.abbreviation : game.awayTeam.abbreviation,
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
    return (right.falconsScore ?? -1) - (left.falconsScore ?? -1)
      || left.gameDate.localeCompare(right.gameDate)
      || left.matchup.localeCompare(right.matchup)
      || (left.starterName || "").localeCompare(right.starterName || "");
  });
  const auditSummary = `Audit ${audit.gamesScanned} games (${audit.matchedEventGames} matched odds events) / ${audit.starterChecks} starter checks • no matched event ${audit.failedNoEvent} • no probable starter ${audit.failedNoProbableStarter} • ERA filter ${audit.failedEra} • no moneyline ${audit.failedNoMoneyline} • moneyline band ${audit.failedMoneylineBand} • no prior start ${audit.failedNoPriorStart} • prior start not pummeled ${audit.failedNotPummeled}.`;
  applyFalconsFightPummeledPitchersReadiness(system);

  system.status = freshRecords.length > 0 ? "tracking" : "awaiting_data";
  system.snapshot = freshRecords.length > 0
    ? `${freshRecords.length} Falcons qualifier${freshRecords.length === 1 ? "" : "s"} for ${targetDate}. ${auditSummary}`
    : `No Falcons qualifiers met the current screen for ${targetDate}. ${auditSummary}`;
  system.automationStatusLabel = freshRecords.length > 0 ? 'Live — buy-low starter qualifiers active' : 'Awaiting buy-low starter spot';
  system.automationStatusDetail = freshRecords.length > 0
    ? `Falcons is live with ${freshRecords.length} stored qualifier${freshRecords.length === 1 ? '' : 's'}. ${auditSummary}`
    : `Falcons nightly QA: no qualifiers stored for ${targetDate}. ${auditSummary}`;
  return system;
}

// ─── BigCat Bonaza PuckLuck — 5v5 process-vs-results / finishing luck ───────

async function refreshBigCatBonazaPuckLuckSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getTrackedSystem(data, BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID, () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID)!));
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [board, aggregated] = await Promise.all([
    getTodayNHLContextBoard(),
    getAggregatedOddsForSport("NHL"),
  ]);

  const targetGames = (board.games || []).filter((game) => game.gameDate === targetDate);
  const freshRecords: SystemTrackingRecord[] = [];

  const audit = {
    gamesScanned: targetGames.length,
    matchedOddsEvent: 0,
    teamChecks: 0,
    failedNoOddsEvent: 0,
    failedMissingXg: 0,
    failedProcessGate: 0,
    failedSampleGate: 0,
    failedFinishingLuck: 0,
    failedNoPrice: 0,
    failedPriceBand: 0,
    qualified: 0,
  };

  for (const game of targetGames) {
    const event = aggregated.find((candidate) => {
      if (getEventDate(candidate.commenceTime) !== game.gameDate) return false;
      return candidate.awayAbbrev === game.matchup.awayTeam.abbrev && candidate.homeAbbrev === game.matchup.homeTeam.abbrev;
    });
    if (!event) {
      audit.failedNoOddsEvent += 1;
      continue;
    }
    audit.matchedOddsEvent += 1;

    const sides = [
      { entry: game.teams.away, opponent: game.teams.home },
      { entry: game.teams.home, opponent: game.teams.away },
    ];

    for (const { entry, opponent } of sides) {
      audit.teamChecks += 1;

      const xgPct = entry.sourced.moneyPuck?.xGoalsPercentage ?? null;
      const xgFor = entry.sourced.moneyPuck?.xGoalsFor ?? null;
      const goalsFor = entry.sourced.moneyPuck?.goalsFor ?? null;
      const gamesPlayed = entry.sourced.standings?.gamesPlayed ?? null;
      const priceInfo = getNHLMoneylineForTeam(event, entry.teamAbbrev);
      const price = priceInfo?.odds ?? null;

      if (xgPct === null || xgFor === null) { audit.failedMissingXg += 1; continue; }
      if (xgPct < 0.505) { audit.failedProcessGate += 1; continue; }
      if (gamesPlayed === null || gamesPlayed < 25) { audit.failedSampleGate += 1; continue; }

      // goalsFor/xGoalsFor finishing luck — the core BigCat gate
      if (goalsFor === null || xgFor <= 0) { audit.failedFinishingLuck += 1; continue; }
      const finishingRatio = goalsFor / xgFor;
      if (finishingRatio > 0.96) { audit.failedFinishingLuck += 1; continue; }

      if (typeof price !== 'number' || !Number.isFinite(price)) { audit.failedNoPrice += 1; continue; }
      if (price < -170 || price > 250) { audit.failedPriceBand += 1; continue; }

      const oppXgPct = opponent.sourced.moneyPuck?.xGoalsPercentage ?? null;
      const xgEdge = xgPct != null && oppXgPct != null ? Number((xgPct - oppXgPct).toFixed(3)) : null;
      const totalLine = getEventTotalLine(event);

      const notes = [
        'BigCat PuckLuck qualifier — process outpacing results. Regression-up candidate. Not a pick.',
        `${entry.teamAbbrev} xGoalsPercentage (season): ${xgPct.toFixed(3)} (process gate: >=0.505 ✓).`,
        `Finishing luck: goalsFor ${goalsFor} / xGoalsFor ${xgFor.toFixed(2)} = ${finishingRatio.toFixed(3)} (threshold <=0.96 ✓). Team is underfinishing vs expected — variance-based regression candidate.`,
        `xG edge vs opponent: ${xgEdge != null ? (xgEdge > 0 ? '+' : '') + xgEdge.toFixed(3) : '—'}.`,
        `PARTIAL PDO NOTE: goalsAgainst not in current MoneyPuck snapshot. Save-side luck not captured. Full PDO requires data upgrade (goalsAgainst column).`,
        `5v5 NOTE: MoneyPuck mirror is all-situations xG, not pure 5v5 split.`,
        `${gamesPlayed} games played (sample gate: >=25 ✓).`,
        `ML ${price > 0 ? '+' : ''}${price}${priceInfo?.book ? ` (${priceInfo.book})` : ''}${totalLine != null ? ` • total ${totalLine}` : ''}.`,
        `${entry.teamAbbrev} fatigue ${entry.derived.fatigueScore ?? '—'}, rest ${entry.derived.rest.restDays ?? '—'} days.`,
      ].filter(Boolean).join(' • ');

      freshRecords.push(normalizeRecord({
        id: `${BIGCAT_BONAZA_PUCKLUCK_SYSTEM_ID}:${game.gameId}:${entry.teamAbbrev}`,
        gameId: String(game.gameId),
        oddsEventId: event.oddsApiEventId ?? null,
        gameDate: game.gameDate,
        matchup: `${game.matchup.awayTeam.abbrev} @ ${game.matchup.homeTeam.abbrev}`,
        roadTeam: game.matchup.awayTeam.abbrev,
        homeTeam: game.matchup.homeTeam.abbrev,
        recordKind: 'qualifier',
        marketType: 'moneyline',
        alertLabel: 'BigCat PuckLuck — underfinishing / regression candidate',
        sourceHealthStatus: 'healthy',
        freshnessSummary: `MoneyPuck xG% ${xgPct.toFixed(3)}, finishing ratio ${finishingRatio.toFixed(3)}. Partial PDO — offense side only.`,
        qualifiedTeam: entry.teamAbbrev,
        opponentTeam: opponent.teamAbbrev,
        xGoalsPercentage: xgPct,
        opponentXGoalsPercentage: oppXgPct,
        fatigueScore: entry.derived.fatigueScore,
        opponentFatigueScore: opponent.derived.fatigueScore,
        goalieStatus: entry.sourced.goalie.starter ? `${entry.sourced.goalie.starter.name} (${entry.sourced.goalie.starter.status})` : null,
        opponentGoalieStatus: opponent.sourced.goalie.starter ? `${opponent.sourced.goalie.starter.name} (${opponent.sourced.goalie.starter.status})` : null,
        currentMoneyline: price,
        marketAvailability: totalLine != null ? `Moneyline + total posted${priceInfo?.book ? ` (${priceInfo.book})` : ''}.` : `Moneyline posted${priceInfo?.book ? ` (${priceInfo.book})` : ''}.`,
        totalLine,
        urgencyTier: entry.derived.playoffPressure.urgencyTier,
        source: 'MoneyPuck snapshot (xGoalsPercentage, xGoalsFor, goalsFor) + NHL standings + aggregated NHL odds',
        notes,
        lastSyncedAt: new Date().toISOString(),
      }));
      audit.qualified += 1;
    }
  }

  const priorRecords = system.records.filter((r) => r.gameDate !== targetDate);
  system.records = [...priorRecords, ...freshRecords].sort((a, b) =>
    a.gameDate.localeCompare(b.gameDate) || a.matchup.localeCompare(b.matchup),
  );

  const auditSummary = `Audit ${audit.gamesScanned} games / ${audit.teamChecks} checks • no odds ${audit.failedNoOddsEvent} • missing xG ${audit.failedMissingXg} • process gate ${audit.failedProcessGate} • sample gate ${audit.failedSampleGate} • finishing luck ${audit.failedFinishingLuck} • no price ${audit.failedNoPrice} • price band ${audit.failedPriceBand} • qualified ${audit.qualified}.`;

  system.status = audit.qualified > 0 ? 'tracking' : 'awaiting_data';
  system.snapshot = audit.qualified > 0
    ? `${audit.qualified} BigCat qualifier${audit.qualified === 1 ? '' : 's'} for ${targetDate} — underfinishing teams vs process. Partial PDO (offense side only). ${auditSummary}`
    : `No BigCat qualifiers for ${targetDate} — no teams passed xG process + finishing luck screen. Partial PDO blocker: goalsAgainst not in snapshot. ${auditSummary}`;
  system.automationStatusLabel = audit.qualified > 0 ? 'Live — BigCat finishing-luck alerts' : 'Awaiting qualifiers';
  system.automationStatusDetail = `Daily finishing-luck screen: xGoalsPercentage >= 0.505, goalsFor/xGoalsFor <= 0.96, >=25 GP, price -170 to +250. Partial PDO — goalsAgainst missing from MoneyPuck snapshot. ${auditSummary}`;

  return system;
}

// ─── Coach, No Rest? — NHL rest-disparity qualifier ──────────────────────────

async function refreshCoachNoRestSystemData(data: SystemsTrackingData, options: SystemRefreshOptions = {}): Promise<TrackedSystem> {
  const system = getTrackedSystem(data, COACH_NO_REST_SYSTEM_ID, () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(COACH_NO_REST_SYSTEM_ID)!));
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [board, aggregated] = await Promise.all([
    getTodayNHLContextBoard(),
    getAggregatedOddsForSport("NHL"),
  ]);

  const targetGames = (board.games || []).filter((game) => game.gameDate === targetDate);
  const freshRecords: SystemTrackingRecord[] = [];

  const audit = {
    gamesScanned: targetGames.length,
    matchedOddsEvent: 0,
    failedNoOddsEvent: 0,
    failedNoRestDisparity: 0,
    failedFatigueGap: 0,
    failedNoPrice: 0,
    failedPriceBand: 0,
    qualified: 0,
  };

  for (const game of targetGames) {
    const event = aggregated.find((candidate) => {
      if (getEventDate(candidate.commenceTime) !== game.gameDate) return false;
      return candidate.awayAbbrev === game.matchup.awayTeam.abbrev && candidate.homeAbbrev === game.matchup.homeTeam.abbrev;
    });
    if (!event) {
      audit.failedNoOddsEvent += 1;
      continue;
    }
    audit.matchedOddsEvent += 1;

    // Check both directions: which side is on B2B?
    const sides = [
      { fatigued: game.teams.away, rested: game.teams.home },
      { fatigued: game.teams.home, rested: game.teams.away },
    ];

    for (const { fatigued, rested } of sides) {
      // Fatigued side must be on B2B (0 rest days)
      if (!fatigued.derived.rest.isBackToBack) continue;
      // Rested side must have >= 2 rest days
      const restedDays = rested.derived.rest.restDays;
      if (restedDays === null || restedDays < 2) {
        audit.failedNoRestDisparity += 1;
        continue;
      }
      // Fatigue gap >= 15 points
      const fatiguedScore = fatigued.derived.fatigueScore;
      const restedScore = rested.derived.fatigueScore;
      if (fatiguedScore !== null && restedScore !== null && (fatiguedScore - restedScore) < 15) {
        audit.failedFatigueGap += 1;
        continue;
      }

      // We back the rested side
      const priceInfo = getNHLMoneylineForTeam(event, rested.teamAbbrev);
      const price = priceInfo?.odds ?? null;
      if (typeof price !== 'number' || !Number.isFinite(price)) { audit.failedNoPrice += 1; continue; }
      if (price < -175 || price > 170) { audit.failedPriceBand += 1; continue; }

      const xgRested = rested.sourced.moneyPuck?.xGoalsPercentage ?? null;
      const xgFatigued = fatigued.sourced.moneyPuck?.xGoalsPercentage ?? null;
      const totalLine = getEventTotalLine(event);
      const b2bGoalie = fatigued.sourced.goalie.starter;
      const b2bGoalieNote = b2bGoalie
        ? `${fatigued.teamAbbrev} B2B goalie: ${b2bGoalie.name} (${b2bGoalie.status}${b2bGoalie.isBackup ? ', backup' : ''}).`
        : `${fatigued.teamAbbrev} B2B goalie status unknown.`;

      const notes = [
        'Coach, No Rest? qualifier — rest disparity gate cleared. Back rested side. Not a pick.',
        `${fatigued.teamAbbrev} on B2B (0 rest days). ${rested.teamAbbrev} has ${restedDays} day${restedDays === 1 ? '' : 's'} rest.`,
        `Rest gap: ${restedDays} day${restedDays === 1 ? '' : 's'}. Fatigue scores: ${fatigued.teamAbbrev} ${fatiguedScore ?? '—'} vs ${rested.teamAbbrev} ${restedScore ?? '—'}.`,
        b2bGoalieNote,
        xgRested !== null && xgFatigued !== null ? `xG context: ${rested.teamAbbrev} ${xgRested.toFixed(3)} vs ${fatigued.teamAbbrev} ${xgFatigued.toFixed(3)}.` : 'xG context unavailable.',
        `${rested.teamAbbrev} ML ${price > 0 ? '+' : ''}${price}${priceInfo?.book ? ` (${priceInfo.book})` : ''}${totalLine != null ? ` • total ${totalLine}` : ''}.`,
      ].filter(Boolean).join(' • ');

      freshRecords.push(normalizeRecord({
        id: `${COACH_NO_REST_SYSTEM_ID}:${game.gameId}:${rested.teamAbbrev}`,
        gameId: String(game.gameId),
        oddsEventId: event.oddsApiEventId ?? null,
        gameDate: game.gameDate,
        matchup: `${game.matchup.awayTeam.abbrev} @ ${game.matchup.homeTeam.abbrev}`,
        roadTeam: game.matchup.awayTeam.abbrev,
        homeTeam: game.matchup.homeTeam.abbrev,
        recordKind: 'qualifier',
        marketType: 'moneyline',
        alertLabel: `Rest edge — ${fatigued.teamAbbrev} B2B vs ${restedDays}d rest ${rested.teamAbbrev}`,
        sourceHealthStatus: 'healthy',
        freshnessSummary: `Rest disparity: ${fatigued.teamAbbrev} 0 rest (B2B) vs ${rested.teamAbbrev} ${restedDays}d rest.`,
        qualifiedTeam: rested.teamAbbrev,
        opponentTeam: fatigued.teamAbbrev,
        xGoalsPercentage: xgRested,
        opponentXGoalsPercentage: xgFatigued,
        fatigueScore: restedScore,
        opponentFatigueScore: fatiguedScore,
        goalieStatus: rested.sourced.goalie.starter ? `${rested.sourced.goalie.starter.name} (${rested.sourced.goalie.starter.status})` : null,
        opponentGoalieStatus: b2bGoalie ? `${b2bGoalie.name} (${b2bGoalie.status}${b2bGoalie.isBackup ? ', backup' : ''})` : null,
        currentMoneyline: price,
        marketAvailability: totalLine != null ? `Moneyline + total posted${priceInfo?.book ? ` (${priceInfo.book})` : ''}.` : `Moneyline posted${priceInfo?.book ? ` (${priceInfo.book})` : ''}.`,
        totalLine,
        urgencyTier: rested.derived.playoffPressure.urgencyTier,
        source: 'NHL API schedule (rest days, B2B flag) + derived fatigue + goalie status + aggregated NHL odds',
        notes,
        lastSyncedAt: new Date().toISOString(),
      }));
      audit.qualified += 1;
      break; // At most one qualified side per game (the rested one)
    }
  }

  const priorRecords = system.records.filter((r) => r.gameDate !== targetDate);
  system.records = [...priorRecords, ...freshRecords].sort((a, b) =>
    a.gameDate.localeCompare(b.gameDate) || a.matchup.localeCompare(b.matchup),
  );

  const auditSummary = `Audit ${audit.gamesScanned} games • no odds ${audit.failedNoOddsEvent} • no rest disparity ${audit.failedNoRestDisparity} • fatigue gap ${audit.failedFatigueGap} • no price ${audit.failedNoPrice} • price band ${audit.failedPriceBand} • qualified ${audit.qualified}.`;

  system.status = audit.qualified > 0 ? 'tracking' : 'awaiting_data';
  system.snapshot = audit.qualified > 0
    ? `${audit.qualified} Coach, No Rest? qualifier${audit.qualified === 1 ? '' : 's'} for ${targetDate} — B2B vs rested matchup${audit.qualified === 1 ? '' : 's'} flagged. ${auditSummary}`
    : `No Coach, No Rest? qualifiers for ${targetDate} — no B2B vs 2+ day rested matchups on today's slate. ${auditSummary}`;
  system.automationStatusLabel = audit.qualified > 0 ? 'Live — rest-disparity alert active' : 'Awaiting B2B vs rested matchup';
  system.automationStatusDetail = `Daily rest-disparity screen: B2B team (0 rest) vs opponent with >=2 days rest, fatigue gap >=15, price -175 to +170. ${auditSummary}`;

  return system;
}

// ── Cross-sport splits helpers ────────────────────────────────────────────────

/**
 * Build a concise line-move context note for inclusion in a qualifier record's notes field.
 * Informational only — does NOT gate whether a qualifier fires.
 *
 * @param history - MarketHistoryRail from getMarketHistoryRail(), or null if unavailable.
 * @param marketType - The market we want to surface movement for ("moneyline" | "spread" | "total").
 */
function buildLineMoveContextNote(
  history: MarketHistoryRail | null,
  marketType: "moneyline" | "spread" | "total",
): string {
  if (!history || history.capturedSnapshots < 2) {
    return "Line-move history: no intraday snapshots yet — context unavailable.";
  }

  const relevant = history.deltas.filter((d) => d.marketType === marketType);
  if (relevant.length === 0) {
    return `Line-move history: ${history.capturedSnapshots} snapshot(s) captured — no ${marketType} deltas found.`;
  }

  const maxOddsDeltaEntry = relevant.reduce<(typeof relevant)[number] | null>((best, d) => {
    if (d.oddsDelta === null) return best;
    if (!best || Math.abs(d.oddsDelta) > Math.abs(best.oddsDelta ?? 0)) return d;
    return best;
  }, null);
  const maxLineDeltaEntry = relevant.reduce<(typeof relevant)[number] | null>((best, d) => {
    if (d.lineDelta === null) return best;
    if (!best || Math.abs(d.lineDelta) > Math.abs(best.lineDelta ?? 0)) return d;
    return best;
  }, null);

  const parts: string[] = [`Line-move history (${history.capturedSnapshots} snapshot(s), source: ${history.source}):`];

  if (maxOddsDeltaEntry?.oddsDelta != null) {
    const delta = maxOddsDeltaEntry.oddsDelta;
    parts.push(`${maxOddsDeltaEntry.outcome} odds moved ${delta > 0 ? "+" : ""}${delta} (${maxOddsDeltaEntry.book})`);
  }
  if (maxLineDeltaEntry?.lineDelta != null) {
    const delta = maxLineDeltaEntry.lineDelta;
    parts.push(`line moved ${delta > 0 ? "+" : ""}${delta.toFixed(1)} (${maxLineDeltaEntry.book})`);
  }

  return parts.join(" • ");
}

/**
 * Match an aggregated odds event for a game identified by home+away abbreviation.
 * Case-insensitive comparison. Optional date filter via commenceTime.
 */
function findAggregatedEventForSplitsGame(
  events: AggregatedOdds[],
  homeAbbrev: string,
  awayAbbrev: string,
  targetDate?: string,
): AggregatedOdds | null {
  const hn = homeAbbrev.toUpperCase().trim();
  const an = awayAbbrev.toUpperCase().trim();
  return (
    events.find((e) => {
      if (targetDate && getEventDate(e.commenceTime) !== targetDate) return false;
      return e.homeAbbrev.toUpperCase().trim() === hn && e.awayAbbrev.toUpperCase().trim() === an;
    }) ?? null
  );
}

// ── NHL Handle Systems — refresh functions ────────────────────────────────────

/**
 * NHL Home Dog — Majority Handle
 * Fires when: NHL home team is ML underdog AND holds ≥ 60% of ML handle (tightened from 55% 2026-03-29).
 * Line-move history attached as context note when Supabase snapshots available.
 */
async function refreshNHLHomeDogMajorityHandleSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    NHL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(NHL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [splitsResult, aggregatedEvents] = await Promise.all([
    getBettingSplits("NHL", targetDate).catch(() => null),
    getAggregatedOddsForSport("NHL").catch(() => [] as AggregatedOdds[]),
  ]);

  const freshRecords: SystemTrackingRecord[] = [];
  const audit = { gamesScanned: 0, noSplits: 0, notAvailable: 0, notUnderdog: 0, notMajorityHandle: 0, qualified: 0 };

  if (splitsResult?.available) {
    for (const game of splitsResult.games) {
      if (game.gameDate !== targetDate) continue;
      audit.gamesScanned += 1;
      if (!game.mlSplitsAvailable) { audit.notAvailable += 1; continue; }

      const { side1: homeEntry } = getMarketSplits(game, "moneyline");
      const homeHandlePct = homeEntry?.handlePercent ?? null;
      // Tightened threshold: 55% → 60% (2026-03-29) to reduce noise
      if (homeHandlePct === null || homeHandlePct < 60) { audit.notMajorityHandle += 1; continue; }

      // Check if home team is an underdog using aggregated odds
      const event = findAggregatedEventForSplitsGame(aggregatedEvents, game.homeTeam, game.awayTeam, targetDate);
      const homeML = event?.bestHome?.odds ?? null;
      if (homeML === null || homeML <= 0) { audit.notUnderdog += 1; continue; }

      audit.qualified += 1;
      const awayHandlePct = game.splits.find((s) => s.source === game.effectiveSource && s.marketType === "moneyline" && s.side === "away")?.handlePercent ?? null;
      const totalLine = event ? getEventTotalLine(event) : null;

      // ── Line-move context (informational, not a qualifier gate) ──────────
      const history = event ? await getMarketHistoryRail(event).catch(() => null) : null;
      const lineMoveNote = buildLineMoveContextNote(history, "moneyline");
      const lineConfirmed = history !== null && history.capturedSnapshots >= 2 && history.deltas.some((d) => d.marketType === "moneyline" && d.oddsDelta !== null && Math.abs(d.oddsDelta) >= 5);

      freshRecords.push(normalizeRecord({
        id: `${NHL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID}:${targetDate}:${game.homeTeam}`,
        gameDate: targetDate,
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
        roadTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        qualifiedTeam: game.homeTeam,
        opponentTeam: game.awayTeam,
        recordKind: "qualifier",
        marketType: "moneyline",
        alertLabel: `NHL home dog ${game.homeTeam} +${homeML} — ${homeHandlePct}% ML handle${lineConfirmed ? " [line-confirmed]" : ""}`,
        currentMoneyline: homeML,
        totalLine,
        sourceHealthStatus: "healthy",
        freshnessSummary: `NHL handle splits live. Source: ${game.effectiveSource}.${history ? ` Line history: ${history.capturedSnapshots} snapshot(s) (${history.source}).` : " No line history yet."}`,
        notes: [
          `NHL Home Dog Majority Handle qualifier — ${game.homeTeam} home dog vs ${game.awayTeam}.`,
          `ML handle: ${homeHandlePct}% on ${game.homeTeam} (home)${awayHandlePct !== null ? ` vs ${awayHandlePct}% on ${game.awayTeam}` : ""}.`,
          `Home ML: +${homeML}. ${totalLine !== null ? `Total: ${totalLine}.` : ""}`,
          lineMoveNote,
          `Source: Action Network (${game.effectiveSource}).`,
          `System pick: back the qualified home dog moneyline when this qualifier fires. This is tracked, graded, and kept in system history.`,
        ].join(" • "),
        lastSyncedAt: new Date().toISOString(),
      }));
    }
  } else {
    audit.noSplits = 1;
  }

  const auditNote = `Scanned ${audit.gamesScanned} NHL games. No splits: ${audit.noSplits}. Not available: ${audit.notAvailable}. Not dog: ${audit.notUnderdog}. Below 60% handle: ${audit.notMajorityHandle}. Qualified: ${audit.qualified}.`;
  system.status = "tracking" as SystemTrackingStatus;
  system.trackabilityBucket = "trackable_now" as SystemTrackabilityBucket;
  system.snapshot = audit.qualified > 0
    ? `🟢 ${audit.qualified} NHL Home Dog qualifier(s) today | ${auditNote}`
    : `🟡 No qualifiers today | ${auditNote}`;
  system.records = freshRecords;
  return system;
}

/**
 * NHL Under — Majority Handle
 * Fires when: total is exactly 5.5 and public under handle is strong enough to matter.
 * Line-move history attached as context note when Supabase snapshots available.
 */
async function refreshNHLUnderMajorityHandleSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [splitsResult, aggregatedEvents] = await Promise.all([
    getBettingSplits("NHL", targetDate).catch(() => null),
    getAggregatedOddsForSport("NHL").catch(() => [] as AggregatedOdds[]),
  ]);

  const freshRecords: SystemTrackingRecord[] = [];
  const audit = { gamesScanned: 0, noSplits: 0, notAvailable: 0, belowThreshold: 0, qualified: 0 };

  if (splitsResult?.available) {
    for (const game of splitsResult.games) {
      if (game.gameDate !== targetDate) continue;
      audit.gamesScanned += 1;
      if (!game.totalSplitsAvailable) { audit.notAvailable += 1; continue; }

      const { side1: overEntry, side2: underEntry } = getMarketSplits(game, "total");
      const underHandlePct = underEntry?.handlePercent ?? null;
      const totalLine = underEntry?.line ?? overEntry?.line ?? null;
      // Tightened threshold: 58% → 62% (2026-03-29) to improve signal quality
      if (underHandlePct === null || underHandlePct < 62) { audit.belowThreshold += 1; continue; }
      if (totalLine !== 5.5) { audit.belowThreshold += 1; continue; }

      audit.qualified += 1;
      const overHandlePct = overEntry?.handlePercent ?? null;
      const event = findAggregatedEventForSplitsGame(aggregatedEvents, game.homeTeam, game.awayTeam, targetDate);
      const homeML = event?.bestHome?.odds ?? null;

      // ── Line-move context (informational, not a qualifier gate) ──────────
      const history = event ? await getMarketHistoryRail(event).catch(() => null) : null;
      const lineMoveNote = buildLineMoveContextNote(history, "total");
      const lineConfirmed = history !== null && history.capturedSnapshots >= 2 && history.deltas.some((d) => d.marketType === "total" && d.lineDelta !== null && Math.abs(d.lineDelta) >= 0.5);

      freshRecords.push(normalizeRecord({
        id: `${NHL_UNDER_MAJORITY_HANDLE_SYSTEM_ID}:${targetDate}:${game.homeTeam}`,
        gameDate: targetDate,
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
        roadTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        qualifiedTeam: null,
        opponentTeam: null,
        recordKind: "qualifier",
        marketType: "total",
        alertLabel: `Under ${totalLine ?? "?"} — ${underHandlePct}% handle in NHL${lineConfirmed ? " [line-confirmed]" : ""}`,
        currentMoneyline: homeML,
        totalLine,
        sourceHealthStatus: "healthy",
        freshnessSummary: `NHL total handle splits live. Source: ${game.effectiveSource}.${history ? ` Line history: ${history.capturedSnapshots} snapshot(s) (${history.source}).` : " No line history yet."}`,
        notes: [
          `NHL Under Majority Handle qualifier — ${game.awayTeam} @ ${game.homeTeam}.`,
          `Total handle: ${underHandlePct}% Under vs ${overHandlePct !== null ? overHandlePct + "% Over" : "—"}.`,
          `Total line: ${totalLine ?? "—"}.${homeML !== null ? ` Home ML: ${homeML > 0 ? "+" : ""}${homeML}.` : ""}`,
          lineMoveNote,
          `Source: Action Network (${game.effectiveSource}).`,
          `System pick: play the full-game under when this qualifier fires. This is tracked, graded, and kept in system history.`,
        ].join(" • "),
        lastSyncedAt: new Date().toISOString(),
      }));
    }
  } else {
    audit.noSplits = 1;
  }

  const auditNote = `Scanned ${audit.gamesScanned} NHL games. No splits: ${audit.noSplits}. Total unavailable: ${audit.notAvailable}. Below 62% threshold: ${audit.belowThreshold}. Qualified: ${audit.qualified}.`;
  system.status = "tracking" as SystemTrackingStatus;
  system.trackabilityBucket = "trackable_now" as SystemTrackabilityBucket;
  system.snapshot = audit.qualified > 0
    ? `🟢 ${audit.qualified} NHL Under qualifier(s) today | ${auditNote}`
    : `🟡 No NHL under qualifiers today | ${auditNote}`;
  system.records = freshRecords;
  return system;
}

// ── MLB Handle Systems — refresh functions ────────────────────────────────────

/**
 * MLB Home — Majority Handle
 * Fires when: MLB home team holds ≥ 60% of ML handle (tightened from 55% 2026-03-29 — watchlist, no bet direction implied).
 * Line-move history attached as context note when Supabase snapshots available.
 */
async function refreshMLBHomeMajorityHandleSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    MLB_HOME_MAJORITY_HANDLE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(MLB_HOME_MAJORITY_HANDLE_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [splitsResult, aggregatedEvents] = await Promise.all([
    getBettingSplits("MLB", targetDate).catch(() => null),
    getAggregatedOddsForSport("MLB").catch(() => [] as AggregatedOdds[]),
  ]);

  const freshRecords: SystemTrackingRecord[] = [];
  const audit = { gamesScanned: 0, noSplits: 0, notAvailable: 0, belowThreshold: 0, qualified: 0 };

  if (splitsResult?.available) {
    for (const game of splitsResult.games) {
      if (game.gameDate !== targetDate) continue;
      audit.gamesScanned += 1;
      if (!game.mlSplitsAvailable) { audit.notAvailable += 1; continue; }

      const { side1: homeEntry } = getMarketSplits(game, "moneyline");
      const homeHandlePct = homeEntry?.handlePercent ?? null;
      // Tightened threshold: 55% → 60% (2026-03-29) — 55% fires too broadly given structural home-team bias
      if (homeHandlePct === null || homeHandlePct < 60) { audit.belowThreshold += 1; continue; }

      const awayHandlePct = game.splits.find((s) => s.source === game.effectiveSource && s.marketType === "moneyline" && s.side === "away")?.handlePercent ?? null;
      const event = findAggregatedEventForSplitsGame(aggregatedEvents, game.homeTeam, game.awayTeam, targetDate);
      const homeML = event?.bestHome?.odds ?? null;
      const awayML = event?.bestAway?.odds ?? null;
      const totalLine = event ? getEventTotalLine(event) : null;
      const homeIsUnderdog = homeML !== null && homeML > 0;

      if (homeML === null) {
        audit.notAvailable += 1;
        continue;
      }

      audit.qualified += 1;

      // ── Line-move context (informational, not a qualifier gate) ──────────
      const history = event ? await getMarketHistoryRail(event).catch(() => null) : null;
      const lineMoveNote = buildLineMoveContextNote(history, "moneyline");
      const lineConfirmed = history !== null && history.capturedSnapshots >= 2 && history.deltas.some((d) => d.marketType === "moneyline" && d.oddsDelta !== null && Math.abs(d.oddsDelta) >= 5);

      freshRecords.push(normalizeRecord({
        id: `${MLB_HOME_MAJORITY_HANDLE_SYSTEM_ID}:${targetDate}:${game.homeTeam}`,
        gameDate: targetDate,
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
        roadTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        qualifiedTeam: game.homeTeam,
        opponentTeam: game.awayTeam,
        recordKind: "qualifier",
        marketType: "moneyline",
        alertLabel: `MLB home ${homeIsUnderdog ? "dog" : "fav"} ${game.homeTeam} — ${homeHandlePct}% ML handle${lineConfirmed ? " [line-confirmed]" : ""}`,
        currentMoneyline: homeML,
        totalLine,
        sourceHealthStatus: "healthy",
        freshnessSummary: `MLB ML handle splits live. Source: ${game.effectiveSource}.${history ? ` Line history: ${history.capturedSnapshots} snapshot(s) (${history.source}).` : " No line history yet."}`,
        notes: [
          `MLB Home Majority Handle qualifier — ${game.homeTeam} home vs ${game.awayTeam}.`,
          `ML handle: ${homeHandlePct}% on ${game.homeTeam}${awayHandlePct !== null ? ` vs ${awayHandlePct}% on ${game.awayTeam}` : ""}.`,
          `Home ML: ${homeML !== null ? (homeML > 0 ? "+" : "") + homeML : "—"}. Away ML: ${awayML !== null ? (awayML > 0 ? "+" : "") + awayML : "—"}.${totalLine !== null ? ` Total: ${totalLine}.` : ""}`,
          homeIsUnderdog ? "Home team is ML underdog — public backing a dog (notable)." : "Home team is ML favourite — public backing expected.",
          lineMoveNote,
          `Source: Action Network (${game.effectiveSource}).`,
          `System pick: back the qualified home team moneyline when this qualifier fires. This is tracked, graded, and kept in system history. No inflated historical claim — results build from tracked grading.`,
        ].join(" • "),
        lastSyncedAt: new Date().toISOString(),
      }));
    }
  } else {
    audit.noSplits = 1;
  }

  const auditNote = `Scanned ${audit.gamesScanned} MLB games. No splits: ${audit.noSplits}. ML unavailable: ${audit.notAvailable}. Below 60% threshold: ${audit.belowThreshold}. Qualified: ${audit.qualified}.`;
  system.status = "tracking" as SystemTrackingStatus;
  system.trackabilityBucket = "trackable_now" as SystemTrackabilityBucket;
  system.snapshot = audit.qualified > 0
    ? `🟢 ${audit.qualified} MLB Home Handle qualifier(s) today | ${auditNote}`
    : `🟡 No MLB home handle qualifiers today | ${auditNote}`;
  system.records = freshRecords;
  return system;
}

/**
 * MLB Under — Majority Handle
 * Fires when: ≥ 62% of total handle goes to the Under in MLB games (tightened from 58% 2026-03-29).
 */
async function refreshMLBUnderMajorityHandleSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [splitsResult, aggregatedEvents] = await Promise.all([
    getBettingSplits("MLB", targetDate).catch(() => null),
    getAggregatedOddsForSport("MLB").catch(() => [] as AggregatedOdds[]),
  ]);

  const freshRecords: SystemTrackingRecord[] = [];
  const audit = { gamesScanned: 0, noSplits: 0, notAvailable: 0, belowThreshold: 0, qualified: 0 };

  if (splitsResult?.available) {
    for (const game of splitsResult.games) {
      if (game.gameDate !== targetDate) continue;
      audit.gamesScanned += 1;
      if (!game.totalSplitsAvailable) { audit.notAvailable += 1; continue; }

      const { side1: overEntry, side2: underEntry } = getMarketSplits(game, "total");
      const underHandlePct = underEntry?.handlePercent ?? null;
      // Tightened threshold: 58% → 62% (2026-03-29) — 58% fires too broadly in MLB; 62% is a more distinct sharp signal
      if (underHandlePct === null || underHandlePct < 62) { audit.belowThreshold += 1; continue; }

      audit.qualified += 1;
      const overHandlePct = overEntry?.handlePercent ?? null;
      const totalLine = underEntry?.line ?? overEntry?.line ?? null;
      const event = findAggregatedEventForSplitsGame(aggregatedEvents, game.homeTeam, game.awayTeam, targetDate);
      const homeML = event?.bestHome?.odds ?? null;

      // ── Line-move context (informational, not a qualifier gate) ──────────
      const history = event ? await getMarketHistoryRail(event).catch(() => null) : null;
      const lineMoveNote = buildLineMoveContextNote(history, "total");
      const lineConfirmed = history !== null && history.capturedSnapshots >= 2 && history.deltas.some((d) => d.marketType === "total" && d.lineDelta !== null && Math.abs(d.lineDelta) >= 0.5);

      freshRecords.push(normalizeRecord({
        id: `${MLB_UNDER_MAJORITY_HANDLE_SYSTEM_ID}:${targetDate}:${game.homeTeam}`,
        gameDate: targetDate,
        matchup: `${game.awayTeam} @ ${game.homeTeam}`,
        roadTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        qualifiedTeam: null,
        opponentTeam: null,
        recordKind: "qualifier",
        marketType: "total",
        alertLabel: `Under ${totalLine ?? "?"} — ${underHandlePct}% handle in MLB${lineConfirmed ? " [line-confirmed]" : ""}`,
        currentMoneyline: homeML,
        totalLine,
        sourceHealthStatus: "healthy",
        freshnessSummary: `MLB total handle splits live. Source: ${game.effectiveSource}.${history ? ` Line history: ${history.capturedSnapshots} snapshot(s) (${history.source}).` : " No line history yet."}`,
        notes: [
          `MLB Under Majority Handle qualifier — ${game.awayTeam} @ ${game.homeTeam}.`,
          `Total handle: ${underHandlePct}% Under vs ${overHandlePct !== null ? overHandlePct + "% Over" : "—"}.`,
          `Total line: ${totalLine ?? "—"}.${homeML !== null ? ` Home ML: ${homeML > 0 ? "+" : ""}${homeML}.` : ""}`,
          lineMoveNote,
          `Source: Action Network (${game.effectiveSource}).`,
          `System pick: play the full-game under when this qualifier fires. This is tracked, graded, and kept in system history. Starter quality and park context stay attached as supporting context.`,
        ].join(" • "),
        lastSyncedAt: new Date().toISOString(),
      }));
    }
  } else {
    audit.noSplits = 1;
  }

  const auditNote = `Scanned ${audit.gamesScanned} MLB games. No splits: ${audit.noSplits}. Total unavailable: ${audit.notAvailable}. Below 62% threshold: ${audit.belowThreshold}. Qualified: ${audit.qualified}.`;
  system.status = "tracking" as SystemTrackingStatus;
  system.trackabilityBucket = "trackable_now" as SystemTrackabilityBucket;
  system.snapshot = audit.qualified > 0
    ? `🟢 ${audit.qualified} MLB Under qualifier(s) today | ${auditNote}`
    : `🟡 No MLB under qualifiers today | ${auditNote}`;
  system.records = freshRecords;
  return system;
}

// ── NFL Handle System — refresh function (off-season dormant) ────────────────

/**
 * NFL Home Dog — Majority Handle
 * System logic is wired. Off-season during Mar–Aug; returns zero records honestly.
 */

async function refreshBigCatsNBA1QUnderSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);
  const todayGames = (await getAggregatedOddsForSport("NBA").catch(() => [] as AggregatedOdds[]))
    .filter((g) => getEventDate(g.commenceTime) === targetDate);
  const freshRecords: SystemTrackingRecord[] = [];
  for (const game of todayGames) {
    const totalLine = getEventTotalLine(game);
    if (totalLine == null || totalLine < 210 || totalLine > 225) continue;
    const impliedQ1 = Number((totalLine * 0.28).toFixed(1));
    freshRecords.push(normalizeRecord({
      id: `${BIG_CATS_NBA_1Q_UNDER_SYSTEM_ID}:${targetDate}:${game.awayAbbrev}@${game.homeAbbrev}`,
      gameDate: targetDate,
      matchup: `${game.awayAbbrev} @ ${game.homeAbbrev}`,
      roadTeam: game.awayAbbrev,
      homeTeam: game.homeAbbrev,
      recordKind: "qualifier",
      marketType: "first-quarter-total",
      alertLabel: `NBA 1Q Under candidate — game total ${totalLine}, target 1Q line ~${impliedQ1}`,
      totalLine: impliedQ1,
      sourceHealthStatus: "healthy",
      freshnessSummary: `NBA odds board + totals live for ${targetDate}.`,
      notes: [
        `Big Cats NBA 1Q Under candidate — ${game.awayAbbrev} @ ${game.homeAbbrev}.`,
        `Full-game total ${totalLine} falls inside the validated 210–225 band.`,
        `Backtest proxy uses 28% of full-game total as the target 1Q threshold (~${impliedQ1}).`,
        `This is a live qualifier rail pending direct sportsbook 1Q total capture for exact grading.`,
      ].join(" • "),
      lastSyncedAt: new Date().toISOString(),
    }));
  }
  system.status = "tracking" as SystemTrackingStatus;
  system.trackabilityBucket = "trackable_now" as SystemTrackabilityBucket;
  system.snapshot = freshRecords.length
    ? `🟢 ${freshRecords.length} Big Cats NBA 1Q Under qualifier(s) today`
    : `🟡 No Big Cats NBA 1Q Under qualifiers today`;
  system.records = freshRecords;
  return system;
}

async function refreshNFLHomeDogMajorityHandleSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  // Check for NFL splits — off-season returns empty board
  const splitsResult = await getBettingSplits("NFL", targetDate).catch(() => null);
  const hasGames = Boolean(splitsResult?.available && (splitsResult.games?.length ?? 0) > 0);

  if (!hasGames) {
    // Honest off-season: no records, dormant status
    const updated: TrackedSystem = {
      ...system,
      status: "awaiting_data" as SystemTrackingStatus,
      snapshot: "🔴 OFF-SEASON | NFL regular season resumes ~Sep 2026. No current slate — zero records stored (honest).",
      automationStatusLabel: "Wired — dormant off-season",
      automationStatusDetail: `getBettingSplits("NFL") returned ${hasGames ? "games" : "empty board"} for ${targetDate}. System will auto-activate when a live NFL slate exists.`,
      records: [],
    };
    return updated;
  }

  // If somehow an NFL game exists (preseason, etc.), run the qualifier logic
  const aggregatedEvents = await getAggregatedOddsForSport("NFL").catch(() => [] as AggregatedOdds[]);
  const freshRecords: SystemTrackingRecord[] = [];
  const audit = { gamesScanned: 0, notAvailable: 0, notUnderdog: 0, notMajorityHandle: 0, qualified: 0 };

  for (const game of (splitsResult?.games ?? [])) {
    if (game.gameDate !== targetDate) continue;
    audit.gamesScanned += 1;
    if (!game.mlSplitsAvailable) { audit.notAvailable += 1; continue; }

    const { side1: homeEntry } = getMarketSplits(game, "moneyline");
    const homeHandlePct = homeEntry?.handlePercent ?? null;
    if (homeHandlePct === null || homeHandlePct < 55) { audit.notMajorityHandle += 1; continue; }

    const event = findAggregatedEventForSplitsGame(aggregatedEvents, game.homeTeam, game.awayTeam, targetDate);
    const homeML = event?.bestHome?.odds ?? null;
    if (homeML === null || homeML <= 0) { audit.notUnderdog += 1; continue; }

    audit.qualified += 1;
    const totalLine = event ? getEventTotalLine(event) : null;
    freshRecords.push(normalizeRecord({
      id: `${NFL_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID}:${targetDate}:${game.homeTeam}`,
      gameDate: targetDate,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      roadTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      qualifiedTeam: game.homeTeam,
      opponentTeam: game.awayTeam,
      recordKind: "qualifier",
      marketType: "moneyline",
      alertLabel: `NFL home dog ${game.homeTeam} +${homeML} with ${homeHandlePct}% ML handle`,
      currentMoneyline: homeML,
      totalLine,
      sourceHealthStatus: "healthy",
      freshnessSummary: `NFL handle splits live. Source: ${game.effectiveSource}.`,
      notes: [
        `NFL Home Dog Majority Handle qualifier — ${game.homeTeam} home dog vs ${game.awayTeam}.`,
        `ML handle: ${homeHandlePct}% on ${game.homeTeam}. Home ML: +${homeML}.`,
        `Source: Action Network (${game.effectiveSource}). Alert only.`,
      ].join(" • "),
      lastSyncedAt: new Date().toISOString(),
    }));
  }

  const auditNote = `Scanned ${audit.gamesScanned} NFL games. Not available: ${audit.notAvailable}. Not dog: ${audit.notUnderdog}. Below threshold: ${audit.notMajorityHandle}. Qualified: ${audit.qualified}.`;
  return {
    ...system,
    status: audit.qualified > 0 ? "tracking" as SystemTrackingStatus : "awaiting_data" as SystemTrackingStatus,
    snapshot: audit.qualified > 0
      ? `🟢 ${audit.qualified} NFL Home Dog qualifier(s) today | ${auditNote}`
      : `🟡 No NFL qualifiers today | ${auditNote}`,
    records: freshRecords,
  };
}

export async function refreshTrackedSystem(systemId: string, options: SystemRefreshOptions = {}): Promise<TrackedSystem | null> {
  const tracker = SYSTEM_TRACKERS[systemId];
  if (!tracker) return null;

  const data = await readSystemsTrackingData();
  const system = await tracker.refresh(data, options);
  data.systems = data.systems.map((entry) => entry.id === system.id ? system : entry);
  upsertSystemQualificationLog(data, system);
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
    const refreshedSystem = await tracker.refresh(data, options);
    data.systems = data.systems.map((entry) => entry.id === refreshedSystem.id ? refreshedSystem : entry);
    upsertSystemQualificationLog(data, refreshedSystem);
    refreshed.push(refreshedSystem);
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

export function getSystemDerivedMetrics(system: TrackedSystem, data?: SystemsTrackingData): SystemDerivedMetrics {
  const qualifiedRows = system.records.filter((record) => {
    if (!record) return false;
    if (record.recordKind === "progression") return true;
    if (record.marketType === "total" || record.marketType === "f5-total") return true;
    return Boolean(record.qualifiedTeam);
  });
  const qualifiedGames = qualifiedRows.length;
  const trackableRows = qualifiedRows.filter((record) => record.firstQuarterSpread != null && record.thirdQuarterSpread != null);
  const trackableGames = trackableRows.length;
  const completedRows = system.records.filter((record) => record.sequenceResult && record.sequenceResult !== "pending");
  const ungradeableRows = system.records.filter((record) => isGooseRecordUngradeable(record));
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
    performance: getSystemPerformanceSummary(system, data),
  };
}

// ─── Supabase-backed performance history API ─────────────────────────────────

/**
 * Load per-system W/L/net-units stats from Supabase DB view.
 * Returns an empty array gracefully if the table is absent or Supabase is unavailable.
 */
export async function loadSystemPerformanceStats(systemId?: string): Promise<DbSystemPerformanceSummary[]> {
  return getSystemPerformanceFromDb(systemId);
}

/**
 * Load full qualifier history rows for a system (for admin/detail page display).
 * Returns an empty array gracefully if Supabase unavailable.
 */
export async function loadSystemQualifierHistory(systemId: string, limitDays = 90): Promise<DbSystemQualifier[]> {
  return loadSystemQualifiers(systemId, limitDays);
}

// Re-export DB types so callers don't need a separate import
export type { DbSystemQualifier, DbSystemPerformanceSummary };

// ─── NBA Handle Systems — refresh functions ───────────────────────────────────

/**
 * Refresh qualifier data for "Home Dog with Majority Handle" (NBA).
 *
 * Fires when: home team is ML underdog AND holds ≥ 55% of ML handle dollars.
 * Source: Action Network handle splits via nba-handle.ts.
 */
async function refreshNBAHomeDogMajorityHandleSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {}
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    NBA_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(NBA_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID)!)
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  // Fetch handle board and NBA schedule in parallel
  const [handleBoard, schedule] = await Promise.all([
    getNBAHandleBoard(),
    getNBASchedule(1).catch(() => [] as NBAGame[]),
  ]);

  const todayGames = schedule.filter((g) => g.date === targetDate);
  const freshRecords: SystemTrackingRecord[] = [];

  const audit = {
    gamesScanned: todayGames.length,
    splitsFound: 0,
    splitsUnavailable: 0,
    lowVolume: 0,
    notUnderdog: 0,
    notMajorityHandle: 0,
    qualified: 0,
  };

  for (const game of todayGames) {
    const splits = findHandleSplitsForGame(
      handleBoard,
      game.homeTeam.abbreviation,
      game.awayTeam.abbreviation
    );

    if (!splits) {
      audit.splitsUnavailable += 1;
      continue;
    }
    audit.splitsFound += 1;

    if (!splits.splitsAvailable) {
      audit.splitsUnavailable += 1;
      continue;
    }
    if (splits.numBets < 200) {
      audit.lowVolume += 1;
      continue;
    }

    if (!qualifiesHomeUnderdogMajorityHandle(splits)) {
      if (splits.homeML != null && splits.homeML <= 0) audit.notUnderdog += 1;
      else audit.notMajorityHandle += 1;
      continue;
    }

    audit.qualified += 1;
    const homeML = splits.homeML;
    const mlMoneyPct = splits.mlHomeMoneyPct;
    const mlTicketPct = splits.mlHomeTicketPct;

    const notes = [
      `Home Dog Majority Handle qualifier — ${game.homeTeam.abbreviation} home dog vs ${game.awayTeam.abbreviation}.`,
      `ML handle: ${mlMoneyPct}% on ${game.homeTeam.abbreviation} (home). Ticket %: ${mlTicketPct ?? "—"}%.`,
      `Home ML: +${homeML}. Spread: ${splits.spreadAway != null ? `${game.awayTeam.abbreviation} ${splits.spreadAway}` : "—"}.`,
      `Num bets tracked: ${splits.numBets}. Source: Action Network.`,
      `System pick: back the home team moneyline when this qualifier fires. This is tracked, graded, and kept in system history.`,
    ].join(" • ");

    freshRecords.push(
      normalizeRecord({
        id: `${NBA_HOME_DOG_MAJORITY_HANDLE_SYSTEM_ID}:${targetDate}:${game.homeTeam.abbreviation}`,
        gameDate: targetDate,
        matchup: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        roadTeam: game.awayTeam.abbreviation,
        homeTeam: game.homeTeam.abbreviation,
        qualifiedTeam: game.homeTeam.abbreviation,
        opponentTeam: game.awayTeam.abbreviation,
        recordKind: "qualifier",
        marketType: "moneyline",
        alertLabel: `Home dog ${game.homeTeam.abbreviation} +${homeML} with ${mlMoneyPct}% ML handle`,
        currentMoneyline: homeML,
        sourceHealthStatus: "healthy",
        freshnessSummary: `Handle splits live. ${splits.numBets} bets tracked. Fetched ${splits.fetchedAt}.`,
        notes,
      })
    );
  }

  const auditNote = `Scanned ${audit.gamesScanned} games. Splits found: ${audit.splitsFound}. No splits: ${audit.splitsUnavailable}. Low vol: ${audit.lowVolume}. Qualified: ${audit.qualified}.`;

  const updated: TrackedSystem = {
    ...system,
    status: "tracking" as SystemTrackingStatus,
    trackabilityBucket: "trackable_now" as SystemTrackabilityBucket,
    snapshot: audit.qualified > 0
      ? `🟢 ${audit.qualified} qualifier(s) today | ${auditNote}`
      : `🟡 No qualifiers today | ${auditNote}`,
    dataRequirements: (system.dataRequirements ?? []).map((req) => ({
      ...req,
      status: "ready" as DataRequirementStatus,
    })),
    records: freshRecords,
  };

  return updated;
}

/**
 * Refresh qualifier data for "Home Super-Majority Handle (Close Game)" (NBA).
 *
 * Fires when: home team holds ≥ 65% of ML handle dollars AND spread is ±4 or tighter.
 * Source: Action Network handle splits via nba-handle.ts.
 */
async function refreshNBAHomeSuperMajorityCloseGameSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {}
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    NBA_HOME_SUPER_MAJORITY_CLOSE_GAME_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(NBA_HOME_SUPER_MAJORITY_CLOSE_GAME_SYSTEM_ID)!)
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  const [handleBoard, schedule] = await Promise.all([
    getNBAHandleBoard(),
    getNBASchedule(1).catch(() => [] as NBAGame[]),
  ]);

  const todayGames = schedule.filter((g) => g.date === targetDate);
  const freshRecords: SystemTrackingRecord[] = [];

  const audit = {
    gamesScanned: todayGames.length,
    splitsFound: 0,
    splitsUnavailable: 0,
    lowVolume: 0,
    notCloseGame: 0,
    notSuperMajority: 0,
    qualified: 0,
  };

  for (const game of todayGames) {
    const splits = findHandleSplitsForGame(
      handleBoard,
      game.homeTeam.abbreviation,
      game.awayTeam.abbreviation
    );

    if (!splits) {
      audit.splitsUnavailable += 1;
      continue;
    }
    audit.splitsFound += 1;

    if (!splits.splitsAvailable) {
      audit.splitsUnavailable += 1;
      continue;
    }
    if (splits.numBets < 200) {
      audit.lowVolume += 1;
      continue;
    }

    if (!qualifiesHomeSuperMajorityHandleCloseGame(splits)) {
      if (splits.spreadAway != null && Math.abs(splits.spreadAway) > 4) audit.notCloseGame += 1;
      else audit.notSuperMajority += 1;
      continue;
    }

    audit.qualified += 1;
    const homeML = splits.homeML;
    const mlMoneyPct = splits.mlHomeMoneyPct;
    const mlTicketPct = splits.mlHomeTicketPct;
    const homeSpread = splits.spreadAway != null ? -splits.spreadAway : null;

    const notes = [
      `Home Super-Majority Handle (Close Game) qualifier — ${game.homeTeam.abbreviation} home vs ${game.awayTeam.abbreviation}.`,
      `ML handle: ${mlMoneyPct}% on ${game.homeTeam.abbreviation}. Ticket %: ${mlTicketPct ?? "—"}%.`,
      `Spread: ${homeSpread != null ? `${game.homeTeam.abbreviation} ${homeSpread > 0 ? "+" : ""}${homeSpread}` : "—"}. ML: ${homeML != null ? (homeML > 0 ? "+" : "") + homeML : "—"}.`,
      `Num bets: ${splits.numBets}. Source: Action Network.`,
      `System pick: back the home team moneyline when this qualifier fires in a close spread game with super-majority handle. This is tracked, graded, and kept in system history.`,
    ].join(" • ");

    freshRecords.push(
      normalizeRecord({
        id: `${NBA_HOME_SUPER_MAJORITY_CLOSE_GAME_SYSTEM_ID}:${targetDate}:${game.homeTeam.abbreviation}`,
        gameDate: targetDate,
        matchup: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        roadTeam: game.awayTeam.abbreviation,
        homeTeam: game.homeTeam.abbreviation,
        qualifiedTeam: game.homeTeam.abbreviation,
        opponentTeam: game.awayTeam.abbreviation,
        recordKind: "qualifier",
        marketType: "moneyline",
        alertLabel: `${game.homeTeam.abbreviation} ${mlMoneyPct}% handle in ±${Math.abs(homeSpread ?? 0)} spread game`,
        currentMoneyline: homeML ?? null,
        sourceHealthStatus: "healthy",
        freshnessSummary: `Handle splits live. ${splits.numBets} bets tracked. Fetched ${splits.fetchedAt}.`,
        notes,
      })
    );
  }

  const auditNote = `Scanned ${audit.gamesScanned} games. Splits found: ${audit.splitsFound}. No splits: ${audit.splitsUnavailable}. Low vol: ${audit.lowVolume}. Qualified: ${audit.qualified}.`;

  const updated: TrackedSystem = {
    ...system,
    status: "tracking" as SystemTrackingStatus,
    trackabilityBucket: "trackable_now" as SystemTrackabilityBucket,
    snapshot: audit.qualified > 0
      ? `🟢 ${audit.qualified} qualifier(s) today | ${auditNote}`
      : `🟡 No qualifiers today | ${auditNote}`,
    dataRequirements: (system.dataRequirements ?? []).map((req) => ({
      ...req,
      status: "ready" as DataRequirementStatus,
    })),
    records: freshRecords,
  };

  return updated;
}

// ─── Fuch's Fade — refresh function ─────────────────────────────────────────

/**
 * Refresh qualifier data for "Fuch's Fade" (NBA).
 *
 * Fires when:
 *   1. Public spread bets% >= 60% on one side (Action Network DK primary).
 *   2. Spread line moved >= 0.5 points since first snapshot today.
 *   3. Line-move history has >= 2 Supabase snapshots (no history = no qualifier).
 *   4. Faded side's best spread odds are between -135 and +135.
 *
 * Source: betting-splits.ts (Action Network) + market-snapshot-history.ts (Supabase fallback).
 */
async function refreshFuchsFadeSystemData(
  data: SystemsTrackingData,
  options: SystemRefreshOptions = {},
): Promise<TrackedSystem> {
  const system = getTrackedSystem(
    data,
    FAT_TONYS_FADE_SYSTEM_ID,
    () => normalizeSystem(SYSTEM_TEMPLATE_MAP.get(FAT_TONYS_FADE_SYSTEM_ID)!),
  );
  const targetDate = options.date || new Date().toISOString().slice(0, 10);

  // Fetch NBA splits + NBA odds board in parallel
  const [splitsBoard, aggregatedEvents] = await Promise.all([
    getBettingSplits("NBA", targetDate).catch(() => null),
    getAggregatedOddsForSport("NBA").catch(() => [] as AggregatedOdds[]),
  ]);

  const todayEvents = aggregatedEvents.filter(
    (event) => getEventDate(event.commenceTime) === targetDate,
  );

  const freshRecords: SystemTrackingRecord[] = [];

  const audit = {
    gamesScanned: todayEvents.length,
    noSplits: 0,
    splitsInsufficient: 0,
    noLineMoveHistory: 0,
    lineMovedTooSmall: 0,
    priceBandFail: 0,
    qualified: 0,
  };

  for (const event of todayEvents) {
    // ── 1. Splits lookup ──────────────────────────────────────────────────
    const gameSnapshot = splitsBoard
      ? findGameSplits(splitsBoard, event.homeAbbrev, event.awayAbbrev)
      : null;

    if (!gameSnapshot) {
      audit.noSplits += 1;
      continue;
    }

    const { side1: spreadHome, side2: spreadAway } = getMarketSplits(gameSnapshot, "spread");
    if (!spreadHome || !spreadAway) {
      audit.splitsInsufficient += 1;
      continue;
    }

    // Find which side has >= 60% bets (the inflated/public side)
    const homeBeats = (spreadHome.betsPercent ?? 0) >= 60;
    const awayBeats = (spreadAway.betsPercent ?? 0) >= 60;

    if (!homeBeats && !awayBeats) {
      audit.splitsInsufficient += 1;
      continue;
    }

    // The side to FADE is the one with the majority public bets
    const publicSide: "home" | "away" = homeBeats ? "home" : "away";
    const fadeSide: "home" | "away" = publicSide === "home" ? "away" : "home";
    const publicBetsPct = publicSide === "home" ? (spreadHome.betsPercent ?? 0) : (spreadAway.betsPercent ?? 0);
    const publicHandlePct = publicSide === "home" ? (spreadHome.handlePercent ?? null) : (spreadAway.handlePercent ?? null);
    const publicSpreadLine = publicSide === "home" ? spreadHome.line : spreadAway.line;

    // ── 2. Line-move history (Supabase-backed) ────────────────────────────
    const history = await getMarketHistoryRail(event).catch(() => null);

    if (!history || history.capturedSnapshots < 2) {
      audit.noLineMoveHistory += 1;
      continue;
    }

    // Find the spread deltas for any team in this game
    const spreadDeltas = history.deltas.filter((d) => d.marketType === "spread");

    if (spreadDeltas.length === 0) {
      audit.noLineMoveHistory += 1;
      continue;
    }

    // Use the largest absolute spread line delta seen today
    const maxLineDelta = spreadDeltas.reduce<number | null>((max, d) => {
      if (d.lineDelta === null) return max;
      const abs = Math.abs(d.lineDelta);
      return max === null || abs > max ? abs : max;
    }, null);

    if (maxLineDelta === null || maxLineDelta < 0.5) {
      audit.lineMovedTooSmall += 1;
      continue;
    }

    const representativeDelta = spreadDeltas.find((d) => d.lineDelta !== null && Math.abs(d.lineDelta) === maxLineDelta);
    const lineDelta = representativeDelta?.lineDelta ?? null;

    // ── 3. Price discipline on the FADED side ────────────────────────────
    const fadeSpread = fadeSide === "home" ? event.bestHomeSpread : event.bestAwaySpread;
    if (!fadeSpread) {
      audit.priceBandFail += 1;
      continue;
    }
    // Spread odds must be between -135 and +135 (vig band only — no major dog/chalk)
    if (fadeSpread.odds < -135 || fadeSpread.odds > 135) {
      audit.priceBandFail += 1;
      continue;
    }

    // ── Qualified ─────────────────────────────────────────────────────────
    audit.qualified += 1;

    const fadeTeam = fadeSide === "home" ? event.homeAbbrev : event.awayAbbrev;
    const publicTeamAbbrev = publicSide === "home" ? event.homeAbbrev : event.awayAbbrev;

    const notes = [
      `Fuch's Fade qualifier — fading ${publicTeamAbbrev} (${publicBetsPct}% public bets on spread).`,
      `Back: ${fadeTeam} ${fadeSpread.line != null ? (fadeSpread.line > 0 ? "+" : "") + fadeSpread.line : ""} (${fadeSpread.odds > 0 ? "+" : ""}${fadeSpread.odds}, ${fadeSpread.book}).`,
      `Public spread: ${publicTeamAbbrev} ${publicSpreadLine != null ? (publicSpreadLine > 0 ? "+" : "") + publicSpreadLine : ""}. Bets: ${publicBetsPct}%${publicHandlePct != null ? `. Handle: ${publicHandlePct}%` : ""}.`,
      `Line moved ${lineDelta != null ? (lineDelta > 0 ? "+" : "") + lineDelta.toFixed(1) : "?"} pts since opening (${history.capturedSnapshots} snapshot(s), source: ${history.source}).`,
      `Snapshot window: ${history.openingCapturedAt.slice(0, 16)} → ${history.latestCapturedAt.slice(0, 16)}.`,
      `Alert only — not a pick. No historical win rate claimed. Verify context before acting.`,
    ].join(" • ");

    freshRecords.push(
      normalizeRecord({
        id: `${FAT_TONYS_FADE_SYSTEM_ID}:${targetDate}:${fadeTeam}`,
        gameId: event.gameId,
        oddsEventId: event.oddsApiEventId ?? null,
        gameDate: targetDate,
        matchup: `${event.awayAbbrev} @ ${event.homeAbbrev}`,
        roadTeam: event.awayAbbrev,
        homeTeam: event.homeAbbrev,
        qualifiedTeam: fadeTeam,
        opponentTeam: publicTeamAbbrev,
        recordKind: "qualifier",
        marketType: "spread",
        alertLabel: `Fade ${publicTeamAbbrev} (${publicBetsPct}% public) — line moved ${lineDelta != null ? (lineDelta > 0 ? "+" : "") + lineDelta.toFixed(1) : "?"}pt`,
        sourceHealthStatus: "healthy",
        freshnessSummary: `Splits + line-move history live. Snapshots: ${history.capturedSnapshots} (${history.source}). Splits source: ${gameSnapshot.effectiveSource}.`,
        notes,
      }),
    );
  }

  const auditNote = `Scanned ${audit.gamesScanned} games. No splits: ${audit.noSplits}. Splits insufficient: ${audit.splitsInsufficient}. No line history: ${audit.noLineMoveHistory}. Line too small: ${audit.lineMovedTooSmall}. Price band fail: ${audit.priceBandFail}. Qualified: ${audit.qualified}.`;

  const updated: TrackedSystem = {
    ...system,
    status: "tracking" as SystemTrackingStatus,
    trackabilityBucket: "trackable_now" as SystemTrackabilityBucket,
    snapshot: audit.qualified > 0
      ? `🟢 ${audit.qualified} Fuch's Fade qualifier(s) today | ${auditNote}`
      : `🟡 No Fuch's Fade qualifiers today | ${auditNote}`,
    dataRequirements: (system.dataRequirements ?? []).map((req) => ({
      ...req,
      status: "ready" as DataRequirementStatus,
    })),
    records: freshRecords,
  };

  return updated;
}
