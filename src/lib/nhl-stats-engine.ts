/**
 * NHL Stats Engine
 * Builds ranked player props entirely from the NHL API (free, no key needed).
 * No external prop market feed required.
 *
 * Pipeline:
 *  1. Take today/tomorrow scheduled games (FUT or LIVE)
 *  2. Fetch roster for each team
 *  3. For top scoring forwards + defensemen, fetch season game logs
 *  4. Compute rolling averages + hit rates for Points, Shots on Goal
 *  5. Generate model prop lines + edge scores
 *  6. Return ranked list, highest-edge first
 */

import { NHLGame, OddsEvent, PlayerProp } from "@/lib/types";
import { NHL_TEAM_COLORS, getGameGoalies } from "@/lib/nhl-api";
import type { GoalieStarter } from "@/lib/nhl-api";
import { getNHLEventOdds, getPlayerPropOdds, type PlayerPropOdds } from "@/lib/odds-api";
import { assignIndicators } from "@/lib/trend-indicators";

const NHL_BASE = "https://api-web.nhle.com/v1";
const SEASON = "20252026";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

type GameLog = {
  gameDate: string;
  points: number;
  goals: number;
  assists: number;
  shots: number;
  toi: string; // "MM:SS"
};

type SkaterRow = {
  id: number;
  name: string;
  positionCode: string;
};

// ──────────────────────────────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error(`NHL API ${res.status}: ${url}`);
  return res.json();
}

