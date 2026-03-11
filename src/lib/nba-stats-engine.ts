/**
 * NBA Stats Engine
 * Builds ranked player props from BallDontLie API data.
 *
 * Pipeline:
 *  1. Take today/tomorrow scheduled games
 *  2. Fetch roster for each team
 *  3. For top players (guards/forwards first), fetch game logs
 *  4. Compute rolling averages + hit rates for Points, Rebounds, Assists, 3PM
 *  5. Generate model prop lines + edge scores
 *  6. Return ranked list, highest-edge first
 */

import { PlayerProp } from "@/lib/types";
import { NBAGame, NBAPlayerGameLog, getNBATeamRoster, getNBAPlayerGameLog, NBA_TEAM_COLORS } from "@/lib/nba-api";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

type StatKey = "points" | "rebounds" | "assists" | "threePointersMade";

const NBA_PROP_DEFS: { key: StatKey; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "rebounds", label: "Rebounds" },
  { key: "assists", label: "Assists" },
  { key: "threePointersMade", label: "3-Pointers Made" },
];

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210; // ≈ 0.524

function parseMinutes(min: string): number {
  if (!min) return 0;
  // BallDontLie returns minutes as "MM:SS" or just a number string
  if (min.includes(":")) {
    const [m, s] = min.split(":").map(Number);
    return (m || 0) + (s || 0) / 60;
  }
  return parseFloat(min) || 0;
}

