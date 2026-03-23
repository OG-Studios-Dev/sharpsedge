/**
 * POST /api/picks/resolve
 * Takes an array of pending AIPick objects.
 * For each one, checks the correct league API for completed game results.
 * Returns the picks with result updated to "win", "loss", or "push" where resolvable.
 */

import { NextRequest, NextResponse } from "next/server";
import { findBestFuzzyNameMatch } from "@/lib/name-match";
import { updatePickResultsInSupabase } from "@/lib/pick-history-store";
import { AIPick } from "@/lib/types";

const NHL_BASE = "https://api-web.nhle.com/v1";
const NBA_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const PGA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
function normalizeTeam(value?: string) {
  return (value || "").trim().toUpperCase();
}

function normalizeMLBTeam(value?: string) {
  const normalized = normalizeTeam(value);
  return normalized === "ATH" ? "OAK" : normalized;
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

function parseMLBLine(line?: number | null) {
  if (typeof line !== "number" || !Number.isFinite(line)) return undefined;
  return line;
}

function parseTeamSpreadLine(pick: AIPick) {
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

function resolveByLine(actual: number, line: number, direction?: AIPick["direction"]): AIPick["result"] {
  if (direction === "Under") {
    if (actual < line) return "win";
    if (actual > line) return "loss";
    return "push";
  }

  if (actual > line) return "win";
  if (actual < line) return "loss";
  return "push";
}

function resolveSpreadResult(teamScore: number, opponentScore: number, spreadLine: number): AIPick["result"] {
  const adjustedMargin = (teamScore - opponentScore) + spreadLine;
  if (adjustedMargin > 0) return "win";
  if (adjustedMargin < 0) return "loss";
  return "push";
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

  const spreadLine = parseTeamSpreadLine(pick);
  if (spreadLine !== undefined) {
    return resolveSpreadResult(teamScore, oppScore, spreadLine);
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

  const spreadLine = parseTeamSpreadLine(pick);
  if (spreadLine !== undefined) {
    return resolveSpreadResult(teamScore, oppScore, spreadLine);
  }

  return "pending";
}

async function resolveMLBPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
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

async function resolveMLBTeamPick(pick: AIPick): Promise<AIPick["result"]> {
  const gameId = normalizeGameId(pick.gameId);
  if (!gameId) {
    logResolverIssue(pick, "missing_mlb_game_id");
    return "pending";
  }

  const game = await fetchMLBScheduleGame(gameId, pick.date);
  if (!game || !isMLBGameComplete(game)) return "pending";

  const homeAbbrev = normalizeMLBTeam(game?.teams?.home?.team?.abbreviation);
  const awayAbbrev = normalizeMLBTeam(game?.teams?.away?.team?.abbreviation);
  const targetTeam = normalizeMLBTeam(pick.team);
  const isAway = targetTeam === awayAbbrev ? true : targetTeam === homeAbbrev ? false : pick.isAway;
  const homeScore = toNumber(game?.teams?.home?.score);
  const awayScore = toNumber(game?.teams?.away?.score);
  const teamScore = isAway ? awayScore : homeScore;
  const oppScore = isAway ? homeScore : awayScore;
  const margin = teamScore - oppScore;

  if (pick.betType === "Run Line") {
    const line = parseMLBLine(pick.line);
    if (line === undefined) {
      logResolverIssue(pick, "mlb_run_line_missing_line");
      return "pending";
    }
    const adjusted = margin + line;
    if (adjusted > 0) return "win";
    if (adjusted < 0) return "loss";
    return "push";
  }

  if (pick.betType === "Total Runs O/U") {
    const line = parseMLBLine(pick.line);
    if (line === undefined) {
      logResolverIssue(pick, "mlb_total_missing_line");
      return "pending";
    }
    const totalRuns = homeScore + awayScore;
    const side = pick.pickLabel.includes("Under") ? "Under" : "Over";
    if (side === "Under") {
      if (totalRuns < line) return "win";
      if (totalRuns > line) return "loss";
      return "push";
    }
    if (totalRuns > line) return "win";
    if (totalRuns < line) return "loss";
    return "push";
  }

  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak"].includes(pick.betType || "")) {
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

async function resolvePGAPick(pick: AIPick): Promise<AIPick["result"]> {
  const threshold = parseGolfFinishThreshold(pick.pickLabel);
  if (!threshold || !pick.playerName) {
    logResolverIssue(pick, "pga_pick_unparseable", { pickLabel: pick.pickLabel, playerName: pick.playerName ?? "" });
    return "pending";
  }

  const scoreboard = await fetchJSON<any>(PGA_SCOREBOARD);
  const event = Array.isArray(scoreboard?.events) ? scoreboard.events.find((candidate: any) => {
    const startDate = String(candidate?.date ?? "").slice(0, 10);
    return startDate === pick.date;
  }) ?? scoreboard?.events?.[0] : null;
  const competition = event?.competitions?.[0];
  const statusType = competition?.status?.type ?? event?.status?.type ?? {};
  if (!event || statusType?.completed !== true) return "pending";

  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const player = findBestFuzzyNameMatch(competitors, pick.playerName, (entry: any) => entry?.athlete?.displayName || "");
  if (!player) {
    logResolverIssue(pick, "pga_player_not_found", { playerName: pick.playerName });
    return "pending";
  }

  const place = parseGolfPlacement(player, competitors);
  if (!place) return "loss";
  return place <= threshold ? "win" : "loss";
}

function normalizeIncomingPick(raw: AIPick): AIPick {
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
      const match = pickLabel.match(/\b(Over|Under)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/i);
      if (!match) return null;
      return {
        direction: match[1].toLowerCase() === "under" ? "Under" as const : "Over" as const,
        line: Number(match[2]),
        propType: match[3].trim() || undefined,
      };
    })()
    : null;

  const inferredBetType = raw.betType || (() => {
    const lower = pickLabel.toLowerCase();
    if (lower.includes('win ml') || /\bh2h\b/.test(lower)) return 'H2H ML';
    if (lower.includes('spread') || /\b[+-]\d+(?:\.\d+)?\b/.test(pickLabel)) return 'Spread';
    if (lower.includes('over') || lower.includes('under')) return type === 'team' ? 'Team Points O/U' : undefined;
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

async function resolvePick(rawPick: AIPick): Promise<AIPick> {
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
    logResolverIssue(pick, "resolver_exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    return pick;
  }
}

async function persistResolvedPickResults(previous: AIPick[], resolved: AIPick[]) {
  const updates = resolved.filter((pick, index) => {
    const before = previous[index];
    return Boolean(
      before
      && pick.id === before.id
      && before.result === "pending"
      && pick.result !== "pending",
    );
  });

  if (!updates.length) return;

  try {
    await updatePickResultsInSupabase(updates);
  } catch (error) {
    console.warn("[picks-resolve] failed to persist resolved results", {
      error: error instanceof Error ? error.message : String(error),
    });
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
    await persistResolvedPickResults(picks, resolved);
    return NextResponse.json({ picks: resolved });
  } catch (error) {
    console.warn("[picks-resolve] request failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ picks });
  }
}