function toiSeconds(toi: string): number {
  const [m, s] = (toi || "0:00").split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

async function getRosterSkaters(teamAbbrev: string): Promise<SkaterRow[]> {
  try {
    const data = await fetchJSON<any>(`${NHL_BASE}/roster/${teamAbbrev}/current`);
    const players: SkaterRow[] = [
      ...(data.forwards || []),
      ...(data.defensemen || []),
    ].map((p: any) => ({
      id: p.id,
      name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
      positionCode: p.positionCode || "F",
    }));
    return players;
  } catch {
    return [];
  }
}

async function getGameLog(playerId: number): Promise<GameLog[]> {
  try {
    const data = await fetchJSON<any>(
      `${NHL_BASE}/player/${playerId}/game-log/${SEASON}/2`
    );
    return (data.gameLog || []).map((g: any) => ({
      gameDate: g.gameDate || "",
      points: Number(g.points) || 0,
      goals: Number(g.goals) || 0,
      assists: Number(g.assists) || 0,
      shots: Number(g.shots) || 0,
      toi: g.toi || "0:00",
    }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────
// Rolling stat helpers
// ──────────────────────────────────────────────────────────────────────

type StatKey = "points" | "shots" | "assists" | "goals";
type PropDef = { key: StatKey; label: string; market: string };

const NHL_PROP_DEFS: PropDef[] = [
  { key: "points", label: "Points", market: "player_points" },
  { key: "shots", label: "Shots on Goal", market: "player_shots_on_goal" },
  { key: "goals", label: "Goals", market: "player_goals" },
  { key: "assists", label: "Assists", market: "player_assists" },
];

function rollingAvg(logs: GameLog[], key: StatKey, n: number): number | null {
  const slice = logs.slice(0, n);
  if (slice.length < 3) return null;
  return slice.reduce((s, g) => s + g[key], 0) / slice.length;
}

function hitRate(logs: GameLog[], key: StatKey, line: number, direction: "Over" | "Under"): number {
  if (!logs.length) return 0;
  const hits = logs.filter((g) =>
    direction === "Over" ? g[key] > line : g[key] < line
  ).length;
  return hits / logs.length;
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

function avgTOI(logs: GameLog[], n: number): number {
  const slice = logs.slice(0, n);
  if (!slice.length) return 0;
  return slice.reduce((s, g) => s + toiSeconds(g.toi), 0) / slice.length;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function pickBestPropPrice(
  recentLogs: GameLog[],
  key: StatKey,
  modelLine: number,
  isGoalieBoosted: boolean,
  oddsOptions: PlayerPropOdds[]
) {
  const sampleSize = Math.min(10, recentLogs.length);
  if (sampleSize < 5) return null;

  const candidates = oddsOptions.length > 0
    ? oddsOptions
    : [{ odds: STANDARD_JUICE, book: "Model Line", line: modelLine, impliedProbability: STANDARD_IMPLIED_PROB }];

  let best: {
    line: number;
    odds: number;
    book: string;
    impliedProbability: number;
    hitRate: number;
    edge: number;
  } | null = null;

  for (const candidate of candidates) {
    const hits = recentLogs.slice(0, sampleSize).filter((game) => game[key] > candidate.line).length;
    const baseRate = hits / sampleSize;
    const baseEdge = baseRate - candidate.impliedProbability;
    const adjustedEdge = isGoalieBoosted ? baseEdge + 0.10 : baseEdge;

    if (!best || adjustedEdge > best.edge || (adjustedEdge === best.edge && candidate.odds > best.odds)) {
      best = {
        line: candidate.line,
        odds: candidate.odds,
        book: candidate.book,
        impliedProbability: candidate.impliedProbability,
        hitRate: baseRate,
        edge: adjustedEdge,
      };
    }
  }

  return best;
}

// ──────────────────────────────────────────────────────────────────────
// Build props for a single player
// ──────────────────────────────────────────────────────────────────────

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210; // ≈ 0.524

function makeProps(
  player: SkaterRow,
  logs: GameLog[],
  team: string,
  opponent: string,
  isAway: boolean,
  matchup: string,
  gameId: string,
  oddsEvent?: OddsEvent | null,
  opposingGoalie?: GoalieStarter | null
): PlayerProp[] {
  if (logs.length < 5) return [];

  const recentLogs = logs.slice(0, 10); // last 10 for hit rate
  const recent5 = logs.slice(0, 5);
  const avgToi = avgTOI(logs, 10);
  if (avgToi < 5 * 60) return []; // skip players with <5min avg TOI (scratches, 4th-liners)

  const props: PlayerProp[] = [];

  for (const def of NHL_PROP_DEFS) {
    const avg5 = rollingAvg(logs, def.key, 5);
    const avg10 = rollingAvg(logs, def.key, 10);
    if (avg5 === null || avg10 === null) continue;

    // Floor-half below average for natural over bias
    const modelLine = Math.max(Math.floor(avg5 * 2) / 2, 0.5);

    // Backup goalie boost: +10% edge for Goals and Shots
    const isGoalieBoosted = opposingGoalie?.isBackup === true && (def.key === "goals" || def.key === "shots");
    const bestMarket = pickBestPropPrice(
      recentLogs,
      def.key,
      modelLine,
      isGoalieBoosted,
      getPlayerPropOdds(oddsEvent, def.market, player.name, "Over")
    );

    if (!bestMarket || bestMarket.edge < -0.05) continue;

    const direction: "Over" = "Over";
    const bestEdge = bestMarket.edge;
    const bestRate = bestMarket.hitRate;
    const line = bestMarket.line;
    const odds = bestMarket.odds;
    const book = bestMarket.book;
    const impliedProbability = bestMarket.impliedProbability;

    const edgePct = Number((bestEdge * 100).toFixed(1));
    const confidence =
      Math.abs(bestEdge) > 0.15 ? 90 :
      Math.abs(bestEdge) > 0.10 ? 75 :
      Math.abs(bestEdge) > 0.06 ? 60 : 45;

    const hitRatePct = Number((bestRate * 100).toFixed(1));

    const recentGames = recent5.map((g) => g[def.key]);
    const bookSummary = book !== "Model Line"
      ? ` Best price: ${book} ${formatAmericanOdds(odds)} at ${line}.`
      : "";

    props.push({
      id: `${gameId}-${player.id}-${def.key}-${direction}`,
      playerId: player.id,
      playerName: player.name,
      team,
      teamColor: NHL_TEAM_COLORS[team] || "#4a9eff",
      opponent,
      isAway,
      propType: def.label,
      line,
      overUnder: direction,
      odds,
      book,
      league: "NHL",
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
      reasoning: `${player.name} averages ${avg10.toFixed(1)} ${def.label.toLowerCase()} over L10 (${avg5.toFixed(1)} in L5). Hit rate ${direction} ${line}: ${formatPct(bestRate)} over the last ${Math.min(recentLogs.length, 10)} games. Edge vs implied probability: +${edgePct.toFixed(1)}%.${isGoalieBoosted ? " Backup goalie starting — elevated Goals/Shots edge." : ""}${bookSummary}`,
      summary: `${matchup} • ${direction} ${line} ${def.label} • L10 avg ${avg10.toFixed(1)}`,
      saved: false,
      impliedProb: Number((impliedProbability * 100).toFixed(1)),
      hitRate: hitRatePct,
      edge: bestEdge,
      score: Math.abs(bestEdge) * confidence,
      statsSource: "live-nhl",
      splits: [
        {
          label: `Hit ${direction} ${line} in ${hitRatePct.toFixed(1)}% of last ${Math.min(recentLogs.length, 10)} games`,
          hitRate: hitRatePct,
          hits: Math.round(bestRate * Math.min(recentLogs.length, 10)),
          total: Math.min(recentLogs.length, 10),
          type: "last_n",
        },
      ],
      indicators: assignIndicators({
        hitRate: hitRatePct,
        edge: bestEdge,
        sampleSize: Math.min(recentLogs.length, 10),
        recentGames: recent5.map(g => g[def.key]),
        line,
        odds: bestMarket.odds,
      }),
      projection: parseFloat(avg5.toFixed(2)),
      fairProbability: bestRate,
      fairOdds: null,
      edgePct: bestEdge,
      gameId,
    });
  }

  return props;
}

// ──────────────────────────────────────────────────────────────────────
// Main export: build full prop feed from scheduled games
// ──────────────────────────────────────────────────────────────────────

export async function buildNHLStatsPropFeed(
  games: NHLGame[],
  opts: { maxGames?: number; maxForwards?: number; maxDefense?: number } = {}
): Promise<PlayerProp[]> {
  const { maxGames = 4, maxForwards = 5, maxDefense = 2 } = opts;

  // Accept all games (including recently completed OFF games for Trends)
  if (!games.length) return [];

  const allProps: PlayerProp[] = [];

  const targetGames = games.slice(0, maxGames);

  await Promise.all(
    targetGames.map(async (game) => {
      const [homeRoster, awayRoster, goalies, oddsEvent] = await Promise.all([
        getRosterSkaters(game.homeTeam.abbrev),
        getRosterSkaters(game.awayTeam.abbrev),
        getGameGoalies(game.id).catch(() => ({ gameId: game.id, home: null, away: null })),
        getNHLEventOdds(game.oddsEventId).catch(() => null),
      ]);

      const matchup = `${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`;

      const pickPlayers = (roster: SkaterRow[]) => {
        const forwards = roster.filter((p) => p.positionCode !== "D").slice(0, maxForwards);
        const defense = roster.filter((p) => p.positionCode === "D").slice(0, maxDefense);
        return [...forwards, ...defense];
      };

      const homePlayers = pickPlayers(homeRoster);
      const awayPlayers = pickPlayers(awayRoster);

      // Batch game log fetches in groups of 5
      type PlayerTask = { player: SkaterRow; team: string; opponent: string; isAway: boolean; opposingGoalie: GoalieStarter | null };
      const tasks: PlayerTask[] = [
        ...homePlayers.map((p) => ({ player: p, team: game.homeTeam.abbrev, opponent: game.awayTeam.abbrev, isAway: false, opposingGoalie: goalies.away })),
        ...awayPlayers.map((p) => ({ player: p, team: game.awayTeam.abbrev, opponent: game.homeTeam.abbrev, isAway: true, opposingGoalie: goalies.home })),
      ];

      for (let i = 0; i < tasks.length; i += 5) {
        const batch = tasks.slice(i, i + 5);
        await Promise.all(
          batch.map(async ({ player, team, opponent, isAway, opposingGoalie }) => {
            const logs = await getGameLog(player.id);
            const props = makeProps(
              player, logs, team, opponent,
              isAway, matchup, String(game.id), oddsEvent,
              opposingGoalie
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
