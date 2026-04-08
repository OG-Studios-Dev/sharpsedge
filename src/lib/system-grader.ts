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
import { getNBAGameSummary, getRecentNBAGames, getNBAQuarterScoresFromApiSports } from "@/lib/nba-api";
import { getSDVNBAQuarterScores } from "@/lib/sportsdataverse-nba";
import { getTeamRecentGames } from "@/lib/nhl-api";
import { batchGradeSystemQualifiers, loadPendingQualifiers, type DbSystemQualifier, type GradeQualifierInput } from "@/lib/system-qualifiers-db";
import type { SystemQualifierOutcome, SystemQualifierSettlementStatus } from "@/lib/systems-tracking-store";
import { getBDLTournaments, getBDLTournamentResults } from "@/lib/golf/bdl-pga";

// ─── System IDs that have ML grading ────────────────────────────────────────

export const GRADEABLE_ML_SYSTEMS = [
  "swaggy-stretch-drive",
  "falcons-fight-pummeled-pitchers",
  "coach-no-rest",
  "bigcat-bonaza-puckluck",
  "fat-tonys-fade",
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

export const GRADEABLE_PGA_SYSTEMS = [
  "pga-goose-picks",
] as const;

export const OFFLINE_SYSTEMS = [
  "the-blowout",
  "hot-teams-matchup",
  "tonys-hot-bats",
] as const;

// ─── PGA pick grading ─────────────────────────────────────────────────────────

/**
 * Grade PGA Top 5 / Top 10 / Top 20 / Tournament Winner qualifiers
 * using BDL tournament results (official final leaderboard).
 *
 * Qualifier provenance is expected to contain:
 *   { playerName: string, market: "Top 5" | "Top 10" | "Top 20" | "Tournament Winner", tournamentId?: number }
 */
async function gradePGAQualifiers(
  pending: DbSystemQualifier[],
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  // Gather unique tournament IDs from qualifiers
  const tournamentIdSet = new Set<number>();
  for (const q of pending) {
    const tid = (q.provenance as Record<string, unknown>)?.tournamentId;
    if (typeof tid === "number") tournamentIdSet.add(tid);
  }

  // If no explicit IDs, look up the most recently completed BDL tournament
  if (tournamentIdSet.size === 0) {
    const tournaments = await getBDLTournaments(new Date().getFullYear());
    const completed = tournaments
      .filter((t) => t.status === "COMPLETED")
      .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());
    if (completed[0]) tournamentIdSet.add(completed[0].id);
  }

  // Fetch results for each tournament
  const resultsByTournament = new Map<number, Awaited<ReturnType<typeof getBDLTournamentResults>>>();
  await Promise.all(
    Array.from(tournamentIdSet).map(async (tid) => {
      const results = await getBDLTournamentResults(tid).catch(() => []);
      if (results.length > 0) resultsByTournament.set(tid, results);
    }),
  );

  if (resultsByTournament.size === 0) return [];

  const graded: GradeQualifierInput[] = [];

  for (const q of pending) {
    const prov = q.provenance as Record<string, unknown>;
    const playerName = (prov?.playerName as string | undefined)?.toLowerCase().trim() ?? "";
    const market = (prov?.market as string | undefined) ?? "Top 20";
    const tid = typeof prov?.tournamentId === "number" ? prov.tournamentId : null;

    // Use explicit tournamentId if available; otherwise try all fetched results
    const candidateMaps = tid
      ? [resultsByTournament.get(tid)]
      : Array.from(resultsByTournament.values());

    let outcome: SystemQualifierOutcome | null = null;
    let notes = "";

    for (const results of candidateMaps) {
      if (!results?.length) continue;
      const row = results.find(
        (r) => r.player?.display_name?.toLowerCase().trim() === playerName,
      );
      if (!row) continue;

      const pos = row.position;
      let threshold = 20;
      if (market === "Tournament Winner") threshold = 1;
      else if (market === "Top 5") threshold = 5;
      else if (market === "Top 10") threshold = 10;

      const won = typeof pos === "number" && pos <= threshold;
      outcome = won ? "win" : "loss";
      notes = `BDL result: position ${pos} | market: ${market} | threshold: ${threshold}`;
      break;
    }

    if (outcome) {
      graded.push({
        id: q.id,
        outcome,
        settlementStatus: "settled" as SystemQualifierSettlementStatus,
        netUnits: null,
        gradingSource: "bdl-tournament-results",
        gradingNotes: notes,
      });
    }
  }

  return graded;
}

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

