/**
 * POST /api/picks/resolve
 * Takes an array of pending AIPick objects.
 * For each one, checks NHL API for completed game results.
 * Returns the picks with result updated to "win", "loss", or "push" where resolvable.
 * Picks for games not yet complete stay "pending".
 */

import { NextRequest, NextResponse } from "next/server";
import { AIPick } from "@/lib/types";

const NHL_BASE = "https://api-web.nhle.com/v1";

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Resolve a player prop pick from boxscore
async function resolvePlayerPick(pick: AIPick): Promise<AIPick["result"]> {
  if (!pick.gameId) return "pending";

  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${pick.gameId}/boxscore`);
  if (!boxscore) return "pending";

  // Game must be finished
  if (boxscore.gameState !== "OFF" && boxscore.gameState !== "FINAL") return "pending";

  // Find player in boxscore
  const allSkaters = [
    ...(boxscore.playerByGameStats?.homeTeam?.forwards || []),
    ...(boxscore.playerByGameStats?.homeTeam?.defense || []),
    ...(boxscore.playerByGameStats?.awayTeam?.forwards || []),
    ...(boxscore.playerByGameStats?.awayTeam?.defense || []),
  ];

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const targetName = normalize(pick.playerName || "");

  const player = allSkaters.find((p: any) => {
    const name = normalize(`${p.name?.default || ""}`);
    return name === targetName || name.includes(targetName.split(" ").pop() || "");
  });

  if (!player) return "pending";

  const propKey = (pick.propType || "").toLowerCase();
  let actual: number | null = null;

  if (propKey.includes("shot")) actual = player.shots ?? null;
  else if (propKey.includes("assist")) actual = player.assists ?? null;
  else if (propKey === "goals" || propKey === "goal") actual = player.goals ?? null;
  else if (propKey.includes("point")) actual = (player.goals ?? 0) + (player.assists ?? 0);

  if (actual === null || pick.line === undefined) return "pending";

  if (pick.direction === "Over") {
    if (actual > pick.line) return "win";
    if (actual < pick.line) return "loss";
    return "push";
  } else {
    if (actual < pick.line) return "win";
    if (actual > pick.line) return "loss";
    return "push";
  }
}

// Resolve a team goals O/U pick from final score
async function resolveTeamPick(pick: AIPick): Promise<AIPick["result"]> {
  if (!pick.gameId) return "pending";

  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${pick.gameId}/boxscore`);
  if (!boxscore) return "pending";

  if (boxscore.gameState !== "OFF" && boxscore.gameState !== "FINAL") return "pending";

  const homeScore = boxscore.homeTeam?.score ?? 0;
  const awayScore = boxscore.awayTeam?.score ?? 0;

  if (pick.betType === "Team Goals O/U") {
    // Total goals for the team
    const teamScore = (pick.isAway ? awayScore : homeScore);
    // Extract line from reasoning or use a default
    const lineMatch = pick.reasoning?.match(/over\s+([\d.]+)/i);
    const line = lineMatch ? parseFloat(lineMatch[1]) : 2.5;

    if (teamScore > line) return "win";
    if (teamScore < line) return "loss";
    return "push";
  }

  if (pick.betType === "Team Win ML" || pick.betType === "ML Home Win" || pick.betType === "ML Road Win" || pick.betType === "ML Streak") {
    const teamScore = pick.isAway ? awayScore : homeScore;
    const oppScore = pick.isAway ? homeScore : awayScore;
    if (teamScore > oppScore) return "win";
    if (teamScore < oppScore) return "loss";
    return "push";
  }

  return "pending";
}

export async function POST(req: NextRequest) {
  try {
    const { picks } = await req.json() as { picks: AIPick[] };
    if (!Array.isArray(picks)) return NextResponse.json({ picks: [] });

    const pendingPicks = picks.filter((p) => p.result === "pending");
    if (!pendingPicks.length) return NextResponse.json({ picks });

    const resolved = await Promise.all(
      picks.map(async (pick) => {
        if (pick.result !== "pending") return pick;

        const result = pick.type === "player"
          ? await resolvePlayerPick(pick)
          : await resolveTeamPick(pick);

        return { ...pick, result };
      })
    );

    return NextResponse.json({ picks: resolved });
  } catch {
    return NextResponse.json({ picks: [] });
  }
}
