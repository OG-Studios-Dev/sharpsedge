/**
 * GET /api/admin/system-health
 * (also served at /api/admin/source-health/systems)
 *
 * Per-system input verification diagnostics for all live betting systems.
 *
 * Unlike /api/admin/source-health (which aggregates sport-level health),
 * this endpoint diagnoses each live SYSTEM's input readiness specifically —
 * e.g. "MLB F5" is a separate system from "MLB general" and has different
 * required inputs (F5 markets must be explicitly posted by books).
 *
 * Query params:
 *   ?sport=MLB|NHL|NBA|PGA|ALL  (default ALL)
 *   ?team=BOS                   (optional: narrow to a specific team/player/context)
 *   ?player=<name>              (optional: narrow to specific player for NBA/PGA)
 *
 * Returns:
 *   - Per-system diagnostic results with input status breakdown
 *   - Overall qualification status per system (ready / degraded / blocked)
 *   - Which inputs are present, missing, stale, or blocked
 *   - canQualify flag: can picks be generated for this system right now?
 *   - Summary of blocked/degraded systems across all sports
 *   - contextSelections: which context was chosen for each sport and why
 *
 * Context selection strategy:
 *   Each sport scans ALL available candidates (games/players/tournaments)
 *   and selects the context with the strongest required-input readiness.
 *   This ensures the diagnostics board reflects whether the system CAN
 *   actually fire right now — not whether one random/stale matchup is bad.
 *
 * Data flow:
 *   1. Fetch board/schedule for each sport once
 *   2. Score all candidates by required-input readiness
 *   3. Pick best candidate, fetch full context hints for it
 *   4. Pass hints to per-sport diagnose* functions
 *
 * This is a best-effort aggregator — failures in one sport don't block others.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runSportDiagnostics,
} from "@/lib/live-system-diagnostics";
import {
  summarizeSystemDiagnostics,
  type SystemDiagnosticResult,
} from "@/lib/system-diagnostics";
import {
  fetchMLBContextHints,
  emptyMLBContextHints,
} from "@/lib/goose-model/mlb-features";
import {
  fetchNHLContextHints,
  emptyNHLContextHints,
} from "@/lib/goose-model/nhl-features";
import {
  fetchNBAContextHints,
  emptyNBAContextHints,
} from "@/lib/goose-model/nba-context";
import {
  fetchPGAContextHints,
  emptyPGAContextHints,
} from "@/lib/goose-model/pga-features";
import { getDGCache } from "@/lib/datagolf-cache";
import { getMLBEnrichmentBoard } from "@/lib/mlb-enrichment";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import { getNBASchedule } from "@/lib/nba-api";
import { getDateKey, MLB_TIME_ZONE } from "@/lib/date-utils";
import { findBestFuzzyNameMatch } from "@/lib/name-match";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Context selection rationale ────────────────────────────────────────────

interface ContextSelection {
  sport: string;
  contextKey: string;
  rationale: string;
  candidatesScanned: number;
  score: number;
}

// ── NBA star player map ────────────────────────────────────────────────────
// Used to find a reliable player with L5 stats for today's actual games.
// Ordered by reliability of ESPN data presence (stars always have game logs).

const NBA_STAR_PLAYERS: Record<string, string> = {
  BOS: "Jayson Tatum",
  LAL: "LeBron James",
  GSW: "Stephen Curry",
  DEN: "Nikola Jokic",
  MIL: "Giannis Antetokounmpo",
  PHI: "Joel Embiid",
  PHX: "Kevin Durant",
  MIA: "Jimmy Butler",
  NYK: "Jalen Brunson",
  OKC: "Shai Gilgeous-Alexander",
  CLE: "Donovan Mitchell",
  SAC: "De'Aaron Fox",
  MIN: "Anthony Edwards",
  IND: "Tyrese Haliburton",
  DAL: "Luka Doncic",
  NOP: "Zion Williamson",
  ATL: "Trae Young",
  TOR: "Scottie Barnes",
  CHI: "Coby White",
  MEM: "Ja Morant",
  SAS: "Victor Wembanyama",
  ORL: "Paolo Banchero",
  BKN: "Cam Thomas",
  LAC: "James Harden",
  HOU: "Alperen Sengun",
  UTA: "Lauri Markkanen",
  POR: "Scoot Henderson",
  WAS: "Jordan Poole",
  DET: "Cade Cunningham",
  CHA: "LaMelo Ball",
};

// ── MLB best-context selector ──────────────────────────────────────────────

/**
 * Score an MLB game candidate by how many required inputs are likely available.
 * Uses enrichment board data (already fetched once).
 */
