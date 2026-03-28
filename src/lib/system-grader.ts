/**
 * system-grader.ts
 *
 * Grades pending system qualifier rows from live game results.
 *
 * Gradeable systems:
 *   - Swaggy Stretch Drive (NHL moneyline): qualifiedTeam wins → win, loses → loss
 *   - Falcons Fight Pummeled Pitchers (MLB moneyline): qualified team ML → grade from final
 *   - Mattys 1Q Chase NBA (Goose): graded via ESPN quarter scores (existing path)
 *   - Robbie's Ripper Fast 5 (MLB F5 side/total): graded from MLB Stats API inning linescore
 *
 * Not gradeable (watchlist-only, no bet direction):
 *   - The Blowout, Hot Teams Matchup, Tony's Hot Bats
 */

import { getRecentMLBGames, getMLBF5Linescore } from "@/lib/mlb-api";
import { getTeamRecentGames } from "@/lib/nhl-api";
import { batchGradeSystemQualifiers, loadPendingQualifiers, type DbSystemQualifier, type GradeQualifierInput } from "@/lib/system-qualifiers-db";
import type { SystemQualifierOutcome, SystemQualifierSettlementStatus } from "@/lib/systems-tracking-store";

// ─── System IDs that have ML grading ────────────────────────────────────────

export const GRADEABLE_ML_SYSTEMS = [
  "swaggy-stretch-drive",
  "falcons-fight-pummeled-pitchers",
] as const;

export const GRADEABLE_PROGRESSION_SYSTEMS = [
  "nba-goose-system",
] as const;

export const WATCHLIST_ONLY_SYSTEMS = [
  "the-blowout",
  "hot-teams-matchup",
  "tonys-hot-bats",
] as const;

// ─── NHL game result lookup ──────────────────────────────────────────────────

type NHLGameResult = {
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number;
  awayScore: number;
  finalState: "OFF" | "FINAL" | "CRIT";
};

async function fetchNHLRecentResults(teamAbbrevs: string[]): Promise<Map<string, NHLGameResult[]>> {
  const results = new Map<string, NHLGameResult[]>();
  if (!teamAbbrevs.length) return results;

  // Unique teams only
  const unique = Array.from(new Set(teamAbbrevs));

  // Fetch recent games for each team (club-schedule includes home/away + scores)
  await Promise.all(unique.map(async (abbrev) => {
    try {
      const games = await getTeamRecentGames(abbrev);
      const mapped: NHLGameResult[] = games.map((g) => ({
        homeAbbrev: g.isHome ? abbrev : g.opponentAbbrev,
        awayAbbrev: g.isHome ? g.opponentAbbrev : abbrev,
        homeScore: g.isHome ? g.goalsFor : g.goalsAgainst,
        awayScore: g.isHome ? g.goalsAgainst : g.goalsFor,
        finalState: "OFF",
      }));
      results.set(abbrev, mapped);
    } catch {
      results.set(abbrev, []);
    }
  }));

  return results;
}

// ─── MLB game result lookup ──────────────────────────────────────────────────

type MLBGameResult = {
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number;
  awayScore: number;
  gameDate: string;
  status: string;
};

let _mlbResultsCache: { data: MLBGameResult[]; fetchedAt: number } | null = null;
const MLB_RESULTS_TTL_MS = 30 * 60 * 1000; // 30 min

async function fetchMLBRecentResults(): Promise<MLBGameResult[]> {
  const now = Date.now();
  if (_mlbResultsCache && now - _mlbResultsCache.fetchedAt < MLB_RESULTS_TTL_MS) {
    return _mlbResultsCache.data;
  }

  const games = await getRecentMLBGames(14);
  const results: MLBGameResult[] = games
    .filter((g) => g.status === "Final" && g.homeScore != null && g.awayScore != null)
    .map((g) => ({
      homeAbbrev: g.homeTeam.abbreviation,
      awayAbbrev: g.awayTeam.abbreviation,
      homeScore: g.homeScore!,
      awayScore: g.awayScore!,
      gameDate: g.date,
      status: g.status,
    }));

  _mlbResultsCache = { data: results, fetchedAt: now };
  return results;
}

// ─── Grading helpers ─────────────────────────────────────────────────────────