function resolveQuarterSpreadResult(
  roadScore: number | null,
  homeScore: number | null,
  roadSpread: number | null,
): "win" | "loss" | "push" | "pending" {
  if (roadScore == null || homeScore == null || roadSpread == null) return "pending";
  const margin = roadScore + roadSpread - homeScore;
  if (margin > 0) return "win";
  if (margin < 0) return "loss";
  return "push";
}

function deriveGooseSequence(
  bet1Result: "win" | "loss" | "push" | "pending" | null,
  bet2Result: "win" | "loss" | "push" | "pending" | null,
): { outcome: SystemQualifierOutcome; settlementStatus: SystemQualifierSettlementStatus; netUnits: number | null } {
  if (bet1Result === "win") return { outcome: "win", settlementStatus: "settled", netUnits: 1 };
  if (bet1Result === "push") return { outcome: "push", settlementStatus: "settled", netUnits: 0 };
  if (bet1Result == null || bet1Result === "pending") return { outcome: "pending", settlementStatus: "pending", netUnits: null };
  if (bet2Result === "win") return { outcome: "win", settlementStatus: "settled", netUnits: 1 };
  if (bet2Result === "push") return { outcome: "push", settlementStatus: "settled", netUnits: -1 };
  if (bet2Result === "loss") return { outcome: "loss", settlementStatus: "settled", netUnits: -3 };
  return { outcome: "pending", settlementStatus: "pending", netUnits: null };
}

