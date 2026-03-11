/**
 * NBA Stats Engine (ESPN-powered)
 * Derives player prop lines from ESPN boxscore data for recent completed games.
 * No API key required.
 *
 * Pipeline:
 *  1. Take today/tomorrow scheduled games from ESPN
 *  2. For each playing team, fetch last 10 completed games via ESPN scoreboard
 *  3. Parse player stats from each game's boxscore
 *  4. Compute rolling averages + hit rates for Points, Rebounds, Assists, 3PM
 *  5. Generate model prop lines + edge scores
 *  6. Return ranked list, highest-edge first
 */

import { PlayerProp } from "@/lib/types";
import { NBAGame, getNBABoxscore, getNBASchedule, NBA_TEAM_COLORS } from "@/lib/nba-api";

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210;

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

const NBA_PROP_DEFS = [
  { key: "points" as const, label: "Points", minLine: 5 },
  { key: "rebounds" as const, label: "Rebounds", minLine: 2 },
  { key: "assists" as const, label: "Assists", minLine: 2 },
  { key: "threePointersMade" as const, label: "3-Pointers Made", minLine: 0.5 },
];

type StatKey = typeof NBA_PROP_DEFS[number]["key"];

type GameStat = {
  points: number;
  rebounds: number;
  assists: number;
  threePointersMade: number;
  minutes: number;
};

async function getPlayerRecentStats(
  playerName: string,
  teamAbbrev: string,
  recentGames: NBAGame[]
): Promise<GameStat[]> {
  const logs: GameStat[] = [];
  const teamGames = recentGames
    .filter(g => g.status === "Final" &&
      (g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev))
    .slice(0, 12);

  for (const game of teamGames) {
    try {
      const box = await getNBABoxscore(game.id);
      const isHome = game.homeTeam.abbreviation === teamAbbrev;
      const teamPlayers = isHome ? box.home : box.away;
      const nameLower = playerName.toLowerCase();
      const p = teamPlayers.find(pl =>
        pl.name.toLowerCase().includes(nameLower.split(" ").pop() ?? "") &&
        pl.name.toLowerCase().includes(nameLower.split(" ")[0] ?? "")
      );
      if (!p) continue;
      const mins = parseFloat(p.minutes) || 0;
      if (mins < 15) continue;
      logs.push({
        points: p.points,
        rebounds: p.rebounds,
        assists: p.assists,
        threePointersMade: parseInt(p.threePointers.split("-")[0]) || 0,
        minutes: mins,
      });
    } catch {
      // skip failed boxscore
    }
    if (logs.length >= 10) break;
  }
  return logs;
}

function computeHitRate(logs: GameStat[], key: StatKey, line: number): number {
  if (!logs.length) return 0;
  const hits = logs.filter(g => g[key] > line).length;
  return Math.round((hits / logs.length) * 100);
}

function buildProp(
  playerName: string,
  team: string,
  opponent: string,
  isAway: boolean,
  teamColor: string,
  logs: GameStat[],
  propDef: typeof NBA_PROP_DEFS[number],
  matchup: string,
  gameId: string
): PlayerProp | null {
  const vals = logs.map(g => g[propDef.key]);
  const avg10 = vals.slice(0, 10).reduce((a, b) => a + b, 0) / Math.min(vals.length, 10);
  const line = Math.max(roundToHalf(avg10), propDef.minLine);

  const hitRate = computeHitRate(logs, propDef.key, line);
  const recentGames = vals.slice(0, 10);
  const edge = (hitRate / 100) - STANDARD_IMPLIED_PROB;

  if (edge <= 0) return null;

  return {
    id: `nba-${team}-${playerName.replace(/\s+/g, "-")}-${propDef.key}`,
    league: "NBA",
    playerName,
    team,
    teamColor,
    opponent,
    isAway,
    matchup,
    propType: propDef.label,
    line,
    direction: "Over",
    overUnder: "Over",
    odds: STANDARD_JUICE,
    impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
    hitRate,
    recentGames,
    edgePct: edge,
    edge: Math.round(edge * 100),
    fairProbability: hitRate / 100,
    fairOdds: null,
    splits: [
      {
        label: `L${Math.min(logs.length, 10)}: ${logs.slice(0, 10).filter(g => g[propDef.key] > line).length}/${Math.min(logs.length, 10)} over ${line}`,
        hitRate,
        hits: logs.slice(0, 10).filter(g => g[propDef.key] > line).length,
        total: Math.min(logs.length, 10),
        type: "last_n",
      },
    ],
    indicators: [],
  };
}