function scoreMLBGame(game: {
  matchup: {
    away: { abbreviation: string; probablePitcher: { name?: string | null; id?: string | number | null } | null };
    home: { abbreviation: string; probablePitcher: { name?: string | null; id?: string | number | null } | null };
  };
  starterQuality?: {
    away: { era: number | null; qualityScore: number | null; pitcherName: string | null } | null;
    home: { era: number | null; qualityScore: number | null; pitcherName: string | null } | null;
  } | null;
  parkFactor?: unknown;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const isTBD = (name?: string | null) =>
    !name || name.toLowerCase().includes("tbd") || name.trim() === "" || name === "Unknown";

  const awayPitcher = game.matchup.away.probablePitcher;
  const homePitcher = game.matchup.home.probablePitcher;
  const awayQuality = game.starterQuality?.away;
  const homeQuality = game.starterQuality?.home;

  // Prefer ERA-present (strongest signal: system can score the starter)
  // Fall back to name-present (weak: starter announced but no stats yet)
  if (awayQuality?.era !== null && awayQuality?.era !== undefined) {
    score += 3;
    reasons.push(`away starter ERA: ${awayQuality.era.toFixed(2)} (${awayQuality.pitcherName ?? "?"})`);
  } else if (awayQuality?.qualityScore !== null && awayQuality?.qualityScore !== undefined) {
    score += 2;
    reasons.push(`away starter quality: ${awayQuality.qualityScore} (${awayQuality.pitcherName ?? "?"})`);
  } else if (awayPitcher?.name && !isTBD(awayPitcher.name)) {
    score += 1;
    reasons.push(`away starter named: ${awayPitcher.name} (no stats yet)`);
  }

  if (homeQuality?.era !== null && homeQuality?.era !== undefined) {
    score += 3;
    reasons.push(`home starter ERA: ${homeQuality.era.toFixed(2)} (${homeQuality.pitcherName ?? "?"})`);
  } else if (homeQuality?.qualityScore !== null && homeQuality?.qualityScore !== undefined) {
    score += 2;
    reasons.push(`home starter quality: ${homeQuality.qualityScore} (${homeQuality.pitcherName ?? "?"})`);
  } else if (homePitcher?.name && !isTBD(homePitcher.name)) {
    score += 1;
    reasons.push(`home starter named: ${homePitcher.name} (no stats yet)`);
  }

  // Park factor is always seeded — counts as baseline data availability
  if (game.parkFactor) {
    score += 1;
    reasons.push("park factor available");
  }

  return { score, reasons };
}

/**
 * Select the best MLB game from the enrichment board.
 * Picks the game with the most confirmed inputs (starters, park factor).
 */
async function selectBestMLBContext(
  team?: string | null,
  opponent?: string | null,
): Promise<{ team: string; opponent: string; rationale: string; candidatesScanned: number; score: number }> {
  // Caller-specified context always wins
  if (team && opponent) {
    return {
      team,
      opponent,
      rationale: "explicitly specified via query param",
      candidatesScanned: 1,
      score: -1,
    };
  }

  const today = getDateKey(new Date(), MLB_TIME_ZONE);

  let board: Awaited<ReturnType<typeof getMLBEnrichmentBoard>> | null = null;
  try {
    board = await getMLBEnrichmentBoard(today);
  } catch {
    // Board unavailable — fall through to defaults
  }

  const games = board?.games ?? [];
  if (games.length === 0) {
    return {
      team: "NYY",
      opponent: "BOS",
      rationale: "no games on schedule today — using fallback NYY @ BOS",
      candidatesScanned: 0,
      score: 0,
    };
  }

  let bestScore = -1;
  let bestTeam = games[0].matchup.away.abbreviation;
  let bestOpponent = games[0].matchup.home.abbreviation;
  let bestReasons: string[] = [];

  for (const game of games) {
    const { score, reasons } = scoreMLBGame(game);
    if (score > bestScore) {
      bestScore = score;
      bestTeam = game.matchup.away.abbreviation;
      bestOpponent = game.matchup.home.abbreviation;
      bestReasons = reasons;
    }
  }

  const rationale =
    bestReasons.length > 0
      ? `${bestTeam} @ ${bestOpponent} scored ${bestScore}/5: ${bestReasons.join(", ")}`
      : `${bestTeam} @ ${bestOpponent} (best available from ${games.length} games, but starters not yet confirmed)`;

  return {
    team: bestTeam,
    opponent: bestOpponent,
    rationale,
    candidatesScanned: games.length,
    score: bestScore,
  };
}

// ── NHL best-context selector ──────────────────────────────────────────────

/**
 * Score an NHL game from the context board.
 * Prefer games where both goalies are confirmed (not backup/unavailable).
 */
function scoreNHLGame(game: {
  matchup: { awayTeam: { abbrev: string }; homeTeam: { abbrev: string } };
  teams: {
    away: { derived: { goalie: { isBackup: boolean; starterStatus: string } }; sourced: { standings: unknown | null } };
    home: { derived: { goalie: { isBackup: boolean; starterStatus: string } }; sourced: { standings: unknown | null } };
  };
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const awayGoalie = game.teams.away.derived.goalie;
  const homeGoalie = game.teams.home.derived.goalie;

  if (awayGoalie.starterStatus !== "unavailable" && !awayGoalie.isBackup) {
    score += 2;
    reasons.push(`away goalie confirmed (status: ${awayGoalie.starterStatus})`);
  } else if (awayGoalie.starterStatus !== "unavailable") {
    score += 1;
    reasons.push(`away goalie found (backup)`);
  }

  if (homeGoalie.starterStatus !== "unavailable" && !homeGoalie.isBackup) {
    score += 2;
    reasons.push(`home goalie confirmed (status: ${homeGoalie.starterStatus})`);
  } else if (homeGoalie.starterStatus !== "unavailable") {
    score += 1;
    reasons.push(`home goalie found (backup)`);
  }

  if (game.teams.away.sourced.standings !== null) score += 1;
  if (game.teams.home.sourced.standings !== null) score += 1;

  return { score, reasons };
}

/**
 * Select the best NHL game from today's context board.
 * Picks the game with the most confirmed goalie + standings data.
 */
async function selectBestNHLContext(
  team?: string | null,
  opponent?: string | null,
): Promise<{ team: string; opponent: string; rationale: string; candidatesScanned: number; score: number }> {
  if (team && opponent) {
    return { team, opponent, rationale: "explicitly specified via query param", candidatesScanned: 1, score: -1 };
  }

  let boardGames: Array<{
    matchup: { awayTeam: { abbrev: string }; homeTeam: { abbrev: string } };
    teams: {
      away: { derived: { goalie: { isBackup: boolean; starterStatus: string } }; sourced: { standings: unknown | null } };
      home: { derived: { goalie: { isBackup: boolean; starterStatus: string } }; sourced: { standings: unknown | null } };
    };
  }> = [];

  try {
    const board = await getTodayNHLContextBoard();
    boardGames = board.games as typeof boardGames;
  } catch {
    // Fall through to defaults
  }

  if (boardGames.length === 0) {
    return {
      team: "TOR",
      opponent: "BOS",
      rationale: "no NHL games on schedule today — using fallback TOR @ BOS",
      candidatesScanned: 0,
      score: 0,
    };
  }

  let bestScore = -1;
  let bestTeam = boardGames[0].matchup.awayTeam.abbrev;
  let bestOpponent = boardGames[0].matchup.homeTeam.abbrev;
  let bestReasons: string[] = [];

  for (const game of boardGames) {
    const { score, reasons } = scoreNHLGame(game);
    if (score > bestScore) {
      bestScore = score;
      bestTeam = game.matchup.awayTeam.abbrev;
      bestOpponent = game.matchup.homeTeam.abbrev;
      bestReasons = reasons;
    }
  }

  const rationale =
    bestReasons.length > 0
      ? `${bestTeam} @ ${bestOpponent} scored ${bestScore}/6: ${bestReasons.join(", ")}`
      : `${bestTeam} @ ${bestOpponent} (best available from ${boardGames.length} games, goalies not yet confirmed)`;

  return {
    team: bestTeam,
    opponent: bestOpponent,
    rationale,
    candidatesScanned: boardGames.length,
    score: bestScore,
  };
}

// ── NBA best-context selector ──────────────────────────────────────────────

/**
 * Select the best NBA game + player from today's actual schedule.
 * Scans today's games, finds the first one where a known star player
 * is available (has a L5 game log via ESPN), then uses that matchup.
 */
async function selectBestNBAContext(
  player?: string | null,
  team?: string | null,
  opponent?: string | null,
): Promise<{
  player: string | null;
  team: string;
  opponent: string;
  rationale: string;
  candidatesScanned: number;
  score: number;
}> {
  if (team && opponent) {
    return { player: player ?? null, team, opponent, rationale: "explicitly specified via query param", candidatesScanned: 1, score: -1 };
  }

  let todayGames: Array<{
    homeTeam: { abbreviation: string };
    awayTeam: { abbreviation: string };
  }> = [];

  try {
    const schedule = await getNBASchedule(0);
    todayGames = schedule.filter((g) => g.status !== "Final");
  } catch {
    // Fall through
  }

  if (todayGames.length === 0) {
    return {
      player: player ?? "Jayson Tatum",
      team: "BOS",
      opponent: "NYK",
      rationale: "no NBA games today — using well-known player context (Jayson Tatum, BOS vs NYK)",
      candidatesScanned: 0,
      score: 0,
    };
  }

  const candidateContexts: Array<{ player: string | null; team: string; opponent: string; reason: string }> = [];

  if (player) {
    const explicitTeam = team?.toUpperCase() ?? null;
    const explicitOpponent = opponent?.toUpperCase() ?? null;

    if (explicitTeam && explicitOpponent) {
      candidateContexts.push({
        player,
        team: explicitTeam,
        opponent: explicitOpponent,
        reason: `player explicitly specified: ${player}`,
      });
    } else {
      const matchingGame = todayGames.find((game) => {
        const home = game.homeTeam.abbreviation.toUpperCase();
        const away = game.awayTeam.abbreviation.toUpperCase();
        return home === explicitTeam || away === explicitTeam;
      });

      if (matchingGame) {
        const home = matchingGame.homeTeam.abbreviation.toUpperCase();
        const away = matchingGame.awayTeam.abbreviation.toUpperCase();
        const inferredTeam = explicitTeam ?? home;
        candidateContexts.push({
          player,
          team: inferredTeam,
          opponent: inferredTeam === home ? away : home,
          reason: `player explicitly specified: ${player}`,
        });
      }
    }
  } else {
    for (const game of todayGames) {
      const homeAbbrev = game.homeTeam.abbreviation.toUpperCase();
      const awayAbbrev = game.awayTeam.abbreviation.toUpperCase();
      const homeStar = NBA_STAR_PLAYERS[homeAbbrev];
      const awayStar = NBA_STAR_PLAYERS[awayAbbrev];

      if (homeStar) {
        candidateContexts.push({
          player: homeStar,
          team: homeAbbrev,
          opponent: awayAbbrev,
          reason: `${homeStar} (${homeAbbrev}) is a mapped star on today's schedule`,
        });
      }
      if (awayStar) {
        candidateContexts.push({
          player: awayStar,
          team: awayAbbrev,
          opponent: homeAbbrev,
          reason: `${awayStar} (${awayAbbrev}) is a mapped star on today's schedule`,
        });
      }
    }
  }

  if (candidateContexts.length === 0) {
    const first = todayGames[0];
    const home = first.homeTeam.abbreviation.toUpperCase();
    const away = first.awayTeam.abbreviation.toUpperCase();
    const fallbackPlayer = NBA_STAR_PLAYERS[home] ?? NBA_STAR_PLAYERS[away] ?? "Jayson Tatum";
    return {
      player: fallbackPlayer,
      team: NBA_STAR_PLAYERS[home] ? home : away,
      opponent: NBA_STAR_PLAYERS[home] ? away : home,
      rationale: `no mapped star player found for today's ${todayGames.length} games — using best fallback baseline`,
      candidatesScanned: todayGames.length,
      score: 0,
    };
  }

  let best = {
    player: candidateContexts[0].player,
    team: candidateContexts[0].team,
    opponent: candidateContexts[0].opponent,
    rationale: candidateContexts[0].reason,
    score: -1,
  };

  for (const candidate of candidateContexts) {
    const hints = await fetchNBAContextHints(candidate.player, candidate.team, candidate.opponent, "points", null)
      .catch(() => emptyNBAContextHints());

    let score = 0;
    const reasons: string[] = [];

    if (hints.player_found) {
      score += 3;
      reasons.push("player resolved");
    } else if (candidate.player) {
      const mapped = Object.values(NBA_STAR_PLAYERS);
      const fuzzy = findBestFuzzyNameMatch(mapped, candidate.player, (name) => name);
      if (fuzzy) {
        score += 1;
        reasons.push(`player fuzzy-matchable (${fuzzy})`);
      }
    }

    if (hints.player_confirmed_active === true) {
      score += 2;
      reasons.push("player confirmed active");
    }

    if (hints.player_avg_minutes_l5 != null) {
      score += 2;
      reasons.push(`L5 minutes ${hints.player_avg_minutes_l5.toFixed(1)}`);
    }

    if (hints.player_avg_stat_l5 != null) {
      score += 2;
      reasons.push("L5 stat available");
    }

    if (hints.opponent_dvp_rank != null) {
      score += 1;
      reasons.push(`DvP rank ${hints.opponent_dvp_rank}`);
    }

    if (hints.team_pace_rank != null && hints.opponent_pace_rank != null) {
      score += 1;
      reasons.push("pace context ready");
    }

    if (score > best.score) {
      best = {
        player: candidate.player,
        team: candidate.team,
        opponent: candidate.opponent,
        rationale: `${candidate.team} vs ${candidate.opponent} — ${candidate.reason}; fetched readiness ${score}/11: ${reasons.join(", ") || "best available"}`,
        score,
      };
    }
  }

  return {
    player: best.player,
    team: best.team,
    opponent: best.opponent,
    rationale: best.rationale,
    candidatesScanned: candidateContexts.length,
    score: best.score,
  };
}

// ── PGA best-context selector ──────────────────────────────────────────────

/**
 * Select the best PGA player from the current DG cache.
 * Picks the top-ranked player who also has predictions data —
 * this maximizes the chance of all required inputs being present.
 */
async function selectBestPGAContext(
  player?: string | null,
): Promise<{ player: string; tournament: string | null; rationale: string; candidatesScanned: number; score: number }> {
  if (player) {
    let tournamentName: string | null = null;
    try {
      const dgCache = await getDGCache();
      tournamentName = dgCache?.tournament ?? null;
    } catch { /* non-fatal */ }
    return { player, tournament: tournamentName, rationale: "explicitly specified via query param", candidatesScanned: 1, score: -1 };
  }

  let dgCache: Awaited<ReturnType<typeof getDGCache>> | null = null;
  try {
    dgCache = await getDGCache();
  } catch { /* non-fatal */ }

  const tournamentName = dgCache?.tournament ?? null;
  const rankings = dgCache?.data?.rankings ?? [];
  const predictions = dgCache?.data?.predictions ?? [];
  const field = dgCache?.data?.field ?? [];

  // Build a set of players with predictions for quick lookup
  const playersWithPredictions = new Set(predictions.map((p) => p.name.toLowerCase().trim()));
  const playersWithCourseFit = new Set((dgCache?.data?.courseFit ?? []).map((p) => p.name.toLowerCase().trim()));

  const totalCandidates = rankings.length || field.length;

  if (totalCandidates === 0) {
    return {
      player: "Rory McIlroy",
      tournament: tournamentName,
      rationale: "DG cache empty or unavailable — using Rory McIlroy as default; system will show blocked/degraded if DG data is missing",
      candidatesScanned: 0,
      score: 0,
    };
  }

  // Score: predictions (required) + course fit (enrichment) + low rank (top player)
  // Sort rankings by rank ascending (rank=1 is best)
  const sorted = [...rankings].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  let bestPlayer = sorted[0]?.name ?? "Rory McIlroy";
  let bestScore = 0;
  let bestReasons: string[] = [];
  let scanned = 0;

  // Only check top 20 to avoid excessive scanning
  for (const entry of sorted.slice(0, 20)) {
    scanned++;
    const nameLower = entry.name.toLowerCase().trim();
    let score = 0;
    const reasons: string[] = [];

    // Rank bonus (top 10 = 2pts, top 20 = 1pt)
    if ((entry.rank ?? 999) <= 10) { score += 2; reasons.push(`DG rank #${entry.rank}`); }
    else if ((entry.rank ?? 999) <= 20) { score += 1; reasons.push(`DG rank #${entry.rank}`); }

    // Predictions present (required input)
    if (playersWithPredictions.has(nameLower)) { score += 3; reasons.push("predictions present"); }

    // Course fit (enrichment)
    if (playersWithCourseFit.has(nameLower)) { score += 1; reasons.push("course fit present"); }

    // SG data available (strong input)
    if (entry.sgTotal !== null && entry.sgTotal !== undefined) { score += 1; reasons.push(`SG total: ${entry.sgTotal?.toFixed(3)}`); }

    if (score > bestScore) {
      bestScore = score;
      bestPlayer = entry.name;
      bestReasons = reasons;
    }

    // Short-circuit: if we found a player with all inputs, no need to keep scanning
    if (score >= 7) break;
  }

  // If no ranked player has predictions, fall back to first prediction entry
  if (bestScore < 3 && predictions.length > 0) {
    bestPlayer = predictions[0].name;
    bestScore = 3;
    bestReasons = ["predictions present (no ranked player had predictions — using first prediction entry)"];
  }

  const rationale =
    bestReasons.length > 0
      ? `${bestPlayer} scored ${bestScore}/7: ${bestReasons.join(", ")}` +
        (tournamentName ? ` @ ${tournamentName}` : "")
      : `${bestPlayer} (best available from ${totalCandidates} field players)` +
        (tournamentName ? ` @ ${tournamentName}` : "");

  return {
    player: bestPlayer,
    tournament: tournamentName,
    rationale,
    candidatesScanned: scanned,
    score: bestScore,
  };
}

// ── Sport probe functions ──────────────────────────────────────────────────

async function probeMLBSystems(
  team?: string | null,
  opponent?: string | null,
  baseUrl?: string,
): Promise<{ results: SystemDiagnosticResult[]; selection: ContextSelection }> {
  const selected = await selectBestMLBContext(team, opponent);

  let contextTeam = selected.team;
  let contextOpponent = selected.opponent;
  let contextKey = `${contextTeam} @ ${contextOpponent}`;
  let mlbHints = await fetchMLBContextHints(contextTeam, contextOpponent)
    .catch(() => emptyMLBContextHints());
  let selectionRationale = selected.rationale;
  let selectionScore = selected.score;

  if (!team && !opponent) {
    try {
      const today = getDateKey(new Date(), MLB_TIME_ZONE);
      const board = await getMLBEnrichmentBoard(today);
      const games = board?.games ?? [];
      let bestLive = {
        team: contextTeam,
        opponent: contextOpponent,
        score: -1,
        rationale: selectionRationale,
        hints: mlbHints,
      };

      for (const game of games) {
        const away = game.matchup.away.abbreviation;
        const home = game.matchup.home.abbreviation;
        const hints = await fetchMLBContextHints(away, home).catch(() => emptyMLBContextHints());

        let liveScore = 0;
        const reasons: string[] = [];

        const startersReady = (hints.team_starter_era != null || hints.team_starter_quality != null)
          && (hints.opponent_starter_era != null || hints.opponent_starter_quality != null);
        const oneStarterReady = (hints.team_starter_era != null || hints.team_starter_quality != null)
          || (hints.opponent_starter_era != null || hints.opponent_starter_quality != null);

        if (startersReady) {
          liveScore += 4;
          reasons.push("both starters ready");
        } else if (oneStarterReady) {
          liveScore += 1;
          reasons.push("only one starter ready");
        } else {
          reasons.push("starter context still thin");
        }

        if (hints.park_runs_index != null) {
          liveScore += 1;
          reasons.push("park factor");
        }

        if (hints.weather_eligible) {
          if (hints.wind_speed_mph != null || hints.temperature_f != null) {
            liveScore += 1;
            reasons.push("weather usable");
          }
        } else {
          liveScore += 1;
          reasons.push("roofed/non-weather-dependent venue");
        }

        if (hints.team_lineup_status === "official" || hints.opponent_lineup_status === "official") {
          liveScore += 2;
          reasons.push("official lineup present");
        } else if (hints.team_lineup_status === "partial" || hints.opponent_lineup_status === "partial") {
          liveScore += 1;
          reasons.push("partial lineup context");
        }

        if (hints.team_bullpen_level !== "unknown" && hints.opponent_bullpen_level !== "unknown") {
          liveScore += 1;
          reasons.push("bullpen context ready");
        }

        if (liveScore > bestLive.score) {
          bestLive = {
            team: away,
            opponent: home,
            score: liveScore,
            rationale: `${away} @ ${home} scored ${liveScore}/9 from fetched hints: ${reasons.join(", ") || "best available"}`,
            hints,
          };
        }
      }

      contextTeam = bestLive.team;
      contextOpponent = bestLive.opponent;
      contextKey = `${contextTeam} @ ${contextOpponent}`;
      mlbHints = bestLive.hints;
      selectionRationale = bestLive.rationale;
      selectionScore = bestLive.score;
    } catch {
      // keep initial selection
    }
  }

  // Fetch F5 market status
  let mlbF5Status = null;
  if (baseUrl) {
    try {
      const f5Res = await fetch(`${baseUrl}/api/admin/source-health/mlb-f5`, { cache: "no-store" });
      if (f5Res.ok) {
        const f5Data = await f5Res.json() as Record<string, unknown>;
        const games = (f5Data.games as Array<Record<string, unknown>>) ?? [];
        const matchingGame = games.find(
          (g) =>
            (typeof g.matchup === "string" && g.matchup.includes(contextTeam) && g.matchup.includes(contextOpponent)),
        );
        if (matchingGame) {
          mlbF5Status = {
            f5MoneylinePosted: (matchingGame.f5MoneylinePosted as boolean) ?? false,
            f5TotalPosted: (matchingGame.f5TotalPosted as boolean) ?? false,
            blocker: (matchingGame.blocker as string | null) ?? null,
            f5Books: (matchingGame.f5Books as string[]) ?? [],
          };
        }
      }
    } catch { /* F5 status optional */ }
  }

  const results = await runSportDiagnostics({
    sport: "MLB",
    contextKey,
    mlbHints,
    mlbF5Status,
  });

  return {
    results,
    selection: {
      sport: "MLB",
      contextKey,
      rationale: selectionRationale,
      candidatesScanned: selected.candidatesScanned,
      score: selectionScore,
    },
  };
}

async function probeNHLSystems(
  team?: string | null,
  opponent?: string | null,
): Promise<{ results: SystemDiagnosticResult[]; selection: ContextSelection }> {
  const selected = await selectBestNHLContext(team, opponent);
  const { team: contextTeam, opponent: contextOpponent } = selected;
  const contextKey = `${contextTeam} @ ${contextOpponent}`;

  const nhlHints = await fetchNHLContextHints(contextTeam, contextOpponent)
    .catch(() => emptyNHLContextHints());

  const results = await runSportDiagnostics({ sport: "NHL", contextKey, nhlHints });

  return {
    results,
    selection: {
      sport: "NHL",
      contextKey,
      rationale: selected.rationale,
      candidatesScanned: selected.candidatesScanned,
      score: selected.score,
    },
  };
}

async function probeNBASystems(
  player?: string | null,
  team?: string | null,
  opponent?: string | null,
): Promise<{ results: SystemDiagnosticResult[]; selection: ContextSelection }> {
  const selected = await selectBestNBAContext(player, team, opponent);
  const { player: contextPlayer, team: contextTeam, opponent: contextOpponent } = selected;

  const contextKey = contextPlayer
    ? `${contextPlayer} (${contextTeam} vs ${contextOpponent})`
    : `${contextTeam} vs ${contextOpponent}`;

  const nbaHints = await fetchNBAContextHints(
    contextPlayer,
    contextTeam,
    contextOpponent,
    "points",
    null,
  ).catch(() => emptyNBAContextHints());

  const results = await runSportDiagnostics({ sport: "NBA", contextKey, nbaHints });

  return {
    results,
    selection: {
      sport: "NBA",
      contextKey,
      rationale: selected.rationale,
      candidatesScanned: selected.candidatesScanned,
      score: selected.score,
    },
  };
}

async function probePGASystems(
  player?: string | null,
): Promise<{ results: SystemDiagnosticResult[]; selection: ContextSelection }> {
  const selected = await selectBestPGAContext(player);
  const { player: contextPlayer, tournament: tournamentName } = selected;
  const contextKey = `${contextPlayer}${tournamentName ? ` @ ${tournamentName}` : ""}`;

  const pgaHints = await fetchPGAContextHints(
    contextPlayer,
    `${contextPlayer} Top 10`,
    null,
    null,
    null,
    tournamentName,
  ).catch(() => emptyPGAContextHints());

  const results = await runSportDiagnostics({ sport: "PGA", contextKey, pgaHints });

  return {
    results,
    selection: {
      sport: "PGA",
      contextKey,
      rationale: selected.rationale,
      candidatesScanned: selected.candidatesScanned,
      score: selected.score,
    },
  };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get("sport")?.toUpperCase() ?? "ALL";
  const team = req.nextUrl.searchParams.get("team");
  const player = req.nextUrl.searchParams.get("player");
  const opponent = req.nextUrl.searchParams.get("opponent");
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin || "http://localhost:3000";

  const sportsToProbe =
    sport === "ALL" ? ["MLB", "NHL", "NBA", "PGA"] : [sport];

  type ProbeResult = { results: SystemDiagnosticResult[]; selection: ContextSelection };

  const probeMap: Record<string, () => Promise<ProbeResult>> = {
    MLB: () => probeMLBSystems(team, opponent, baseUrl),
    NHL: () => probeNHLSystems(team, opponent),
    NBA: () => probeNBASystems(player, team, opponent),
    PGA: () => probePGASystems(player),
  };

  const settled = await Promise.allSettled(
    sportsToProbe.map((s) => {
      const probe = probeMap[s];
      return probe ? probe() : Promise.resolve<ProbeResult>({ results: [], selection: { sport: s, contextKey: "N/A", rationale: "unknown sport", candidatesScanned: 0, score: 0 } });
    }),
  );

  const allDiagnostics: SystemDiagnosticResult[] = [];
  const contextSelections: ContextSelection[] = [];
  const errors: Array<{ sport: string; error: string }> = [];

  settled.forEach((result, i) => {
    const sportName = sportsToProbe[i];
    if (result.status === "fulfilled") {
      allDiagnostics.push(...result.value.results);
      contextSelections.push(result.value.selection);
    } else {
      errors.push({
        sport: sportName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      allDiagnostics.push({
        system: `${sportName.toLowerCase()}-probe-failed`,
        systemLabel: `${sportName} (probe failed)`,
        sport: sportName as SystemDiagnosticResult["sport"],
        contextKey: "N/A",
        inputs: [],
        qualificationStatus: "blocked",
        canQualify: false,
        blockers: ["probe_failed"],
        enrichmentGaps: [],
        diagnosedAt: new Date().toISOString(),
      });
      contextSelections.push({
        sport: sportName,
        contextKey: "N/A",
        rationale: `probe failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        candidatesScanned: 0,
        score: 0,
      });
    }
  });

  const summary = summarizeSystemDiagnostics(allDiagnostics);

  // Per-sport summary for quick dashboard scanning
  const bySport: Record<string, {
    systems: SystemDiagnosticResult[];
    canQualifyAll: boolean;
    blockers: string[];
    enrichmentGaps: string[];
    contextSelection?: ContextSelection;
  }> = {};

  for (const diag of allDiagnostics) {
    if (!bySport[diag.sport]) {
      bySport[diag.sport] = {
        systems: [],
        canQualifyAll: true,
        blockers: [],
        enrichmentGaps: [],
      };
    }
    bySport[diag.sport].systems.push(diag);
    if (!diag.canQualify) bySport[diag.sport].canQualifyAll = false;
    bySport[diag.sport].blockers.push(...diag.blockers);
    bySport[diag.sport].enrichmentGaps.push(...diag.enrichmentGaps);
  }

  // Attach context selection to each sport's summary
  for (const sel of contextSelections) {
    if (bySport[sel.sport]) {
      bySport[sel.sport].contextSelection = sel;
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sport: sport === "ALL" ? "ALL" : sport,
    summary,
    contextSelections,
    bySport,
    diagnostics: allDiagnostics,
    probe_errors: errors.length > 0 ? errors : undefined,
  });
}