function parseQuarterScore(value: unknown): number | null {
  const raw = (value as { displayValue?: unknown; value?: unknown } | null)?.displayValue
    ?? (value as { value?: unknown } | null)?.value
    ?? value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function gradeGooseQualifiers(
  pending: DbSystemQualifier[],
): Promise<GradeQualifierInput[]> {
  if (!pending.length) return [];

  const graded: GradeQualifierInput[] = [];

  for (const qualifier of pending) {
    const provenance = qualifier.provenance as Record<string, unknown> | null;
    const espnEventId = typeof provenance?.espnEventId === "string" && provenance.espnEventId
      ? provenance.espnEventId
      : typeof provenance?.oddsEventId === "string" && /^\d+$/.test(provenance.oddsEventId)
        ? provenance.oddsEventId
        : null;

    // Primary: ESPN game summary (requires espnEventId)
    // Fallback: API-Sports Basketball v2 (lookup by date + teams, no eventId needed)
    let firstQuarterRoadScore: number | null = null;
    let firstQuarterHomeScore: number | null = null;
    let thirdQuarterRoadScore: number | null = null;
    let thirdQuarterHomeScore: number | null = null;
    let gameCompleted = false;
    let gradingSourceLabel = "espn-quarter-scores";

    if (espnEventId) {
      let summary: any;
      try {
        summary = await getNBAGameSummary(espnEventId);
      } catch {
        summary = null;
      }
      const competition = summary?.header?.competitions?.[0];
      const competitors: any[] = competition?.competitors ?? [];
      const home = competitors.find((entry: any) => entry?.homeAway === "home");
      const away = competitors.find((entry: any) => entry?.homeAway === "away");
      const homeLinescores: any[] = Array.isArray(home?.linescores) ? home.linescores : [];
      const awayLinescores: any[] = Array.isArray(away?.linescores) ? away.linescores : [];
      firstQuarterRoadScore = parseQuarterScore(awayLinescores[0]);
      firstQuarterHomeScore = parseQuarterScore(homeLinescores[0]);
      thirdQuarterRoadScore = parseQuarterScore(awayLinescores[2]);
      thirdQuarterHomeScore = parseQuarterScore(homeLinescores[2]);
      const statusType = competition?.status?.type;
      gameCompleted = statusType?.completed === true
        || statusType?.state === "post"
        || String(statusType?.description || "").toLowerCase() === "final";
    } else {
      // No espnEventId — try API-Sports Basketball v2 as fallback
      const gameDate = qualifier.game_date; // YYYY-MM-DD
      const apiScores = await getNBAQuarterScoresFromApiSports(
        gameDate,
        qualifier.home_team,
        qualifier.road_team,
      );
      if (apiScores) {
        firstQuarterRoadScore = apiScores.q1Away;
        firstQuarterHomeScore = apiScores.q1Home;
        thirdQuarterRoadScore = apiScores.q3Away;
        thirdQuarterHomeScore = apiScores.q3Home;
        gameCompleted = true; // API-Sports only returns completed games
        gradingSourceLabel = "api-sports-quarter-scores";
      } else {
        // Tier 3 fallback: sportsdataverse (ESPN via npm adapter)
        const dateStr = (qualifier.game_date ?? "").replace(/-/g, ""); // YYYY-MM-DD → YYYYMMDD
        const sdvScores = dateStr.length === 8
          ? await getSDVNBAQuarterScores(qualifier.home_team, qualifier.road_team, dateStr)
          : null;
        if (sdvScores) {
          firstQuarterRoadScore = sdvScores.awayQ1;
          firstQuarterHomeScore = sdvScores.homeQ1;
          thirdQuarterRoadScore = sdvScores.awayQ3;
          thirdQuarterHomeScore = sdvScores.homeQ3;
          gameCompleted = true;
          gradingSourceLabel = "sportsdataverse-espn";
        } else {
          // No data available from any source — skip (stay pending)
          continue;
        }
      }
    }

    const firstQuarterSpreadRaw = provenance?.firstQuarterSpread;
    const thirdQuarterSpreadRaw = provenance?.thirdQuarterSpread;
    const firstQuarterSpread = typeof firstQuarterSpreadRaw === "number"
      ? firstQuarterSpreadRaw
      : typeof firstQuarterSpreadRaw === "string" && firstQuarterSpreadRaw.trim() !== ""
        ? Number(firstQuarterSpreadRaw)
        : null;
    const thirdQuarterSpread = typeof thirdQuarterSpreadRaw === "number"
      ? thirdQuarterSpreadRaw
      : typeof thirdQuarterSpreadRaw === "string" && thirdQuarterSpreadRaw.trim() !== ""
        ? Number(thirdQuarterSpreadRaw)
        : null;

    const bet1Result = resolveQuarterSpreadResult(firstQuarterRoadScore, firstQuarterHomeScore, Number.isFinite(firstQuarterSpread as number) ? firstQuarterSpread : null);
    const bet2Result = bet1Result === "loss"
      ? resolveQuarterSpreadResult(thirdQuarterRoadScore, thirdQuarterHomeScore, Number.isFinite(thirdQuarterSpread as number) ? thirdQuarterSpread : null)
      : null;

    const missingRequiredInput = firstQuarterSpread == null
      || firstQuarterRoadScore == null
      || firstQuarterHomeScore == null
      || (bet1Result === "loss" && (thirdQuarterSpread == null || thirdQuarterRoadScore == null || thirdQuarterHomeScore == null));

    if (gameCompleted && missingRequiredInput) {
      const missingBits = [
        firstQuarterSpread == null ? "1Q line" : null,
        firstQuarterRoadScore == null || firstQuarterHomeScore == null ? "1Q score" : null,
        bet1Result === "loss" && thirdQuarterSpread == null ? "3Q line" : null,
        bet1Result === "loss" && (thirdQuarterRoadScore == null || thirdQuarterHomeScore == null) ? "3Q score" : null,
      ].filter(Boolean).join(", ");

      graded.push({
        id: qualifier.id,
        outcome: "ungradeable",
        settlementStatus: "ungradeable",
        netUnits: null,
        gradingSource: gradingSourceLabel,
        gradingNotes: `Final but missing required Goose settlement input(s): ${missingBits}.`,
      });
      continue;
    }

    const derived = deriveGooseSequence(bet1Result, bet2Result);
    if (derived.outcome === "pending") continue;

    graded.push({
      id: qualifier.id,
      outcome: derived.outcome,
      settlementStatus: derived.settlementStatus,
      netUnits: derived.netUnits,
      gradingSource: gradingSourceLabel,
      gradingNotes: `Goose sequence: 1Q ${qualifier.road_team} ${firstQuarterRoadScore ?? "?"}-${firstQuarterHomeScore ?? "?"} ${qualifier.home_team} vs spread ${firstQuarterSpread ?? "missing"};${bet1Result === "loss" ? ` 3Q ${qualifier.road_team} ${thirdQuarterRoadScore ?? "?"}-${thirdQuarterHomeScore ?? "?"} ${qualifier.home_team} vs spread ${thirdQuarterSpread ?? "missing"}.` : " no chase leg needed."}`,
    });
  }

  return graded;
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
    // gamePk is stored in qualifier_id as "robbies-ripper-fast-5:{gameId}" (or with a
    // market suffix like "robbies-ripper-fast-5:{gameId}:ml" / ":total").
    // Primary source is provenance.gameId (always set from record.gameId).
    // Fallback extracts segment [1] — never .pop() — to avoid returning "ml"/"total".
    const provenance = qualifier.provenance as Record<string, unknown> | null;
    const idSegments = qualifier.qualifier_id.split(":");
    const gamePk = (provenance?.gameId as string | undefined)
      || (idSegments.length >= 2 ? idSegments[1] : "")
      || "";
    if (!gamePk) continue;

    const qualifiedTeam = qualifier.qualified_team;
    const marketType = qualifier.market_type;
    const totalLineRaw = provenance?.totalLine;
    const totalLine = typeof totalLineRaw === "number"
      ? totalLineRaw
      : typeof totalLineRaw === "string" && totalLineRaw.trim() !== ""
        ? Number(totalLineRaw)
        : null;

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
    if (marketType === "f5-total") {
      if (totalLine == null || !Number.isFinite(totalLine)) {
        graded.push({
          id: qualifier.id,
          outcome: "ungradeable",
          settlementStatus: "ungradeable",
          netUnits: null,
          gradingSource: "mlb-api-linescore",
          gradingNotes: "F5 total qualifier missing a valid posted total line in provenance.",
        });
        continue;
      }
      if (totalRunsF5 == null) {
        graded.push({
          id: qualifier.id,
          outcome: "ungradeable",
          settlementStatus: "ungradeable",
          netUnits: null,
          gradingSource: "mlb-api-linescore",
          gradingNotes: "F5 total qualifier had null combined runs after linescore fetch.",
        });
        continue;
      }

      let outcome: SystemQualifierOutcome;
      if (totalRunsF5 > totalLine) outcome = "win";   // system stores only true posted-total alert rows; no synthetic side
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

let _nbaResultsCache: { data: TotalsGameResult[]; fetchedAt: number } | null = null;
const NBA_RESULTS_TTL_MS = 30 * 60 * 1000;

async function fetchNBARecentResults(): Promise<TotalsGameResult[]> {
  const now = Date.now();
  if (_nbaResultsCache && now - _nbaResultsCache.fetchedAt < NBA_RESULTS_TTL_MS) {
    return _nbaResultsCache.data;
  }

  const games = await getRecentNBAGames(14);
  const results: TotalsGameResult[] = games
    .filter((g) => g.status === "Final" && g.homeScore != null && g.awayScore != null)
    .map((g) => ({
      homeAbbrev: g.homeTeam.abbreviation,
      awayAbbrev: g.awayTeam.abbreviation,
      homeScore: g.homeScore!,
      awayScore: g.awayScore!,
      gameDate: g.date,
    }));

  _nbaResultsCache = { data: results, fetchedAt: now };
  return results;
}

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
  source: "nhl" | "mlb" | "nba",
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

  const results = source === "nba" ? await fetchNBARecentResults() : await fetchMLBRecentResults();
  return pending.flatMap((qualifier) => {
    const qualifiedTeam = qualifier.qualified_team;
    if (!qualifiedTeam) return [];
    const matchResult = results.find((r) => (
      r.homeAbbrev.toUpperCase() === qualifier.home_team.toUpperCase() &&
      r.awayAbbrev.toUpperCase() === qualifier.road_team.toUpperCase() &&
      (source === "nba" || r.gameDate === qualifier.game_date)
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
  source: "nhl" | "mlb" | "nba",
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
  } else if (source === "nba") {
    results = await fetchNBARecentResults();
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
      ((source === "nhl" || source === "nba") || !r.gameDate || r.gameDate === qualifier.game_date)
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

  const gradeableSystemIds = new Set<string>([
    ...GRADEABLE_ML_SYSTEMS,
    ...GRADEABLE_TOTAL_SYSTEMS,
    ...GRADEABLE_PROGRESSION_SYSTEMS,
    ...GRADEABLE_PGA_SYSTEMS,
    "robbies-ripper-fast-5",
  ]);

  for (const q of allPending) {
    if (!gradeableSystemIds.has(q.system_id)) continue;
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

  await gradeAndReport("nba-goose-system", async () => gradeGooseQualifiers(pendingBySystem.get("nba-goose-system") ?? []));
  await gradeAndReport("swaggy-stretch-drive", async () => gradeSwaggyQualifiers(pendingBySystem.get("swaggy-stretch-drive") ?? []));
  await gradeAndReport("falcons-fight-pummeled-pitchers", async () => gradeFalconsQualifiers(pendingBySystem.get("falcons-fight-pummeled-pitchers") ?? []));
  await gradeAndReport("coach-no-rest", async () => gradePendingMlQualifiers(pendingBySystem.get("coach-no-rest") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("bigcat-bonaza-puckluck", async () => gradePendingMlQualifiers(pendingBySystem.get("bigcat-bonaza-puckluck") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("fat-tonys-fade", async () => gradePendingMlQualifiers(pendingBySystem.get("fat-tonys-fade") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("nba-home-dog-majority-handle", async () => gradePendingMlQualifiers(pendingBySystem.get("nba-home-dog-majority-handle") ?? [], "nba", "nba-espn-final"));
  await gradeAndReport("nba-home-super-majority-close-game", async () => gradePendingMlQualifiers(pendingBySystem.get("nba-home-super-majority-close-game") ?? [], "nba", "nba-espn-final"));
  await gradeAndReport("nhl-home-dog-majority-handle", async () => gradePendingMlQualifiers(pendingBySystem.get("nhl-home-dog-majority-handle") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("mlb-home-majority-handle", async () => gradePendingMlQualifiers(pendingBySystem.get("mlb-home-majority-handle") ?? [], "mlb", "mlb-api-final"));
  await gradeAndReport("nhl-under-majority-handle", async () => gradePendingTotalQualifiers(pendingBySystem.get("nhl-under-majority-handle") ?? [], "nhl", "nhl-api-final"));
  await gradeAndReport("mlb-under-majority-handle", async () => gradePendingTotalQualifiers(pendingBySystem.get("mlb-under-majority-handle") ?? [], "mlb", "mlb-api-final"));

  // Grade PGA picks via BDL tournament results
  await gradeAndReport("pga-goose-picks", async () => gradePGAQualifiers(pendingBySystem.get("pga-goose-picks") ?? []));

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
    if (systemId === "nba-goose-system") {
      gradedInputs = await gradeGooseQualifiers(allPending);
    } else if (systemId === "swaggy-stretch-drive") {
      gradedInputs = await gradeSwaggyQualifiers(allPending);
    } else if (systemId === "falcons-fight-pummeled-pitchers") {
      gradedInputs = await gradeFalconsQualifiers(allPending);
    } else if (systemId === "robbies-ripper-fast-5") {
      gradedInputs = await gradeRobbiesRipperFast5Qualifiers(allPending);
    } else if (systemId === "coach-no-rest" || systemId === "bigcat-bonaza-puckluck" || systemId === "fat-tonys-fade" || systemId === "nhl-home-dog-majority-handle") {
      gradedInputs = await gradePendingMlQualifiers(allPending, "nhl", "nhl-api-final");
    } else if (systemId === "mlb-home-majority-handle") {
      gradedInputs = await gradePendingMlQualifiers(allPending, "mlb", "mlb-api-final");
    } else if (systemId === "nhl-under-majority-handle") {
      gradedInputs = await gradePendingTotalQualifiers(allPending, "nhl", "nhl-api-final");
    } else if (systemId === "mlb-under-majority-handle") {
      gradedInputs = await gradePendingTotalQualifiers(allPending, "mlb", "mlb-api-final");
    } else if (systemId === "nba-home-dog-majority-handle" || systemId === "nba-home-super-majority-close-game") {
      gradedInputs = await gradePendingMlQualifiers(allPending, "nba", "nba-espn-final");
    } else if (systemId === "pga-goose-picks") {
      gradedInputs = await gradePGAQualifiers(allPending);
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
  gradingType: "moneyline" | "quarter_ats" | "totals" | "f5" | "watchlist_only";
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
    "fat-tonys-fade": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "NBA moneyline fade system: grades the qualified faded side from ESPN/NBA final scores once qualifiers are logged.",
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
      gradingType: "totals",
      notes: "NHL totals under: grades against final combined score and stored total line.",
    },
    "mlb-under-majority-handle": {
      gradeable: true,
      gradingType: "totals",
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
      gradingType: "f5",
      notes: "MLB F5 side/total: grades from MLB Stats API per-inning linescore. Rows stay pending until 5 complete innings confirmed. Alert rows with a qualified team are graded as F5 side; f5-total rows grade against the posted line.",
    },
    "pga-goose-picks": {
      gradeable: true,
      gradingType: "moneyline",
      notes: "PGA Top 5/10/20/Winner: graded via BDL tournament results (official final leaderboard). Qualifier provenance must include playerName and market fields. tournamentId optional; falls back to most recently completed BDL tournament.",
    },
  };
}