function gradeMLOutcome(
  qualifiedTeam: string,
  homeAbbrev: string,
  awayAbbrev: string,
  homeScore: number,
  awayScore: number,
): SystemQualifierOutcome {
  const isHome = qualifiedTeam.toUpperCase() === homeAbbrev.toUpperCase();
  const isAway = qualifiedTeam.toUpperCase() === awayAbbrev.toUpperCase();

  if (!isHome && !isAway) return "ungradeable";
  if (homeScore === awayScore) return "push";

  const qualifiedWon = isHome ? homeScore > awayScore : awayScore > homeScore;
  return qualifiedWon ? "win" : "loss";
}

function mlNetUnits(outcome: SystemQualifierOutcome, odds: number | null): number | null {
  if (outcome === "push") return 0;
  if (outcome === "win") {
    if (odds == null) return 1; // default flat unit
    // Convert American odds to profit on 1u stake
    return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  }
  if (outcome === "loss") return -1;
  return null;
}

// ─── NHL Swaggy grading ──────────────────────────────────────────────────────

async function gradeSwaggyQualifiers(
  pending: DbSystemQualifier[],
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  // Get unique qualified teams
  const teams = pending.map((q) => q.qualified_team).filter(Boolean) as string[];
  const resultsByTeam = await fetchNHLRecentResults(teams);

  const graded: GradeQualifierInput[] = [];

  for (const qualifier of pending) {
    const qualifiedTeam = qualifier.qualified_team;
    if (!qualifiedTeam) continue;

    const roadTeam = qualifier.road_team;
    const homeTeam = qualifier.home_team;
    const gameDate = qualifier.game_date;

    // Find the matching game result for this team on this date
    const teamResults = resultsByTeam.get(qualifiedTeam) ?? [];
    const matchResult = teamResults.find((r) => {
      const sameTeams = (
        r.homeAbbrev.toUpperCase() === homeTeam.toUpperCase() &&
        r.awayAbbrev.toUpperCase() === roadTeam.toUpperCase()
      );
      return sameTeams;
    });

    if (!matchResult) continue; // Game not yet final

    const outcome = gradeMLOutcome(
      qualifiedTeam,
      matchResult.homeAbbrev,
      matchResult.awayAbbrev,
      matchResult.homeScore,
      matchResult.awayScore,
    );

    const netUnits = mlNetUnits(outcome, qualifier.qualifier_odds);

    graded.push({
      id: qualifier.id,
      outcome,
      settlementStatus: outcome === "ungradeable" ? "ungradeable" : "settled",
      netUnits,
      gradingSource: "nhl-api-final",
      gradingNotes: `${matchResult.homeAbbrev} ${matchResult.homeScore} - ${matchResult.awayAbbrev} ${matchResult.awayScore}. ${qualifiedTeam} ML ${qualifier.qualifier_odds != null ? (qualifier.qualifier_odds > 0 ? `+${qualifier.qualifier_odds}` : `${qualifier.qualifier_odds}`) : "unknown"}.`,
    });
  }

  return graded;
}

// ─── MLB Falcons Fight grading ────────────────────────────────────────────────

async function gradeFalconsQualifiers(
  pending: DbSystemQualifier[],
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  const mlbResults = await fetchMLBRecentResults();
  const graded: GradeQualifierInput[] = [];

  for (const qualifier of pending) {
    const qualifiedTeam = qualifier.qualified_team;
    if (!qualifiedTeam) continue;

    const roadTeam = qualifier.road_team;
    const homeTeam = qualifier.home_team;
    const gameDate = qualifier.game_date;

    // Match by teams + date
    const matchResult = mlbResults.find((r) => {
      const sameTeams = (
        r.homeAbbrev.toUpperCase() === homeTeam.toUpperCase() &&
        r.awayAbbrev.toUpperCase() === roadTeam.toUpperCase()
      );
      const sameDate = r.gameDate === gameDate;
      return sameTeams && sameDate;
    });

    if (!matchResult) continue; // Game not yet final

    const outcome = gradeMLOutcome(
      qualifiedTeam,
      matchResult.homeAbbrev,
      matchResult.awayAbbrev,
      matchResult.homeScore,
      matchResult.awayScore,
    );

    const netUnits = mlNetUnits(outcome, qualifier.qualifier_odds);

    graded.push({
      id: qualifier.id,
      outcome,
      settlementStatus: outcome === "ungradeable" ? "ungradeable" : "settled",
      netUnits,
      gradingSource: "mlb-api-final",
      gradingNotes: `${matchResult.homeAbbrev} ${matchResult.homeScore} - ${matchResult.awayAbbrev} ${matchResult.awayScore}. ${qualifiedTeam} ML ${qualifier.qualifier_odds != null ? (qualifier.qualifier_odds > 0 ? `+${qualifier.qualifier_odds}` : `${qualifier.qualifier_odds}`) : "unknown"}.`,
    });
  }

  return graded;
}

