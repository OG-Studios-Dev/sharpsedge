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
 * Not gradeable yet (system is off until bet direction is defined honestly):
 *   - The Blowout, Hot Teams Matchup, Tony's Tight Bats
 */

import { getRecentMLBGames, getMLBF5Linescore } from "@/lib/mlb-api";
import { getTeamRecentGames } from "@/lib/nhl-api";
import { batchGradeSystemQualifiers, loadPendingQualifiers, type DbSystemQualifier, type GradeQualifierInput } from "@/lib/system-qualifiers-db";
import type { SystemQualifierOutcome, SystemQualifierSettlementStatus } from "@/lib/systems-tracking-store";

// ─── System IDs that have ML grading ────────────────────────────────────────

export const GRADEABLE_ML_SYSTEMS = [
  "swaggy-stretch-drive",
  "falcons-fight-pummeled-pitchers",
  "coach-no-rest",
  "bigcat-bonaza-puckluck",
  "nba-home-dog-majority-handle",
  "nba-home-super-majority-close-game",
  "nhl-home-dog-majority-handle",
  "mlb-home-majority-handle",
] as const;

export const GRADEABLE_TOTAL_SYSTEMS = [
  "nhl-under-majority-handle",
  "mlb-under-majority-handle",
] as const;

export const GRADEABLE_PROGRESSION_SYSTEMS = [
  "nba-goose-system",
] as const;

