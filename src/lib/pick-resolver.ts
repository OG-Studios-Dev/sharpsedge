/**
 * pick-resolver.ts
 * ─────────────────────────────────────────────────────────────
 * Shared resolver logic for NHL / NBA / MLB / PGA picks.
 *
 * Used by:
 *   • /api/picks/resolve          — main resolve pipeline
 *   • /api/admin/goose-model/auto-grade — daily cron grader
 *
 * Every change to a sport resolver lands here once and propagates
 * to both consumers automatically.
 * ─────────────────────────────────────────────────────────────
 */

import { findBestFuzzyNameMatch } from "@/lib/name-match";
import type { AIPick } from "@/lib/types";
import { parsePropLine } from "@/lib/goose-model/prop-parser";
import { detectPGANearMiss } from "@/lib/goose-model/pga-near-miss";
import { detectPGAMarketType } from "@/lib/goose-model/pga-features";
import type { PGANearMissResult } from "@/lib/goose-model/pga-near-miss";

const NHL_BASE = "https://api-web.nhle.com/v1";
const NBA_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const PGA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";

// ── normalizers ──────────────────────────────────────────────

export function normalizeTeam(value?: string) {
  return (value || "").trim().toUpperCase();
}

export function normalizeMLBTeam(value?: string) {
  const normalized = normalizeTeam(value);
  return normalized === "ATH" ? "OAK" : normalized;
}

export function normalizeGameId(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return undefined;
  return normalized;
}

function logResolverIssue(pick: AIPick, message: string, extra?: Record<string, unknown>) {
  console.warn("[pick-resolver]", {
    message,
    pickId: pick.id,
    league: pick.league ?? "NHL",
    date: pick.date,
    gameId: pick.gameId ?? null,
    ...extra,
  });
}

