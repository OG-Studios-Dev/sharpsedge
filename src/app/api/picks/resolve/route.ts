/**
 * POST /api/picks/resolve
 * Takes an array of pending AIPick objects.
 * For each one, checks the correct league API for completed game results.
 * Returns the picks with result updated to "win", "loss", or "push" where resolvable.
 */

import { NextRequest, NextResponse } from "next/server";
import { updatePickHistoryResults } from "@/lib/pick-history";
import { AIPick } from "@/lib/types";

const NHL_BASE = "https://api-web.nhle.com/v1";
const NBA_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const NHL_PENDING_STATES = new Set(["PRE", "FUT", "LIVE", "CRIT"]);
const NHL_FINAL_STATES = new Set(["OFF", "FINAL", "OVER"]);

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeTeam(value?: string) {
  return (value || "").trim().toUpperCase();
}

function normalizeGameId(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return undefined;
  return normalized;
}

function logResolverIssue(pick: AIPick, message: string, extra?: Record<string, unknown>) {
  console.warn("[picks-resolve]", {
    message,
    pickId: pick.id,
    league: pick.league ?? "NHL",
    date: pick.date,
    gameId: pick.gameId ?? null,
    ...extra,
  });
}

function findPlayerByName<T>(players: T[], targetName: string, getName: (player: T) => string): T | undefined {
  const normalizedTarget = normalizeName(targetName);
  if (!normalizedTarget) return undefined;

  const exact = players.find((player) => normalizeName(getName(player)) === normalizedTarget);
  if (exact) return exact;

  const targetParts = normalizedTarget.split(" ");
  const targetLast = targetParts[targetParts.length - 1];
  const targetFirst = targetParts[0];
  if (!targetLast) return undefined;

  const partialMatches = players.filter((player) => {
    const normalizedPlayer = normalizeName(getName(player));
    if (!normalizedPlayer) return false;
    if (normalizedPlayer.includes(normalizedTarget)) return true;

    const playerParts = normalizedPlayer.split(" ");
    const playerFirst = playerParts[0];
    const playerLast = playerParts[playerParts.length - 1];
    return playerLast === targetLast && (!!targetFirst && (playerFirst === targetFirst || playerFirst.startsWith(targetFirst) || targetFirst.startsWith(playerFirst)));
  });

  return partialMatches.length === 1 ? partialMatches[0] : undefined;
}

function parseNumericStat(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return Number(raw) || 0;
  const made = raw.match(/^(\d+)-/);
  if (made) return parseInt(made[1], 10) || 0;
  return parseInt(raw, 10) || 0;
}

function isNHLGameComplete(boxscore: any): boolean {
  const state = String(boxscore?.gameState ?? "").toUpperCase();
  if (NHL_PENDING_STATES.has(state)) return false;
  if (NHL_FINAL_STATES.has(state)) return true;

  const homeScore = boxscore?.homeTeam?.score;
  const awayScore = boxscore?.awayTeam?.score;
  const periodType = String(boxscore?.periodDescriptor?.periodType ?? "").toUpperCase();
  const clockRunning = Boolean(boxscore?.clock?.running);

  return typeof homeScore === "number"
    && typeof awayScore === "number"
    && !clockRunning
    && ["REG", "OT", "SO"].includes(periodType);
}

function getNBACompetition(summary: any) {
  return summary?.header?.competitions?.[0] ?? summary?.competitions?.[0] ?? null;
}

function isNBACompetitionComplete(summary: any): boolean {
  const competition = getNBACompetition(summary);
  const statusType = competition?.status?.type ?? summary?.status?.type ?? {};
  const name = String(statusType?.name ?? statusType?.description ?? "").toUpperCase();
  const detail = String(statusType?.detail ?? statusType?.shortDetail ?? "").toUpperCase();
  const state = String(statusType?.state ?? "").toLowerCase();
  return Boolean(statusType?.completed || state === "post" || name.includes("FINAL") || detail.includes("FINAL"));
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      console.warn("[picks-resolve] upstream fetch failed", { url, status: res.status });
      return null;
    }
    return res.json();
  } catch (error) {
    console.warn("[picks-resolve] upstream fetch error", { url, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function resolveNHLPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
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
  const player = findPlayerByName(skaters, pick.playerName || "", (entry: any) => entry.name?.default || "");
  if (!player) {
    logResolverIssue(pick, "nhl_player_not_found", { playerName: pick.playerName || "" });
    return "pending";
  }

  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;

  if (propKey.includes("shot")) actual = player.shots ?? null;
  else if (propKey.includes("assist")) actual = player.assists ?? null;
  else if (propKey === "goals" || propKey === "goal") actual = player.goals ?? null;
  else if (propKey.includes("point")) actual = (player.goals ?? 0) + (player.assists ?? 0);

  if (actual === null || pick.line === undefined) {
    logResolverIssue(pick, "nhl_stat_unavailable", { propType: pick.propType ?? "" });
    return "pending";
  }

  if (pick.direction === "Under") {
    if (actual < pick.line) return "win";
    if (actual > pick.line) return "loss";
    return "push";
  }
  if (actual > pick.line) return "win";
  if (actual < pick.line) return "loss";
  return "push";
}

async function resolveNHLTeamPick(pick: AIPick): Promise<AIPick["result"]> {
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

  if (pick.betType === "Team Goals O/U") {
    const line = pick.line ?? (() => {
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

  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak", "H2H ML"].includes(pick.betType || "")) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "push";
  }

  return "pending";
}

async function resolveNBAPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
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

  const player = findPlayerByName(players, pick.playerName || "", (entry: any) => entry.name || "");
  if (!player || pick.line === undefined) {
    logResolverIssue(pick, "nba_player_not_found", { playerName: pick.playerName || "" });
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

  if (pick.direction === "Under") {
    if (actual < pick.line) return "win";
    if (actual > pick.line) return "loss";
    return "push";
  }
  if (actual > pick.line) return "win";
  if (actual < pick.line) return "loss";
  return "push";
}

async function resolveNBATeamPick(pick: AIPick): Promise<AIPick["result"]> {
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

  return "pending";
}

async function resolvePick(pick: AIPick): Promise<AIPick> {
  if (pick.result !== "pending") return pick;

  try {
    const isNBA = pick.league === "NBA";
    const result = isNBA
      ? pick.type === "player"
        ? await resolveNBAPlayerPick(pick)
        : await resolveNBATeamPick(pick)
      : pick.type === "player"
        ? await resolveNHLPlayerPick(pick)
        : await resolveNHLTeamPick(pick);

    return { ...pick, result };
  } catch (error) {
    logResolverIssue(pick, "resolver_exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    return pick;
  }
}

export async function POST(req: NextRequest) {
  let picks: AIPick[] = [];

  try {
    const body = await req.json() as { picks?: AIPick[] };
    picks = Array.isArray(body?.picks) ? body.picks : [];
    if (!picks.length) return NextResponse.json({ picks: [] });
    if (!picks.some((pick) => pick.result === "pending")) return NextResponse.json({ picks });

    const resolved = await Promise.all(picks.map(resolvePick));

    try {
      await updatePickHistoryResults(resolved);
    } catch (historyError) {
      console.warn("[picks-resolve] unable to update admin pick history", {
        error: historyError instanceof Error ? historyError.message : String(historyError),
      });
    }

    return NextResponse.json({ picks: resolved });
  } catch (error) {
    console.warn("[picks-resolve] request failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ picks });
  }
}