export const OFFLINE_SYSTEMS = [
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

type TotalsGameResult = {
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number;
  awayScore: number;
  gameDate?: string;
};

function gradeTotalOutcome(
  totalLine: number | null,
  homeScore: number,
  awayScore: number,
  direction: "under" | "over" = "under",
): SystemQualifierOutcome {
  if (totalLine == null) return "ungradeable";
  const total = homeScore + awayScore;
  if (total === totalLine) return "push";
  if (direction === "under") return total < totalLine ? "win" : "loss";
  return total > totalLine ? "win" : "loss";
}

async function gradePendingMlQualifiers(
  pending: DbSystemQualifier[],
  source: "nhl" | "mlb",
  gradingSource: string,
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  if (source === "nhl") {
    const teams = pending.map((q) => q.qualified_team).filter(Boolean) as string[];
    const resultsByTeam = await fetchNHLRecentResults(teams);
    return pending.flatMap((qualifier) => {
      const qualifiedTeam = qualifier.qualified_team;
      if (!qualifiedTeam) return [];
      const matchResult = (resultsByTeam.get(qualifiedTeam) ?? []).find((r) => (
        r.homeAbbrev.toUpperCase() === qualifier.home_team.toUpperCase() &&
        r.awayAbbrev.toUpperCase() === qualifier.road_team.toUpperCase()
      ));
      if (!matchResult) return [];
      const outcome = gradeMLOutcome(qualifiedTeam, matchResult.homeAbbrev, matchResult.awayAbbrev, matchResult.homeScore, matchResult.awayScore);
      return [{
        id: qualifier.id,
        outcome,
        settlementStatus: outcome === "ungradeable" ? "ungradeable" : "settled",
        netUnits: mlNetUnits(outcome, qualifier.qualifier_odds),
        gradingSource,
        gradingNotes: `${matchResult.homeAbbrev} ${matchResult.homeScore} - ${matchResult.awayAbbrev} ${matchResult.awayScore}. ${qualifiedTeam} ML ${qualifier.qualifier_odds != null ? (qualifier.qualifier_odds > 0 ? `+${qualifier.qualifier_odds}` : `${qualifier.qualifier_odds}`) : "unknown"}.`,
      }];
    });
  }

  const mlbResults = await fetchMLBRecentResults();
  return pending.flatMap((qualifier) => {
    const qualifiedTeam = qualifier.qualified_team;
    if (!qualifiedTeam) return [];
    const matchResult = mlbResults.find((r) => (
      r.homeAbbrev.toUpperCase() === qualifier.home_team.toUpperCase() &&
      r.awayAbbrev.toUpperCase() === qualifier.road_team.toUpperCase() &&
      r.gameDate === qualifier.game_date
    ));
    if (!matchResult) return [];
    const outcome = gradeMLOutcome(qualifiedTeam, matchResult.homeAbbrev, matchResult.awayAbbrev, matchResult.homeScore, matchResult.awayScore);
    return [{
      id: qualifier.id,
      outcome,
      settlementStatus: outcome === "ungradeable" ? "ungradeable" : "settled",
      netUnits: mlNetUnits(outcome, qualifier.qualifier_odds),
      gradingSource,
      gradingNotes: `${matchResult.homeAbbrev} ${matchResult.homeScore} - ${matchResult.awayAbbrev} ${matchResult.awayScore}. ${qualifiedTeam} ML ${qualifier.qualifier_odds != null ? (qualifier.qualifier_odds > 0 ? `+${qualifier.qualifier_odds}` : `${qualifier.qualifier_odds}`) : "unknown"}.`,
    }];
  });
}

async function gradePendingTotalQualifiers(
  pending: DbSystemQualifier[],
  source: "nhl" | "mlb",
  gradingSource: string,
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  let results: TotalsGameResult[] = [];
  if (source === "nhl") {
    const teams = pending.flatMap((q) => [q.home_team, q.road_team]).filter(Boolean) as string[];
    const resultsByTeam = await fetchNHLRecentResults(teams);
    const seen = new Map<string, TotalsGameResult>();
    Array.from(resultsByTeam.values()).forEach((list) => {
      list.forEach((r) => {
        seen.set(`${r.awayAbbrev}@${r.homeAbbrev}`, r);
      });
    });
    results = Array.from(seen.values());
  } else {
    results = await fetchMLBRecentResults();
  }

  return pending.flatMap((qualifier) => {
    const provenance = qualifier.provenance as Record<string, unknown> | null;
    const totalLineRaw = provenance?.totalLine;
    const totalLine = typeof totalLineRaw === "number"
      ? totalLineRaw
      : typeof provenance?.recordSnapshot === "object" && provenance?.recordSnapshot && typeof (provenance.recordSnapshot as Record<string, unknown>).totalLine === "number"
      ? ((provenance.recordSnapshot as Record<string, unknown>).totalLine as number)
      : null;
    const match = results.find((r) => (
      r.homeAbbrev.toUpperCase() === qualifier.home_team.toUpperCase() &&
      r.awayAbbrev.toUpperCase() === qualifier.road_team.toUpperCase() &&
      (source === "nhl" || !r.gameDate || r.gameDate === qualifier.game_date)
    ));
    if (!match) return [];
    const outcome = gradeTotalOutcome(totalLine, match.homeScore, match.awayScore, "under");
    return [{
      id: qualifier.id,
      outcome,
      settlementStatus: outcome === "ungradeable" ? "ungradeable" : "settled",
      netUnits: outcome === "win" ? mlNetUnits("win", qualifier.qualifier_odds) : outcome === "loss" ? -1 : 0,
      gradingSource,
      gradingNotes: `Final total ${match.awayAbbrev} ${match.awayScore} + ${match.homeAbbrev} ${match.homeScore} = ${match.awayScore + match.homeScore} vs total ${totalLine ?? "unknown"}.`,
    }];
  });
}

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

  const gradeAndReport = async (
    systemId: string,
    grader: () => Promise<GradeQualifierInput[]>,
  ) => {
    const pending = pendingBySystem.get(systemId) ?? [];
    totalPending += pending.length;
    if (pending.length === 0) return;
    const errors: string[] = [];
    let gradedInputs: GradeQualifierInput[] = [];
    try {
      gradedInputs = await grader();
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
      systemId,
      pendingChecked: pending.length,
      graded: gradedCount,
      outcomes: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({ outcome, count })),
      errors,
    });
  };

  await gradeAndReport("swaggy-stretch-drive", async () => gradeSwaggyQualifiers(pendingBySystem.get("swaggy-stretch-drive") ?? []));
  await gradeAndReport("falcons-fight-pummeled-pitchers", async () => gradeFalconsQualifiers(pendingBySystem.get("falcons-fight-pummeled-pitchers") ?? []));
  await gradeAndReport("coach-no-rest", async () => gradePendingMlQualifiers(pendingBySystem.get("coach-no-rest") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("bigcat-bonaza-puckluck", async () => gradePendingMlQualifiers(pendingBySystem.get("bigcat-bonaza-puckluck") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("nba-home-dog-majority-handle", async () => []);
  await gradeAndReport("nba-home-super-majority-close-game", async () => []);
  await gradeAndReport("nhl-home-dog-majority-handle", async () => gradePendingMlQualifiers(pendingBySystem.get("nhl-home-dog-majority-handle") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("mlb-home-majority-handle", async () => gradePendingMlQualifiers(pendingBySystem.get("mlb-home-majority-handle") ?? [], "mlb", "mlb-api-final"));
  await gradeAndReport("nhl-under-majority-handle", async () => gradePendingTotalQualifiers(pendingBySystem.get("nhl-under-majority-handle") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("mlb-under-majority-handle", async () => gradePendingTotalQualifiers(pendingBySystem.get("mlb-under-majority-handle") ?? [], "mlb", "mlb-api-final"));

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
    "coach-no-rest": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NHL moneyline: backs the rested side vs the B2B team. Graded from NHL API final scores.",
    },
    "bigcat-bonaza-puckluck": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NHL moneyline: backs the underfinishing regression candidate. Graded from NHL API final scores.",
    },
    "nba-home-dog-majority-handle": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NBA moneyline: backs the qualified home dog with majority handle. Graded from ESPN/NBA final scores.",
    },
    "nba-home-super-majority-close-game": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NBA moneyline: backs the qualified home team in close-game super-majority handle spots. Graded from ESPN/NBA final scores.",
    },
    "nhl-home-dog-majority-handle": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NHL moneyline: backs the qualified home dog with majority handle. Graded from NHL API final scores.",
    },
    "mlb-home-majority-handle": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "MLB moneyline: backs the qualified home team with majority handle. Graded from MLB Stats API final scores.",
    },
    "nhl-under-majority-handle": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NHL totals under: grades against final combined score and stored total line.",
    },
    "mlb-under-majority-handle": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "MLB totals under: grades against final combined score and stored total line.",
    },
    "the-blowout": {
      gradeable: false,
      gradingType: "watchlist_only",
      notes: "Off. Bet direction unresolved, so this system is not gradeable until a real rule is defined.",
    },
    "hot-teams-matchup": {
      gradeable: false,
      gradingType: "watchlist_only",
      notes: "Bet direction unresolved. Matchup discovery only — not gradeable until direction is defined.",
    },
    "tonys-hot-bats": {
      gradeable: false,
      gradingType: "watchlist_only",
      notes: "Off. No explicit bet direction yet — not gradeable until the picks rule is defined.",
    },
    "robbies-ripper-fast-5": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "MLB F5 side/total: grades from MLB Stats API per-inning linescore. Rows stay pending until 5 complete innings confirmed. Alert rows with a qualified team are graded as F5 side; f5-total rows grade against the posted line.",
    },
  };
}