/**
 * Grade Robbie's Ripper Fast 5 qualifiers using per-inning MLB linescore data.
 *
 * Qualifier rows carry:
 *   - qualifiedTeam: the team with the better starter (expected to win F5)
 *   - marketType: "f5-moneyline" or "f5-total"
 *   - totalLine: the F5 total line when applicable
 *   - gameId: the MLB gamePk needed to fetch the linescore
 *
 * Grading logic:
 *   F5 side: qualifiedTeam leads after 5 innings = win; trails = loss; tied = push.
 *            For home team: game must have 5 complete away at-bats (standard F5 settlement).
 *   F5 total: combined runs through 5 innings vs the posted total line.
 *   Ungradeable: if linescore unavailable or < 5 innings complete.
 */
async function gradeRobbiesRipperFast5Qualifiers(
  pending: DbSystemQualifier[],
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  const graded: GradeQualifierInput[] = [];

  for (const qualifier of pending) {
    // gamePk is stored in qualifier_id as "robbies-ripper-fast-5:{gameId}" or extracted from provenance
    const provenance = qualifier.provenance as Record<string, unknown> | null;
    const gamePk = (provenance?.gameId as string | undefined)
      || qualifier.qualifier_id.split(":").pop()
      || "";
    if (!gamePk) continue;

    const qualifiedTeam = qualifier.qualified_team;
    const marketType = qualifier.market_type;
    const totalLineRaw = provenance?.totalLine;
    const totalLine = typeof totalLineRaw === "number" ? totalLineRaw : null;

    let linescore;
    try {
      linescore = await getMLBF5Linescore(gamePk);
    } catch {
      continue;
    }

    if (!linescore.isF5Complete) {
      // Not enough innings — stay pending, do not mark ungradeable yet
      continue;
    }

    const { awayRunsF5, homeRunsF5, totalRunsF5 } = linescore;
    if (awayRunsF5 == null || homeRunsF5 == null) {
      // Data present but null — ungradeable
      graded.push({
        id: qualifier.id,
        outcome: "ungradeable",
        settlementStatus: "ungradeable",
        netUnits: null,
        gradingSource: "mlb-api-linescore",
        gradingNotes: "F5 linescore returned incomplete inning data after game completion.",
      });
      continue;
    }

    const roadTeam = qualifier.road_team;
    const homeTeam = qualifier.home_team;
    const isQualifiedHome = qualifiedTeam?.toUpperCase() === homeTeam?.toUpperCase();
    const isQualifiedAway = qualifiedTeam?.toUpperCase() === roadTeam?.toUpperCase();

    // F5 Total grading (when marketType is f5-total and totalLine is known)
    if (marketType === "f5-total" && totalLine != null && totalRunsF5 != null) {
      let outcome: SystemQualifierOutcome;
      if (totalRunsF5 > totalLine) outcome = "win";   // assuming we back the over when a high-scoring environment qualifies
      else if (totalRunsF5 < totalLine) outcome = "loss";
      else outcome = "push";
      graded.push({
        id: qualifier.id,
        outcome,
        settlementStatus: "settled",
        netUnits: outcome === "win" ? 1 : outcome === "loss" ? -1 : 0,
        gradingSource: "mlb-api-linescore",
        gradingNotes: `F5 combined runs: ${totalRunsF5} vs line ${totalLine}. Away ${awayRunsF5} + Home ${homeRunsF5}.`,
      });
      continue;
    }

    // F5 Side grading
    if (qualifiedTeam && (isQualifiedHome || isQualifiedAway)) {
      const qualifiedRuns = isQualifiedAway ? awayRunsF5 : homeRunsF5;
      const opponentRuns = isQualifiedAway ? homeRunsF5 : awayRunsF5;
      let outcome: SystemQualifierOutcome;
      if (qualifiedRuns > opponentRuns) outcome = "win";
      else if (qualifiedRuns < opponentRuns) outcome = "loss";
      else outcome = "push";
      const netUnits = mlNetUnits(outcome, qualifier.qualifier_odds);
      graded.push({
        id: qualifier.id,
        outcome,
        settlementStatus: "settled",
        netUnits,
        gradingSource: "mlb-api-linescore",
        gradingNotes: `F5: ${roadTeam} ${awayRunsF5} - ${homeTeam} ${homeRunsF5} after 5 innings. ${qualifiedTeam} ${qualifiedRuns} runs.`,
      });
      continue;
    }

    // Context-board rows (no qualifiedTeam) — not applicable
    graded.push({
      id: qualifier.id,
      outcome: "ungradeable",
      settlementStatus: "ungradeable",
      netUnits: null,
      gradingSource: "mlb-api-linescore",
      gradingNotes: "Context-board row — no qualified side defined. Cannot grade without bet direction.",
    });
  }

  return graded;
}

