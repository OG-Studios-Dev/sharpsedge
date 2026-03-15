import { PlayerProp, TeamTrend, AIPick } from "@/lib/types";
import { NHL_TEAM_COLORS } from "@/lib/nhl-api";
import { NBA_TEAM_COLORS } from "@/lib/nba-api";

type ScoredPlayerProp = PlayerProp & { _score: number };
type ScoredTeamTrend = TeamTrend & { _score: number };

function normalizePercentValue(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function parseTrendLine(line?: string): number | undefined {
  if (!line) return undefined;
  const match = line.match(/([\d.]+)/);
  if (!match) return undefined;
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildTeamPickLabel(trend: TeamTrend): string {
  const betType = trend.betType || "";
  if (betType === "Team Goals O/U") {
    const splitLabel = trend.splits?.[0]?.label || "";
    const match = splitLabel.match(/Over\s+([\d.]+)/i);
    const line = match ? match[1] : "";
    return line ? `${trend.team} Over ${line} Goals` : `${trend.team} Over Goals`;
  }
  if (betType === "Team Points O/U") {
    return `${trend.team} ${trend.line}`;
  }
  if (betType === "Team Win ML" || betType === "ML Home Win" || betType === "ML Streak") {
    return `${trend.team} Win ML`;
  }
  if (betType === "ML Road Win") {
    return `${trend.team} Win ML (Road)`;
  }
  if (betType.startsWith("H2H ML")) {
    return `${trend.team} Win vs ${trend.opponent} (H2H)`;
  }
  if (betType === "Score First & Win") {
    return `${trend.team} Score First & Win`;
  }
  return `${trend.team} ${betType}`;
}

function scoreItem(hitRate?: number, edge?: number): number {
  const hr = normalizePercentValue(hitRate);
  const e = Math.abs(normalizePercentValue(edge));
  return (hr / 100) * 0.6 + (e / 100) * 0.4;
}

function buildPlayerReasoning(prop: ScoredPlayerProp): string {
  const hr = normalizePercentValue(prop.hitRate);
  const edge = normalizePercentValue(prop.edge);
  const avg5 = prop.rollingAverages?.last5;
  const avg10 = prop.rollingAverages?.last10;
  const recentGames = prop.recentGames || [];
  const last3 = recentGames.slice(0, 3);
  const direction = prop.direction || prop.overUnder || "Over";
  const matchup = prop.isAway ? `@ ${prop.opponent}` : `vs ${prop.opponent}`;

  const parts: string[] = [];
  parts.push(`${prop.playerName} has hit ${direction} ${prop.line} ${prop.propType} in ${hr.toFixed(0)}% of recent games.`);

  if (avg10 != null) {
    parts.push(`L10 avg: ${avg10.toFixed(1)}${avg5 != null ? `, L5 avg: ${avg5.toFixed(1)}` : ""}.`);
  }

  if (last3.length >= 3) {
    parts.push(`Last 3 games: ${last3.join(", ")}.`);
  }

  if (edge > 0) {
    parts.push(`Model edge: +${edge.toFixed(1)}% over implied odds.`);
  }

  if (prop.book && prop.book !== "Model Line") {
    parts.push(`Best price: ${prop.book} ${prop.odds > 0 ? "+" : ""}${prop.odds}.`);
  }

  parts.push(`${matchup} today.`);
  return parts.join(" ");
}

function buildTeamReasoning(trend: ScoredTeamTrend): string {
  const hr = normalizePercentValue(trend.hitRate);
  const edge = normalizePercentValue(trend.edge);
  const matchup = trend.isAway ? `@ ${trend.opponent}` : `vs ${trend.opponent}`;
  const splits = trend.splits || [];

  const parts: string[] = [];
  parts.push(`${trend.team} ${trend.betType}: ${hr.toFixed(0)}% hit rate.`);

  for (const split of splits.slice(0, 2)) {
    if (split.label) parts.push(split.label + ".");
  }

  if (edge > 0) {
    parts.push(`Edge: +${edge.toFixed(1)}% over implied.`);
  }

  parts.push(`${matchup} today.`);
  return parts.join(" ");
}

// Filter: odds must be between -200 and +300 (no heavy favorites or long shots)
function isPickableOdds(odds?: number): boolean {
  if (typeof odds !== "number") return true; // allow if no odds data
  return odds >= -200;
}

function playerPickToAIPick(prop: ScoredPlayerProp, date: string): AIPick {
  const direction = prop.direction || prop.overUnder;
  return {
    id: `pick-${prop.id}-${date}`,
    date,
    type: "player",
    playerId: prop.playerId,
    playerName: prop.playerName,
    team: prop.team,
    teamColor: prop.teamColor || NHL_TEAM_COLORS[prop.team] || "#4a9eff",
    opponent: prop.opponent,
    isAway: prop.isAway,
    propType: prop.propType,
    line: prop.line,
    direction,
    pickLabel: `${prop.playerName} ${direction} ${prop.line} ${prop.propType}`,
    edge: normalizePercentValue(prop.edge),
    hitRate: normalizePercentValue(prop.hitRate),
    confidence: prop.confidence ?? Math.round(prop._score * 100),
    reasoning: buildPlayerReasoning(prop),
    result: "pending",
    units: 1,
    gameId: prop.gameId,
    odds: prop.odds,
    book: prop.book,
    league: prop.league,
  };
}

function teamTrendToAIPick(trend: ScoredTeamTrend, date: string): AIPick {
  return {
    id: `pick-${trend.id}-${date}`,
    date,
    type: "team",
    team: trend.team,
    teamColor: trend.teamColor || NHL_TEAM_COLORS[trend.team] || "#4a9eff",
    opponent: trend.opponent,
    isAway: trend.isAway,
    betType: trend.betType,
    line: parseTrendLine(trend.line),
    pickLabel: buildTeamPickLabel(trend),
    edge: normalizePercentValue(trend.edge),
    hitRate: normalizePercentValue(trend.hitRate),
    confidence: Math.round(scoreItem(trend.hitRate, trend.edge) * 100),
    reasoning: buildTeamReasoning(trend),
    result: "pending",
    units: 1,
    gameId: trend.gameId,
    odds: trend.odds,
    book: trend.book,
    league: trend.league,
  };
}

function propVarietyBucket(prop: PlayerProp): string {
  const propType = (prop.propType || "").toLowerCase();
  if (propType.includes("shot")) return "shots";
  if (propType.includes("3-pointer") || propType.includes("three")) return "threes";
  if (propType.includes("point")) return "points";
  if (propType.includes("rebound")) return "rebounds";
  if (propType.includes("assist")) return "assists";
  if (propType.includes("goal")) return "goals";
  return propType || prop.id;
}

function normalizePlayerKey(name?: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function selectVariedPlayerPicks(props: ScoredPlayerProp[], count: number): ScoredPlayerProp[] {
  const selected: ScoredPlayerProp[] = [];
  const usedIds = new Set<string>();
  const usedBuckets = new Set<string>();
  const usedPlayers = new Set<string>();

  for (const prop of props) {
    if (selected.length >= count) break;
    const bucket = propVarietyBucket(prop);
    const playerKey = normalizePlayerKey(prop.playerName);
    if (usedBuckets.has(bucket) || (playerKey && usedPlayers.has(playerKey))) continue;

    selected.push(prop);
    usedIds.add(prop.id);
    usedBuckets.add(bucket);
    if (playerKey) usedPlayers.add(playerKey);
  }

  if (selected.length >= count) return selected;

  for (const prop of props) {
    if (selected.length >= count) break;
    if (usedIds.has(prop.id)) continue;

    const playerKey = normalizePlayerKey(prop.playerName);
    if (playerKey && usedPlayers.has(playerKey)) continue;

    selected.push(prop);
    usedIds.add(prop.id);
    if (playerKey) usedPlayers.add(playerKey);
  }

  return selected;
}

export function selectTopPicks(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  date: string,
): AIPick[] {
  const scoredProps: ScoredPlayerProp[] = props
    .filter((p) => isPickableOdds(p.odds))
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .filter((t) => isPickableOdds(t.odds))
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];

  // Try to pick 2 player props + 1 team trend
  const playerPicks = selectVariedPlayerPicks(scoredProps, 2);
  const teamPicks = scoredTrends.slice(0, 1);

  for (const p of playerPicks) {
    picks.push(playerPickToAIPick(p, date));
  }
  for (const t of teamPicks) {
    picks.push(teamTrendToAIPick(t, date));
  }

  // Fill remaining slots if not enough of one type
  if (picks.length < 3) {
    const remaining = 3 - picks.length;
    const usedIds = new Set(picks.map((p) => p.id));

    // Fill from whichever pool has more
    const extraProps = scoredProps
      .filter((p) => !playerPicks.some((selected) => selected.id === p.id))
      .filter((p) => !usedIds.has(`pick-${p.id}-${date}`));
    const extraTrends = scoredTrends
      .slice(teamPicks.length)
      .filter((t) => !usedIds.has(`pick-${t.id}-${date}`));

    let filled = 0;
    for (const p of extraProps) {
      if (filled >= remaining) break;
      picks.push(playerPickToAIPick(p, date));
      filled++;
    }
    for (const t of extraTrends) {
      if (filled >= remaining) break;
      picks.push(teamTrendToAIPick(t, date));
      filled++;
    }
  }

  return picks.slice(0, 3);
}

export function selectNBATopPicks(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  date: string,
): AIPick[] {
  const scoredProps: ScoredPlayerProp[] = props
    .filter((p) => isPickableOdds(p.odds))
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .filter((t) => isPickableOdds(t.odds))
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];

  const playerPicks = selectVariedPlayerPicks(scoredProps, 2);
  const teamPicks = scoredTrends.slice(0, 1);

  for (const p of playerPicks) {
    const pick = playerPickToAIPick(p, date);
    pick.teamColor = p.teamColor || NBA_TEAM_COLORS[p.team] || "#4a9eff";
    picks.push(pick);
  }
  for (const t of teamPicks) {
    const pick = teamTrendToAIPick(t, date);
    pick.teamColor = t.teamColor || NBA_TEAM_COLORS[t.team] || "#4a9eff";
    picks.push(pick);
  }

  if (picks.length < 3) {
    const remaining = 3 - picks.length;
    const usedIds = new Set(picks.map((p) => p.id));

    const extraProps = scoredProps
      .filter((p) => !playerPicks.some((selected) => selected.id === p.id))
      .filter((p) => !usedIds.has(`pick-${p.id}-${date}`));
    const extraTrends = scoredTrends
      .slice(teamPicks.length)
      .filter((t) => !usedIds.has(`pick-${t.id}-${date}`));

    let filled = 0;
    for (const p of extraProps) {
      if (filled >= remaining) break;
      const pick = playerPickToAIPick(p, date);
      pick.teamColor = p.teamColor || NBA_TEAM_COLORS[p.team] || "#4a9eff";
      picks.push(pick);
      filled++;
    }
    for (const t of extraTrends) {
      if (filled >= remaining) break;
      const pick = teamTrendToAIPick(t, date);
      pick.teamColor = t.teamColor || NBA_TEAM_COLORS[t.team] || "#4a9eff";
      picks.push(pick);
      filled++;
    }
  }

  return picks.slice(0, 3);
}