export async function buildNBAStatsPropFeed(
  games: NBAGame[],
  opts: { maxGames?: number; maxPlayers?: number } = {}
): Promise<PlayerProp[]> {
  const { maxGames = 3, maxPlayers = 5 } = opts;
  if (!games.length) return [];

  // Get 30 recent completed games for boxscore mining
  let recentGames: NBAGame[] = [];
  try {
    // Fetch past 14 days of games
    const past: NBAGame[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        past.push(...(data.events ?? []).map((e: any) => {
          const comp = e.competitions?.[0] ?? {};
          const comps = comp.competitors ?? [];
          const home = comps.find((c: any) => c.homeAway === "home") ?? comps[0] ?? {};
          const away = comps.find((c: any) => c.homeAway === "away") ?? comps[1] ?? {};
          return {
            id: e.id, date: e.date?.slice(0, 10) ?? "",
            status: e.status?.type?.completed ? "Final" : "Other",
            statusDetail: e.status?.type?.shortDetail ?? "",
            homeTeam: { id: home.team?.id ?? "", abbreviation: home.team?.abbreviation ?? "", fullName: home.team?.displayName ?? "", record: "" },
            awayTeam: { id: away.team?.id ?? "", abbreviation: away.team?.abbreviation ?? "", fullName: away.team?.displayName ?? "", record: "" },
            homeScore: home.score ? parseInt(home.score) : null,
            awayScore: away.score ? parseInt(away.score) : null,
          } as NBAGame;
        }));
      }
      if (past.filter(g => g.status === "Final").length >= 30) break;
    }
    recentGames = past.filter(g => g.status === "Final");
  } catch {
    return [];
  }

  const allProps: PlayerProp[] = [];
  const targetGames = games.slice(0, maxGames);

  for (const game of targetGames) {
    const homeBox = recentGames.filter(g => g.homeTeam.abbreviation === game.homeTeam.abbreviation || g.awayTeam.abbreviation === game.homeTeam.abbreviation).slice(0, 1);
    const awayBox = recentGames.filter(g => g.homeTeam.abbreviation === game.awayTeam.abbreviation || g.awayTeam.abbreviation === game.awayTeam.abbreviation).slice(0, 1);

    // Get a recent boxscore to discover player names for each team
    const getTopPlayers = async (teamAbbrev: string): Promise<string[]> => {
      const teamGames = recentGames.filter(g =>
        g.homeTeam.abbreviation === teamAbbrev || g.awayTeam.abbreviation === teamAbbrev
      ).slice(0, 3);
      const players = new Map<string, number>();
      for (const tg of teamGames) {
        try {
          const box = await getNBABoxscore(tg.id);
          const isHome = tg.homeTeam.abbreviation === teamAbbrev;
          const teamPlayers = isHome ? box.home : box.away;
          for (const p of teamPlayers) {
            const mins = parseFloat(p.minutes) || 0;
            if (mins >= 20) players.set(p.name, (players.get(p.name) ?? 0) + p.points);
          }
        } catch { /* skip */ }
      }
      return Array.from(players.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxPlayers)
        .map(([name]) => name);
    };

    const matchup = `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;

    const [homePlayers, awayPlayers] = await Promise.all([
      getTopPlayers(game.homeTeam.abbreviation),
      getTopPlayers(game.awayTeam.abbreviation),
    ]);

    const tasks = [
      ...homePlayers.map(name => ({ name, team: game.homeTeam.abbreviation, opp: game.awayTeam.abbreviation, isAway: false })),
      ...awayPlayers.map(name => ({ name, team: game.awayTeam.abbreviation, opp: game.homeTeam.abbreviation, isAway: true })),
    ];

    for (const task of tasks) {
      const logs = await getPlayerRecentStats(task.name, task.team, recentGames);
      if (logs.length < 5) continue;
      const color = NBA_TEAM_COLORS[task.team] ?? "#4a9eff";
      for (const propDef of NBA_PROP_DEFS) {
        const prop = buildProp(task.name, task.team, task.opp, task.isAway, color, logs, propDef, matchup, game.id);
        if (prop) allProps.push(prop);
      }
    }
  }

  return allProps.sort((a, b) => (b.edgePct ?? 0) - (a.edgePct ?? 0));
}