function parseNumericStat(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return Number(raw) || 0;
  const made = raw.match(/^(\d+)-/);
  if (made) return parseInt(made[1], 10) || 0;
  return parseInt(raw, 10) || 0;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBaseballInnings(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const [whole, fraction] = raw.split(".");
  const innings = toNumber(whole);
  const outs = toNumber(fraction);
  if (!fraction) return innings;
  return innings + Math.min(outs, 2) / 3;
}

// ── game-state helpers ───────────────────────────────────────

function isNHLGameComplete(boxscore: any): boolean {
  const state = String(boxscore?.gameState ?? "").toUpperCase();
  return state === "OFF" || state === "FINAL";
}

function getNBACompetition(summary: any) {
  return summary?.header?.competitions?.[0] ?? summary?.competitions?.[0] ?? null;
}

function isNBACompetitionComplete(summary: any): boolean {
  const competition = getNBACompetition(summary);
  const statusType = competition?.status?.type ?? summary?.status?.type ?? {};
  return statusType?.completed === true;
}

export function parseMLBLine(line?: number | null) {
  if (typeof line !== "number" || !Number.isFinite(line)) return undefined;
  return line;
}

// ── bet-type helpers ─────────────────────────────────────────

export function parseTeamSpreadLine(pick: AIPick) {
  const betType = String(pick.betType || "").toLowerCase();
  const label = String(pick.pickLabel || "");
  const isSpreadBet = (
    betType.includes("spread")
    || betType.includes("puck line")
    || (betType.includes("line") && !betType.includes("total"))
    || /\b[+-]\d+(?:\.\d+)?\b/.test(label)
  );

  if (!isSpreadBet) return undefined;
  if (typeof pick.line === "number" && Number.isFinite(pick.line)) return pick.line;

  const match = label.match(/([+-]\d+(?:\.\d+)?)/);
  if (!match) return undefined;

  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveByLine(actual: number, line: number, direction?: AIPick["direction"]): AIPick["result"] {
  if (direction === "Under") {
    if (actual < line) return "win";
    if (actual > line) return "loss";
    return "push";
  }

  if (actual > line) return "win";
  if (actual < line) return "loss";
  return "push";
}

export function resolveSpreadResult(teamScore: number, opponentScore: number, spreadLine: number): AIPick["result"] {
  const adjustedMargin = (teamScore - opponentScore) + spreadLine;
  if (adjustedMargin > 0) return "win";
  if (adjustedMargin < 0) return "loss";
  return "push";
}

// ── fetch helper ─────────────────────────────────────────────

export async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    // NHL API (and some others) return 403 to bare server-side requests without a User-Agent.
    // Always send a browser-style UA so upstream APIs don't block our Vercel environment.
    const res = await fetch(url, {
      next: { revalidate: 60 },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Goosalytics/1.0; +https://goosalytics.vercel.app)" },
    });
    if (!res.ok) {
      console.warn("[pick-resolver] upstream fetch failed", { url, status: res.status });
      return null;
    }
    return res.json();
  } catch (error) {
    console.warn("[pick-resolver] upstream fetch error", { url, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function fetchMLBScheduleGame(gameId: string, date: string) {
  const schedule = await fetchJSON<any>(`${MLB_BASE}/schedule?date=${date}&sportId=1&hydrate=linescore`);
  return (schedule?.dates ?? [])
    .flatMap((entry: any) => entry?.games ?? [])
    .find((game: any) => String(game?.gamePk ?? "") === gameId) || null;
}

function isMLBGameComplete(game: any) {
  const abstractState = String(game?.status?.abstractGameState ?? "").toUpperCase();
  const codedState = String(game?.status?.codedGameState ?? "").toUpperCase();
  return abstractState === "FINAL" || ["F", "O"].includes(codedState);
}

// ── sport-specific resolvers ─────────────────────────────────

export async function resolveNHLPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_nhl_game_id");
    return "pending";
  }

  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
  if (!boxscore) return "pending";
  if (!isNHLGameComplete(boxscore)) return "pending";

  const homeAbbrev = normalizeTeam(boxscore.homeTeam?.abbrev);
  const awayAbbrev = normalizeTeam(boxscore.awayTeam?.abbrev);
  const targetTeam = normalizeTeam(pick.team);
  const side = targetTeam === awayAbbrev
    ? "awayTeam"
    : targetTeam === homeAbbrev
      ? "homeTeam"
      : pick.isAway
        ? "awayTeam"
        : "homeTeam";

  const teamStats = boxscore.playerByGameStats?.[side] || {};
  const skaters = [...(teamStats.forwards || []), ...(teamStats.defense || [])];
  const player = findBestFuzzyNameMatch(skaters, pick.playerName || "", (entry: any) => entry.name?.default || "");
  if (!player) {
    logResolverIssue(pick, "nhl_player_not_found", { playerName: pick.playerName || "" });
    return "pending";
  }

  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;

  if (propKey.includes("shot") || propKey.includes("sog")) actual = player.shots ?? player.sog ?? null;
  else if (propKey.includes("assist")) actual = player.assists ?? null;
  else if (propKey === "goals" || propKey === "goal") actual = player.goals ?? null;
  else if (propKey.includes("point")) actual = (player.goals ?? 0) + (player.assists ?? 0);

  if (actual === null || pick.line === undefined) {
    logResolverIssue(pick, "nhl_stat_unavailable", { propType: pick.propType ?? "" });
    return "pending";
  }

  return resolveByLine(actual, pick.line, pick.direction);
}

export async function resolveNHLTeamPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_nhl_game_id");
    return "pending";
  }

  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
  if (!boxscore) return "pending";
  if (!isNHLGameComplete(boxscore)) return "pending";

  const homeAbbrev = normalizeTeam(boxscore.homeTeam?.abbrev);
  const awayAbbrev = normalizeTeam(boxscore.awayTeam?.abbrev);
  const targetTeam = normalizeTeam(pick.team);
  const isAway = targetTeam === awayAbbrev ? true : targetTeam === homeAbbrev ? false : pick.isAway;
  const homeScore = boxscore.homeTeam?.score ?? 0;
  const awayScore = boxscore.awayTeam?.score ?? 0;
  const teamScore = isAway ? awayScore : homeScore;
  const oppScore = isAway ? homeScore : awayScore;

  // NHL team/game total: accept both "Team Goals O/U" (stored) and "Team Points O/U" (inferred by normalizeIncomingPick)
  if (pick.betType === "Team Goals O/U" || pick.betType === "Team Points O/U") {
    const line = pick.line ?? (() => {
      // Try label first (e.g. "STL Over 2.5 Goals" → 2.5)
      const labelMatch = pick.pickLabel?.match(/(?:over|under)\s+([\d.]+)/i);
      if (labelMatch) return parseFloat(labelMatch[1]);
      const match = pick.reasoning?.match(/over\s+([\d.]+)/i);
      return match ? parseFloat(match[1]) : undefined;
    })();
    if (line === undefined) {
      logResolverIssue(pick, "nhl_team_total_missing_line");
      return "pending";
    }
    if (teamScore > line) return "win";
    if (teamScore < line) return "loss";
    return "push";
  }

  // 1P ML: resolve using play-by-play period 1 goal counts
  if (pick.betType === "1P ML") {
    const pbp = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${gameId}/play-by-play`);
    if (!pbp) return "pending";
    const plays: any[] = pbp.plays || [];
    const awayId = pbp.awayTeam?.id;
    const homeId = pbp.homeTeam?.id;
    const p1Goals = plays.filter(
      (p: any) => p.typeDescKey === "goal" && p.periodDescriptor?.number === 1
    );
    const awayP1 = p1Goals.filter((g: any) => g.details?.eventOwnerTeamId === awayId).length;
    const homeP1 = p1Goals.filter((g: any) => g.details?.eventOwnerTeamId === homeId).length;
    const teamP1 = isAway ? awayP1 : homeP1;
    const oppP1 = isAway ? homeP1 : awayP1;
    if (teamP1 > oppP1) return "win";
    if (teamP1 < oppP1) return "loss";
    return "push";
  }

  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak", "H2H ML"].includes(pick.betType || "")) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "push";
  }

  const spreadLine = parseTeamSpreadLine(pick);
  if (spreadLine !== undefined) {
    return resolveSpreadResult(teamScore, oppScore, spreadLine);
  }

  return "pending";
}

export async function resolveNBAPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_nba_game_id");
    return "pending";
  }

  const summary = await fetchJSON<any>(`${NBA_BASE}/summary?event=${gameId}`);
  if (!summary || !isNBACompetitionComplete(summary)) return "pending";

  const targetTeam = normalizeTeam(pick.team);
  const playerGroups = (summary.boxscore?.players ?? []).filter((group: any) => {
    const abbrev = normalizeTeam(group.team?.abbreviation);
    if (!targetTeam || !abbrev) return true;
    return abbrev === targetTeam;
  });

  const players = playerGroups.flatMap((group: any) =>
    (group.statistics ?? []).flatMap((statsGroup: any) => {
      const labels: string[] = statsGroup.labels ?? [];
      const athletes: any[] = statsGroup.athletes ?? [];
      return athletes.map((athlete: any) => ({
        name: athlete.athlete?.displayName ?? "",
        statsByLabel: Object.fromEntries(labels.map((label, index) => [label, parseNumericStat(athlete.stats?.[index])])),
      }));
    })
  );

  const player = findBestFuzzyNameMatch(players, pick.playerName || "", (entry: any) => entry.name || "");
  if (!player) {
    logResolverIssue(pick, "nba_player_not_found", { playerName: pick.playerName || "" });
    return "pending";
  }

  if (pick.line === undefined) {
    logResolverIssue(pick, "nba_player_line_missing", { propType: pick.propType ?? "" });
    return "pending";
  }

  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;
  if (propKey.includes("point")) actual = player.statsByLabel.PTS ?? null;
  else if (propKey.includes("rebound")) actual = player.statsByLabel.REB ?? null;
  else if (propKey.includes("assist")) actual = player.statsByLabel.AST ?? null;
  else if (propKey.includes("3-pointer") || propKey.includes("three")) actual = player.statsByLabel["3PT"] ?? player.statsByLabel["3PM"] ?? null;

  if (actual === null) {
    logResolverIssue(pick, "nba_stat_unavailable", { propType: pick.propType ?? "" });
    return "pending";
  }

  return resolveByLine(actual, pick.line, pick.direction);
}

export async function resolveNBATeamPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_nba_game_id");
    return "pending";
  }

  const summary = await fetchJSON<any>(`${NBA_BASE}/summary?event=${gameId}`);
  const competition = getNBACompetition(summary);
  if (!summary || !competition || !isNBACompetitionComplete(summary)) return "pending";

  const competitors = competition.competitors ?? [];
  const home = competitors.find((entry: any) => entry.homeAway === "home") ?? competitors[0];
  const away = competitors.find((entry: any) => entry.homeAway === "away") ?? competitors[1];
  const homeAbbrev = normalizeTeam(home?.team?.abbreviation);
  const awayAbbrev = normalizeTeam(away?.team?.abbreviation);
  const targetTeam = normalizeTeam(pick.team);
  const isAway = targetTeam === awayAbbrev ? true : targetTeam === homeAbbrev ? false : pick.isAway;
  const homeScore = parseInt(home?.score ?? "0", 10) || 0;
  const awayScore = parseInt(away?.score ?? "0", 10) || 0;
  const teamScore = isAway ? awayScore : homeScore;
  const oppScore = isAway ? homeScore : awayScore;

  if (pick.betType === "Team Points O/U") {
    if (pick.line === undefined) {
      logResolverIssue(pick, "nba_team_total_missing_line");
      return "pending";
    }
    if (teamScore > pick.line) return "win";
    if (teamScore < pick.line) return "loss";
    return "push";
  }

  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak", "H2H ML"].includes(pick.betType || "")) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "push";
  }

  const spreadLine = parseTeamSpreadLine(pick);
  if (spreadLine !== undefined) {
    return resolveSpreadResult(teamScore, oppScore, spreadLine);
  }

  return "pending";
}

export async function resolveMLBPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_mlb_game_id");
    return "pending";
  }

  const game = await fetchMLBScheduleGame(gameId, pick.date);
  if (!game || !isMLBGameComplete(game)) return "pending";

  const boxscore = await fetchJSON<any>(`${MLB_BASE}/game/${gameId}/boxscore`);
  if (!boxscore) return "pending";

  const homeAbbrev = normalizeMLBTeam(boxscore?.teams?.home?.team?.abbreviation || game?.teams?.home?.team?.abbreviation);
  const awayAbbrev = normalizeMLBTeam(boxscore?.teams?.away?.team?.abbreviation || game?.teams?.away?.team?.abbreviation);
  const targetTeam = normalizeMLBTeam(pick.team);
  const side = targetTeam === awayAbbrev
    ? "away"
    : targetTeam === homeAbbrev
      ? "home"
      : pick.isAway
        ? "away"
        : "home";

  const players = Object.values<any>(boxscore?.teams?.[side]?.players ?? {});
  const player = findBestFuzzyNameMatch(players, pick.playerName || "", (entry: any) => entry?.person?.fullName || "");
  if (!player) {
    logResolverIssue(pick, "mlb_player_not_found", { playerName: pick.playerName || "" });
    return "pending";
  }

  if (pick.line === undefined) {
    logResolverIssue(pick, "mlb_player_line_missing", { propType: pick.propType ?? "" });
    return "pending";
  }

  const batting = player?.stats?.batting ?? {};
  const pitching = player?.stats?.pitching ?? {};
  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;

  if (propKey === "hits") actual = batting.hits ?? null;
  else if (propKey.includes("total base")) actual = batting.totalBases ?? null;
  else if (propKey.includes("home run")) actual = batting.homeRuns ?? null;
  else if (propKey.includes("rbi")) actual = batting.rbi ?? batting.rbis ?? null;
  else if (propKey.includes("run")) actual = batting.runs ?? null;
  else if (propKey.includes("stolen")) actual = batting.stolenBases ?? null;
  else if (propKey.includes("strikeout")) actual = pitching.strikeOuts ?? null;
  else if (propKey.includes("earned")) actual = pitching.earnedRuns ?? null;
  else if (propKey.includes("innings")) actual = parseBaseballInnings(pitching.inningsPitched);
  else if (propKey.includes("allowed")) actual = pitching.hits ?? null;

  if (actual === null) {
    logResolverIssue(pick, "mlb_stat_unavailable", { propType: pick.propType ?? "" });
    return "pending";
  }

  return resolveByLine(actual, pick.line, pick.direction);
}

export async function resolveMLBTeamPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_mlb_game_id");
    return "pending";
  }

  const game = await fetchMLBScheduleGame(gameId, pick.date);
  if (!game || !isMLBGameComplete(game)) return "pending";

  // Fetch boxscore for accurate team abbreviations.
  // The schedule API endpoint (/schedule?date=…) does NOT include team.abbreviation —
  // only team.name and team.id. Without abbreviations we cannot determine isAway for
  // road picks (e.g. "NYY Win ML (Road)"). The boxscore endpoint always has abbreviation.
  const boxscore = await fetchJSON<any>(`${MLB_BASE}/game/${gameId}/boxscore`);
  const homeAbbrev = normalizeMLBTeam(
    boxscore?.teams?.home?.team?.abbreviation || game?.teams?.home?.team?.abbreviation
  );
  const awayAbbrev = normalizeMLBTeam(
    boxscore?.teams?.away?.team?.abbreviation || game?.teams?.away?.team?.abbreviation
  );
  const targetTeam = normalizeMLBTeam(pick.team);
  const isAway = targetTeam === awayAbbrev ? true : targetTeam === homeAbbrev ? false : pick.isAway;
  const homeScore = toNumber(game?.teams?.home?.score);
  const awayScore = toNumber(game?.teams?.away?.score);
  const teamScore = isAway ? awayScore : homeScore;
  const oppScore = isAway ? homeScore : awayScore;
  const margin = teamScore - oppScore;

  // Run Line — handles "Run Line" (from updated normalizeIncomingPick for "run line" labels),
  // "Spread" (from old inference path), and any remaining unlabeled pick with a +/- in the label.
  // In MLB the only spread-type bet is the run line, so all three are equivalent.
  const isRunLineBet = pick.betType === "Run Line"
    || pick.betType === "Spread"
    || String(pick.pickLabel || "").toLowerCase().includes("run line");
  if (isRunLineBet) {
    // parseTeamSpreadLine extracts the numeric line from the label when pick.line is unset
    const line = parseMLBLine(pick.line) ?? parseTeamSpreadLine(pick);
    if (line == null) {
      logResolverIssue(pick, "mlb_run_line_missing_line");
      return "pending";
    }
    const adjusted = margin + line;
    if (adjusted > 0) return "win";
    if (adjusted < 0) return "loss";
    return "push";
  }

  // Total Runs O/U — also handles "Team Points O/U", which is what normalizeIncomingPick
  // infers when the pick label contains "over" or "under" for a team bet.
  if (pick.betType === "Total Runs O/U" || pick.betType === "Team Points O/U") {
    let line = parseMLBLine(pick.line);
    if (line == null) {
      // Extract numeric line from label: e.g. "CHC Over 7" → 7, "MIA Under 11.5" → 11.5
      const labelMatch = pick.pickLabel.match(/(?:over|under)\s+(\d+(?:\.\d+)?)/i);
      if (labelMatch) line = parseFloat(labelMatch[1]);
    }
    if (line == null) {
      logResolverIssue(pick, "mlb_total_missing_line");
      return "pending";
    }
    const totalRuns = homeScore + awayScore;
    const side = pick.pickLabel.toLowerCase().includes("under") ? "Under" : "Over";
    if (side === "Under") {
      if (totalRuns < line) return "win";
      if (totalRuns > line) return "loss";
      return "push";
    }
    if (totalRuns > line) return "win";
    if (totalRuns < line) return "loss";
    return "push";
  }

  // Win ML — also handles "H2H ML", which is what normalizeIncomingPick infers
  // for any pick label containing "win ml" (e.g. "STL Win ML", "NYY Win ML (Road)").
  // NHL and NBA resolvers already include "H2H ML"; MLB was missing it.
  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak", "H2H ML"].includes(pick.betType || "")) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "push";
  }

  return "pending";
}

function parseGolfFinishThreshold(label: string) {
  const match = String(label || "").match(/top\s*(5|10|20)\s*finish/i);
  if (!match) return null;
  const threshold = Number(match[1]);
  return Number.isFinite(threshold) ? threshold : null;
}

function parseGolfPlacement(entry: any, competitors: any[]): number | null {
  const rank = String(entry?.curatedRank?.current ?? entry?.curatedRank?.displayValue ?? entry?.position ?? "").trim().toUpperCase();
  if (rank && rank !== "CUT" && rank !== "MC") {
    const parsed = Number(rank.replace(/^T/, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const score = String(entry?.score ?? "").trim().toUpperCase();
  if (score && score !== "CUT" && score !== "MC" && Array.isArray(competitors) && competitors.length > 0) {
    const uniqueBetterScores = new Set(
      competitors
        .map((candidate) => String(candidate?.score ?? "").trim().toUpperCase())
        .filter((candidateScore) => candidateScore && candidateScore !== score && candidateScore !== "CUT" && candidateScore !== "MC")
        .filter((candidateScore) => parseRelativeGolfScore(candidateScore) < parseRelativeGolfScore(score)),
    );
    return uniqueBetterScores.size + 1;
  }

  const order = Number(entry?.order);
  if (Number.isFinite(order) && order > 0) return order;
  return null;
}

function parseRelativeGolfScore(score: string): number {
  const normalized = String(score || "").trim().toUpperCase();
  if (!normalized || normalized === "E" || normalized === "EVEN") return 0;
  const parsed = Number(normalized.replace(/[^0-9+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Enriched PGA pick resolution result — includes finish position and near-miss metadata.
 * Official result (win/loss/pending) is unchanged; near_miss is learning metadata only.
 */
export interface PGAResolveResult {
  /** Official pick result — W/L/P/pending. Never inflated by near-miss. */
  result: AIPick["result"];
  /** Actual finish position (1-indexed). null if tournament not complete or player not found. */
  actual_place: number | null;
  /** Near-miss metadata. null if pick is pending, or market type doesn't support it. */
  near_miss: PGANearMissResult | null;
}

/**
 * Resolve a PGA pick with full near-miss metadata.
 * This is the preferred internal resolver — use this in grading flows.
 * The outer `resolvePGAPick` wrapper is kept for backward compat with the main pick pipeline.
 */
export async function resolvePGAPickWithMeta(pick: AIPick): Promise<PGAResolveResult> {
  if (!pick.playerName) {
    logResolverIssue(pick, "pga_pick_unparseable", { pickLabel: pick.pickLabel, playerName: pick.playerName ?? "" });
    return { result: "pending", actual_place: null, near_miss: null };
  }

  const scoreboard = await fetchJSON<any>(PGA_SCOREBOARD);
  const event = Array.isArray(scoreboard?.events) ? scoreboard.events.find((candidate: any) => {
    const startDate = String(candidate?.date ?? "").slice(0, 10);
    return startDate === pick.date;
  }) ?? scoreboard?.events?.[0] : null;
  const competition = event?.competitions?.[0];
  const statusType = competition?.status?.type ?? event?.status?.type ?? {};
  if (!event || statusType?.completed !== true) {
    return { result: "pending", actual_place: null, near_miss: null };
  }

  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const player = findBestFuzzyNameMatch(competitors, pick.playerName, (entry: any) => entry?.athlete?.displayName || "");
  if (!player) {
    logResolverIssue(pick, "pga_player_not_found", { playerName: pick.playerName });
    return { result: "pending", actual_place: null, near_miss: null };
  }

  const place = parseGolfPlacement(player, competitors);
  const lowerLabel = String(pick.pickLabel || "").toLowerCase();
  const lowerBetType = String(pick.betType || "").toLowerCase();
  const threshold = parseGolfFinishThreshold(pick.pickLabel);

  if (lowerLabel.includes("to win") || lowerBetType.includes("tournament winner") || lowerBetType.includes("outright")) {
    const result: AIPick["result"] = place === 1 ? "win" : "loss";
    return { result, actual_place: place, near_miss: null };
  }

  if (lowerLabel.includes(" over ") || lowerBetType.includes("tournament matchup")) {
    const opponentName = pick.opponent || "";
    const opponent = opponentName
      ? findBestFuzzyNameMatch(competitors, opponentName, (entry: any) => entry?.athlete?.displayName || "")
      : null;

    if (!opponent) {
      logResolverIssue(pick, "pga_matchup_opponent_not_found", { pickLabel: pick.pickLabel, opponent: opponentName });
      return { result: "pending", actual_place: place, near_miss: null };
    }

    const opponentPlace = parseGolfPlacement(opponent, competitors);
    if (!place || !opponentPlace) {
      return { result: "pending", actual_place: place, near_miss: null };
    }

    const result: AIPick["result"] = place < opponentPlace ? "win" : place > opponentPlace ? "loss" : "push";
    return { result, actual_place: place, near_miss: null };
  }

  if (!threshold) {
    logResolverIssue(pick, "pga_pick_unparseable", { pickLabel: pick.pickLabel, playerName: pick.playerName ?? "" });
    return { result: "pending", actual_place: place, near_miss: null };
  }

  const result: AIPick["result"] = !place ? "loss" : place <= threshold ? "win" : "loss";

  const marketType = detectPGAMarketType(pick.pickLabel);
  const nearMiss = result === "loss"
    ? detectPGANearMiss(marketType, place)
    : null;

  return { result, actual_place: place, near_miss: nearMiss };
}

/** Backward-compatible wrapper for the main pick pipeline (no near-miss metadata). */
export async function resolvePGAPick(pick: AIPick): Promise<AIPick["result"]> {
  const { result } = await resolvePGAPickWithMeta(pick);
  return result;
}

// ── incoming pick normalizer ─────────────────────────────────

export function normalizeIncomingPick(raw: AIPick): AIPick {
  const anyRaw = raw as AIPick & {
    pick_type?: string;
    player_name?: string | null;
    pick_label?: string;
    game_id?: string | null;
    team_color?: string;
  };

  const pickLabel = raw.pickLabel || anyRaw.pick_label || "";
  const playerName = raw.playerName || anyRaw.player_name || undefined;
  const gameId = raw.gameId || anyRaw.game_id || undefined;
  const type = raw.type || (anyRaw.pick_type === "team" ? "team" : "player");

  const parsedPlayer = type === "player"
    ? (() => {
      // Primary: match the standard "Over/Under <line> <propType>" format
      const match = pickLabel.match(/\b(Over|Under)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/i);
      if (match) {
        return {
          direction: match[1].toLowerCase() === "under" ? "Under" as const : "Over" as const,
          line: Number(match[2]),
          propType: match[3].trim() || undefined,
        };
      }
      // Fallback: use the richer prop-parser for non-standard label formats
      // (e.g. "25.5+ Points", "O 25.5 Reb", combo props like "Pts+Reb Over 42.5")
      const parsed = parsePropLine(pickLabel);
      if (parsed.line !== null) {
        return {
          direction: parsed.direction === "under" ? "Under" as const : parsed.direction === "over" ? "Over" as const : undefined,
          line: parsed.line,
          propType: parsed.propType ?? undefined,
        };
      }
      return null;
    })()
    : null;

  const inferredBetType = raw.betType || (() => {
    const lower = pickLabel.toLowerCase();
    // 1P ML must be detected before the generic "win ml" check since it doesn't contain "win ml"
    if (/\b1p\s*ml\b/.test(lower) || lower.includes("first period ml") || lower.includes("1st period ml")) return "1P ML";
    if (lower.includes("win ml") || /\bh2h\b/.test(lower)) return "H2H ML";
    // "run line" labels (e.g. "STL -1.5 Run Line") — detected by text before regex
    // Note: /\b[+-]\d+/ does NOT match " -1.5" because '\b' requires a word boundary
    // that doesn't exist before '-'. Text detection is more reliable here.
    if (lower.includes("run line")) return "Run Line";
    if (lower.includes("spread") || /(?:^|\s)[+-]\d+(?:\.\d+)?(?:\s|$)/.test(pickLabel)) return "Spread";
    if (lower.includes("over") || lower.includes("under")) return type === "team" ? "Team Points O/U" : undefined;
    return undefined;
  })();

  return {
    ...raw,
    type,
    playerName,
    pickLabel,
    gameId,
    teamColor: raw.teamColor || anyRaw.team_color || "#4a9eff",
    direction: raw.direction ?? parsedPlayer?.direction,
    line: typeof raw.line === "number" && Number.isFinite(raw.line) ? raw.line : parsedPlayer?.line,
    propType: raw.propType ?? parsedPlayer?.propType,
    betType: inferredBetType,
    isAway: typeof raw.isAway === "boolean" ? raw.isAway : pickLabel.includes("@"),
  };
}

// ── main resolve function ────────────────────────────────────

export async function resolvePick(rawPick: AIPick): Promise<AIPick> {
  const pick = normalizeIncomingPick(rawPick);
  if (pick.result !== "pending") return pick;

  try {
    const result = pick.league === "NBA"
      ? pick.type === "player"
        ? await resolveNBAPlayerPick(pick)
        : await resolveNBATeamPick(pick)
      : pick.league === "MLB"
        ? pick.type === "player"
          ? await resolveMLBPlayerPick(pick)
          : await resolveMLBTeamPick(pick)
        : pick.league === "PGA"
          ? await resolvePGAPick(pick)
          : pick.type === "player"
            ? await resolveNHLPlayerPick(pick)
            : await resolveNHLTeamPick(pick);

    return { ...pick, result };
  } catch (error) {
    console.warn("[pick-resolver] resolver_exception", {
      pickId: pick.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return pick;
  }
}