// ─── Public grading entry point ───────────────────────────────────────────────

export type SystemGradingReport = {
  systemId: string;
  pendingChecked: number;
  graded: number;
  outcomes: { outcome: SystemQualifierOutcome; count: number }[];
  errors: string[];
};

export type GradeAllSystemsResult = {
  ok: boolean;
  totalPendingChecked: number;
  totalGraded: number;
  reports: SystemGradingReport[];
  gradedAt: string;
};

/**
 * Grade pending qualifiers for all ML-gradeable systems.
 * Writes results back to Supabase. Safe to call repeatedly (idempotent).
 */
export async function gradeAllSystemQualifiers(): Promise<GradeAllSystemsResult> {
  const reports: SystemGradingReport[] = [];
  let totalPending = 0;
  let totalGraded = 0;

  // Load pending for gradeable systems
  const allPending = await loadPendingQualifiers();
  const pendingBySystem = new Map<string, DbSystemQualifier[]>();

  for (const q of allPending) {
    if (!GRADEABLE_ML_SYSTEMS.includes(q.system_id as any)) continue;
    if (!pendingBySystem.has(q.system_id)) {
      pendingBySystem.set(q.system_id, []);
    }
    pendingBySystem.get(q.system_id)!.push(q);
  }

  // Grade Swaggy
  const swaggyPending = pendingBySystem.get("swaggy-stretch-drive") ?? [];
  totalPending += swaggyPending.length;
  if (swaggyPending.length > 0) {
    const errors: string[] = [];
    let gradedInputs: GradeQualifierInput[] = [];
    try {
      gradedInputs = await gradeSwaggyQualifiers(swaggyPending);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const gradedCount = gradedInputs.length > 0 ? await batchGradeSystemQualifiers(gradedInputs) : 0;
    totalGraded += gradedCount;

    const outcomeCounts = gradedInputs.reduce((acc, g) => {
      acc.set(g.outcome, (acc.get(g.outcome) ?? 0) + 1);
      return acc;
    }, new Map<SystemQualifierOutcome, number>());

    reports.push({
      systemId: "swaggy-stretch-drive",
      pendingChecked: swaggyPending.length,
      graded: gradedCount,
      outcomes: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({ outcome, count })),
      errors,
    });
  }

  // Grade Falcons Fight
  const falconsPending = pendingBySystem.get("falcons-fight-pummeled-pitchers") ?? [];
  totalPending += falconsPending.length;
  if (falconsPending.length > 0) {
    const errors: string[] = [];
    let gradedInputs: GradeQualifierInput[] = [];
    try {
      gradedInputs = await gradeFalconsQualifiers(falconsPending);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const gradedCount = gradedInputs.length > 0 ? await batchGradeSystemQualifiers(gradedInputs) : 0;
    totalGraded += gradedCount;

    const outcomeCounts = gradedInputs.reduce((acc, g) => {
      acc.set(g.outcome, (acc.get(g.outcome) ?? 0) + 1);
      return acc;
    }, new Map<SystemQualifierOutcome, number>());

    reports.push({
      systemId: "falcons-fight-pummeled-pitchers",
      pendingChecked: falconsPending.length,
      graded: gradedCount,
      outcomes: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({ outcome, count })),
      errors,
    });
  }

  // Grade Robbie's Ripper Fast 5 (F5 inning linescore)
  const ripperPending = pendingBySystem.get("robbies-ripper-fast-5") ?? [];
  totalPending += ripperPending.length;
  if (ripperPending.length > 0) {
    const errors: string[] = [];
    let gradedInputs: GradeQualifierInput[] = [];
    try {
      gradedInputs = await gradeRobbiesRipperFast5Qualifiers(ripperPending);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const gradedCount = gradedInputs.length > 0 ? await batchGradeSystemQualifiers(gradedInputs) : 0;
    totalGraded += gradedCount;

    const outcomeCounts = gradedInputs.reduce((acc, g) => {
      acc.set(g.outcome, (acc.get(g.outcome) ?? 0) + 1);
      return acc;
    }, new Map<SystemQualifierOutcome, number>());

    reports.push({
      systemId: "robbies-ripper-fast-5",
      pendingChecked: ripperPending.length,
      graded: gradedCount,
      outcomes: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({ outcome, count })),
      errors,
    });
  }

  return {
    ok: true,
    totalPendingChecked: totalPending,
    totalGraded: totalGraded,
    reports,
    gradedAt: new Date().toISOString(),
  };
}