function rollingAvg(logs: NBAPlayerGameLog[], key: StatKey, n: number): number | null {
  const slice = logs.slice(0, n);
  if (slice.length < 3) return null;
  return slice.reduce((s, g) => s + g[key], 0) / slice.length;
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function avgMinutes(logs: NBAPlayerGameLog[], n: number): number {
  const slice = logs.slice(0, n);
  if (!slice.length) return 0;
  return slice.reduce((s, g) => s + parseMinutes(g.minutesPlayed), 0) / slice.length;
}

// ──────────────────────────────────────────────────────────────────────
// Build props for a single player
// ──────────────────────────────────────────────────────────────────────

function makeProps(
  player: { id: number; name: string; position: string },
  logs: NBAPlayerGameLog[],
  team: string,
  opponent: string,
  isAway: boolean,
  matchup: string,
  gameId: string
): PlayerProp[] {
  if (logs.length < 5) return [];

  const avgMin = avgMinutes(logs, 10);
  if (avgMin < 20) return []; // skip bench players

  const recentLogs = logs.slice(0, 10);
  const recent5 = logs.slice(0, 5);
  const props: PlayerProp[] = [];

  for (const def of NBA_PROP_DEFS) {
    // Skip 3PM for centers (position "C")
    if (def.key === "threePointersMade" && player.position === "C") continue;

    const avg5 = rollingAvg(logs, def.key, 5);
    const avg10 = rollingAvg(logs, def.key, 10);
    if (avg5 === null || avg10 === null) continue;

    const modelLine = roundToHalf(avg5);
    if (modelLine < 0.5) continue;
    const line = modelLine;

    const sampleSize = Math.min(10, recentLogs.length);
    const overHits = recentLogs.slice(0, sampleSize).filter((g) => g[def.key] > line).length;
    const overRate = overHits / sampleSize;
    const edge = overRate - STANDARD_IMPLIED_PROB;

    if (edge <= 0) continue;
    if (sampleSize < 5) continue;

    const direction: "Over" = "Over";
    const edgePct = Math.round(edge * 100);
    const confidence =
      Math.abs(edge) > 0.15 ? 90 :
      Math.abs(edge) > 0.10 ? 75 :
      Math.abs(edge) > 0.06 ? 60 : 45;

    const hitRatePct = Math.round(overRate * 100);
    const recentGames = recent5.map((g) => g[def.key]);

    props.push({
      id: `nba-${gameId}-${player.id}-${def.key}-${direction}`,
      playerId: player.id,
      playerName: player.name,
      team,
      teamColor: NBA_TEAM_COLORS[team] || "#4a9eff",
      opponent,
      isAway,
      propType: def.label,
      line,
      overUnder: direction,
      odds: STANDARD_JUICE,
      book: "Model Line",
      league: "NBA",
      matchup,
      recommendation: `${direction} ${line} ${def.label}`,
      direction,
      confidence,
      confidenceBreakdown: {
        recentForm: Math.round((avg5 / (avg10 + 0.01)) * 50),
        matchup: 50,
        situational: 50,
      },
      rollingAverages: {
        last5: parseFloat(avg5.toFixed(2)),
        last10: parseFloat(avg10.toFixed(2)),
      },
      isBackToBack: false,
      recentGames,
      reasoning: `${player.name} averages ${avg10.toFixed(1)} ${def.label.toLowerCase()} over L10 (${avg5.toFixed(1)} in L5). Hit rate ${direction} ${line}: ${hitRatePct}% in last 10 games. Model edge: +${edgePct}%.`,
      summary: `${matchup} • ${direction} ${line} ${def.label} • L10 avg ${avg10.toFixed(1)}`,
      saved: false,
      impliedProb: STANDARD_IMPLIED_PROB,
      hitRate: hitRatePct,
      edge,
      score: Math.abs(edge) * confidence,
      statsSource: "live-nba" as PlayerProp["statsSource"],
      splits: [
        {
          label: `Hit ${direction} ${line} in ${hitRatePct}% of last 10 games`,
          hitRate: hitRatePct,
          hits: Math.round(overRate * 10),
          total: 10,
          type: "last_n",
        },
      ],
      indicators: [],
      projection: parseFloat(avg5.toFixed(2)),
      fairProbability: overRate,
      fairOdds: null,
      edgePct: edge,
    });
  }

  return props;
}

// ──────────────────────────────────────────────────────────────────────
// Main export: build full prop feed from scheduled games
// ──────────────────────────────────────────────────────────────────────

export async function buildNBAStatsPropFeed(
  games: NBAGame[],
  opts: { maxGames?: number; maxPlayers?: number } = {}
): Promise<PlayerProp[]> {
  const { maxGames = 4, maxPlayers = 6 } = opts;
  if (!games.length) return [];

  const allProps: PlayerProp[] = [];
  const targetGames = games.slice(0, maxGames);

  await Promise.all(
    targetGames.map(async (game) => {
      const [homeRoster, awayRoster] = await Promise.all([
        getNBATeamRoster(game.homeTeam.id),
        getNBATeamRoster(game.awayTeam.id),
      ]);

      const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;

      // Prioritize guards and forwards, limit per team
      const pickPlayers = (roster: Array<{ id: number; name: string; position: string }>) => {
        const guards = roster.filter((p) => p.position.includes("G"));
        const forwards = roster.filter((p) => p.position.includes("F"));
        const centers = roster.filter((p) => p.position === "C");
        return [...guards, ...forwards, ...centers].slice(0, maxPlayers);
      };

      const homePlayers = pickPlayers(homeRoster);
      const awayPlayers = pickPlayers(awayRoster);

      type PlayerTask = { player: { id: number; name: string; position: string }; team: string; opponent: string; isAway: boolean };
      const tasks: PlayerTask[] = [
        ...homePlayers.map((p) => ({ player: p, team: game.homeTeam.abbreviation, opponent: game.awayTeam.abbreviation, isAway: false })),
        ...awayPlayers.map((p) => ({ player: p, team: game.awayTeam.abbreviation, opponent: game.homeTeam.abbreviation, isAway: true })),
      ];

      // Batch game log fetches in groups of 5
      for (let i = 0; i < tasks.length; i += 5) {
        const batch = tasks.slice(i, i + 5);
        await Promise.all(
          batch.map(async ({ player, team, opponent, isAway }) => {
            const logs = await getNBAPlayerGameLog(player.id);
            const props = makeProps(
              player, logs, team, opponent,
              isAway, matchup, String(game.id)
            );
            allProps.push(...props);
          })
        );
      }
    })
  );

  // Rank by edge descending
  return allProps.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
}
