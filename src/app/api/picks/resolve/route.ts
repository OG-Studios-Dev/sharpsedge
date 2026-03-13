/**
 * POST /api/picks/resolve
 * Takes an array of pending AIPick objects.
 * For each one, checks the correct league API for completed game results.
 * Returns the picks with result updated to "win", "loss", or "push" where resolvable.
 */

import { NextRequest, NextResponse } from "next/server";
import { AIPick } from "@/lib/types";

const NHL_BASE = "https://api-web.nhle.com/v1";
const NBA_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeTeam(value?: string) {
  return (value || "").trim().toUpperCase();
}

function findPlayerByName<T>(players: T[], targetName: string, getName: (player: T) => string): T | undefined {
  const normalizedTarget = normalizeName(targetName);
  if (!normalizedTarget) return undefined;

  const exact = players.find((player) => normalizeName(getName(player)) === normalizedTarget);
  if (exact) return exact;

  const lastName = normalizedTarget.split(" ").pop();
  if (!lastName) return undefined;

  const partialMatches = players.filter((player) => normalizeName(getName(player)).includes(lastName));
  return partialMatches.length === 1 ? partialMatches[0] : undefined;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function resolveNHLPlayerPick(pick: AIPick): Promise<AIPick["result"]> {
  if (!pick.gameId) return "pending";

  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${pick.gameId}/boxscore`);
  if (!boxscore) return "pending";
  if (!["OFF", "FINAL"].includes(boxscore.gameState)) return "pending";

  const homeAbbrev = normalizeTeam(boxscore.homeTeam?.abbrev);
  const awayAbbrev = normalizeTeam(boxscore.awayTeam?.abbrev);
  const targetTeam = normalizeTeam(pick.team);
  const side = targetTeam && targetTeam === awayAbbrev ? "awayTeam" : targetTeam && targetTeam === homeAbbrev ? "homeTeam" : pick.isAway ? "awayTeam" : "homeTeam";
  const teamStats = boxscore.playerByGameStats?.[side] || {};
  const skaters = [
    ...(teamStats.forwards || []),
    ...(teamStats.defense || []),
  ];

  const player = findPlayerByName(skaters, pick.playerName || "", (entry: any) => entry.name?.default || "");
  if (!player) return "pending";

  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;

  if (propKey.includes("shot")) actual = player.shots ?? null;
  else if (propKey.includes("assist")) actual = player.assists ?? null;
  else if (propKey === "goals" || propKey === "goal") actual = player.goals ?? null;
  else if (propKey.includes("point")) actual = (player.goals ?? 0) + (player.assists ?? 0);

  if (actual === null || pick.line === undefined) return "pending";
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
  if (!pick.gameId) return "pending";

  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${pick.gameId}/boxscore`);
  if (!boxscore) return "pending";
  if (!["OFF", "FINAL"].includes(boxscore.gameState)) return "pending";

  const homeScore = boxscore.homeTeam?.score ?? 0;
  const awayScore = boxscore.awayTeam?.score ?? 0;
  const teamScore = pick.isAway ? awayScore : homeScore;
  const oppScore = pick.isAway ? homeScore : awayScore;

  if (pick.betType === "Team Goals O/U") {
    const line = pick.line ?? (() => {
      const match = pick.reasoning?.match(/over\s+([\d.]+)/i);
      return match ? parseFloat(match[1]) : undefined;
    })();
    if (line === undefined) return "pending";
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
  if (!pick.gameId) return "pending";

  const summary = await fetchJSON<any>(`${NBA_BASE}/summary?event=${pick.gameId}`);
  const completed = summary?.header?.competitions?.[0]?.status?.type?.completed;
  if (!summary || !completed) return "pending";

  const targetTeam = normalizeTeam(pick.team);
  const playerGroups = (summary.boxscore?.players ?? []).filter((group: any) => {
    const abbrev = normalizeTeam(group.team?.abbreviation);
    if (!targetTeam) return true;
    return abbrev ? abbrev === targetTeam : true;
  });
  const players = playerGroups.flatMap((group: any) => {
    const statsGroup = group.statistics?.[0] ?? {};
    const labels: string[] = statsGroup.labels ?? [];
    const athletes: any[] = statsGroup.athletes ?? [];
    return athletes.map((athlete: any) => ({
      name: athlete.athlete?.displayName ?? "",
      stats: athlete.stats ?? [],
      labels,
    }));
  });

  const player = findPlayerByName(players, pick.playerName || "", (entry: any) => entry.name || "");
  if (!player || pick.line === undefined) return "pending";

  const getStat = (label: string) => {
    const index = player.labels.indexOf(label);
    if (index < 0) return null;
    const raw = player.stats[index];
    if (typeof raw !== "string") return Number(raw) || 0;
    const made = raw.match(/^(\d+)-/);
    return made ? parseInt(made[1], 10) : parseInt(raw, 10) || 0;
  };

  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;
  if (propKey.includes("point")) actual = getStat("PTS");
  else if (propKey.includes("rebound")) actual = getStat("REB");
  else if (propKey.includes("assist")) actual = getStat("AST");
  else if (propKey.includes("3-pointer") || propKey.includes("three")) actual = getStat("3PT");

  if (actual === null) return "pending";
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
  if (!pick.gameId) return "pending";

  const summary = await fetchJSON<any>(`${NBA_BASE}/summary?event=${pick.gameId}`);
  const competition = summary?.header?.competitions?.[0];
  const completed = competition?.status?.type?.completed;
  if (!summary || !completed) return "pending";

  const competitors = competition?.competitors ?? [];
  const home = competitors.find((entry: any) => entry.homeAway === "home") ?? competitors[0];
  const away = competitors.find((entry: any) => entry.homeAway === "away") ?? competitors[1];
  const homeScore = parseInt(home?.score ?? "0", 10) || 0;
  const awayScore = parseInt(away?.score ?? "0", 10) || 0;
  const teamScore = pick.isAway ? awayScore : homeScore;
  const oppScore = pick.isAway ? homeScore : awayScore;

  if (pick.betType === "Team Points O/U") {
    if (pick.line === undefined) return "pending";
    if (teamScore > pick.line) return "win";
    if (teamScore < pick.line) return "loss";
    return "push";
  }

  if (["Team Win ML", "ML Home Win", "ML Road Win", "ML Streak"].includes(pick.betType || "")) {
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "push";
  }

  return "pending";
}

async function resolvePick(pick: AIPick): Promise<AIPick> {
  if (pick.result !== "pending") return pick;

  const isNBA = pick.league === "NBA";
  const result = isNBA
    ? pick.type === "player"
      ? await resolveNBAPlayerPick(pick)
      : await resolveNBATeamPick(pick)
    : pick.type === "player"
      ? await resolveNHLPlayerPick(pick)
      : await resolveNHLTeamPick(pick);

  return { ...pick, result };
}

export async function POST(req: NextRequest) {
  try {
    const { picks } = await req.json() as { picks: AIPick[] };
    if (!Array.isArray(picks)) return NextResponse.json({ picks: [] });
    if (!picks.some((pick) => pick.result === "pending")) return NextResponse.json({ picks });

    const resolved = await Promise.all(picks.map(resolvePick));
    return NextResponse.json({ picks: resolved });
  } catch {
    return NextResponse.json({ picks: [] });
  }
}