/**
 * Grade pending qualifiers for a single system.
 */
export async function gradeSystemById(systemId: string): Promise<GradeAllSystemsResult> {
  const allPending = await loadPendingQualifiers(systemId);

  let gradedInputs: GradeQualifierInput[] = [];
  const errors: string[] = [];

  try {
    if (systemId === "swaggy-stretch-drive") {
      gradedInputs = await gradeSwaggyQualifiers(allPending);
    } else if (systemId === "falcons-fight-pummeled-pitchers") {
      gradedInputs = await gradeFalconsQualifiers(allPending);
    } else if (systemId === "robbies-ripper-fast-5") {
      gradedInputs = await gradeRobbiesRipperFast5Qualifiers(allPending);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const gradedCount = gradedInputs.length > 0 ? await batchGradeSystemQualifiers(gradedInputs) : 0;

  const outcomeCounts = gradedInputs.reduce((acc, g) => {
    acc.set(g.outcome, (acc.get(g.outcome) ?? 0) + 1);
    return acc;
  }, new Map<SystemQualifierOutcome, number>());

  return {
    ok: true,
    totalPendingChecked: allPending.length,
    totalGraded: gradedCount,
    reports: [{
      systemId,
      pendingChecked: allPending.length,
      graded: gradedCount,
      outcomes: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({ outcome, count })),
      errors,
    }],
    gradedAt: new Date().toISOString(),
  };
}

/**
 * Returns which systems are gradeable and what kind of grading they support.
 */
export function getGradeabilityMap(): Record<string, {
  gradeable: boolean;
  gradingType: "moneyline" | "quarter_ats" | "watchlist_only";
  notes: string;
}> {
  return {
    "nba-goose-system": {
      gradeable: true,
      gradingType: "quarter_ats",
      notes: "NBA 1Q/3Q ATS: graded via ESPN quarter scores when 1Q and 3Q lines are captured.",
    },
    "swaggy-stretch-drive": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NHL moneyline: qualified team ML (-145 to +115). Graded from NHL API final scores.",
    },
    "falcons-fight-pummeled-pitchers": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "MLB moneyline: qualified team ML (-140 to +125). Graded from MLB Stats API final scores.",
    },
    "the-blowout": {
      gradeable: false,
      gradingType: "watchlist_only",
      notes: "Bet direction unresolved. Qualifier watchlist only — not gradeable until direction is defined.",
    },
    "hot-teams-matchup": {
      gradeable: false,
      gradingType: "watchlist_only",
      notes: "Bet direction unresolved. Matchup discovery only — not gradeable until direction is defined.",
    },
    "tonys-hot-bats": {
      gradeable: false,
      gradingType: "watchlist_only",
      notes: "Early trigger watchlist. No explicit bet direction — not gradeable until picks model is defined.",
    },
    "robbies-ripper-fast-5": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "MLB F5 side/total: grades from MLB Stats API per-inning linescore. Rows stay pending until 5 complete innings confirmed. Alert rows with a qualified team are graded as F5 side; f5-total rows grade against the posted line.",
    },
  };
}
