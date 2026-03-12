import { PlayerProp, TeamTrend, AIPick } from "@/lib/types";
import { NHL_TEAM_COLORS } from "@/lib/nhl-api";
import { NBA_TEAM_COLORS } from "@/lib/nba-api";

type ScoredPlayerProp = PlayerProp & { _score: number };
type ScoredTeamTrend = TeamTrend & { _score: number };

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
  const hr = hitRate ?? 0;
  const e = Math.abs(edge ?? 0);
  return (hr / 100) * 0.6 + (e / 100) * 0.4;
}

function playerPickToAIPick(prop: ScoredPlayerProp, date: string): AIPick {
  const direction = prop.direction || prop.overUnder;
  return {
    id: `pick-${prop.id}-${date}`,
    date,
    type: "player",
    playerName: prop.playerName,
    team: prop.team,
    teamColor: prop.teamColor || NHL_TEAM_COLORS[prop.team] || "#4a9eff",
    opponent: prop.opponent,
    isAway: prop.isAway,
    propType: prop.propType,
    line: prop.line,
    direction,
    pickLabel: `${prop.playerName} ${direction} ${prop.line} ${prop.propType}`,
    edge: prop.edge ?? 0,
    hitRate: prop.hitRate ?? 0,
    confidence: prop.confidence ?? Math.round(prop._score * 100),
    reasoning: prop.reasoning || prop.summary || "",
    result: "pending",
    units: 1,
    gameId: prop.gameId,
    odds: prop.odds,
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
    edge: trend.edge ?? 0,
    hitRate: trend.hitRate ?? 0,
    confidence: Math.round(scoreItem(trend.hitRate, trend.edge) * 100),
    reasoning: trend.splits?.[0]?.label || "",
    result: "pending",
    units: 1,
    gameId: trend.gameId,
    odds: trend.odds,
  };
}

export function selectTopPicks(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  date: string,
): AIPick[] {
  const scoredProps: ScoredPlayerProp[] = props
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];

  // Try to pick 2 player props + 1 team trend
  const playerPicks = scoredProps.slice(0, 2);
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
      .slice(playerPicks.length)
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
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];

  const playerPicks = scoredProps.slice(0, 2);
  const teamPicks = scoredTrends.slice(0, 1);

  for (const p of playerPicks) {
    const pick = playerPickToAIPick(p, date);
    pick.league = "NBA";
    pick.teamColor = p.teamColor || NBA_TEAM_COLORS[p.team] || "#4a9eff";
    picks.push(pick);
  }
  for (const t of teamPicks) {
    const pick = teamTrendToAIPick(t, date);
    pick.league = "NBA";
    pick.teamColor = t.teamColor || NBA_TEAM_COLORS[t.team] || "#4a9eff";
    picks.push(pick);
  }

  if (picks.length < 3) {
    const remaining = 3 - picks.length;
    const usedIds = new Set(picks.map((p) => p.id));

    const extraProps = scoredProps
      .slice(playerPicks.length)
      .filter((p) => !usedIds.has(`pick-${p.id}-${date}`));
    const extraTrends = scoredTrends
      .slice(teamPicks.length)
      .filter((t) => !usedIds.has(`pick-${t.id}-${date}`));

    let filled = 0;
    for (const p of extraProps) {
      if (filled >= remaining) break;
      const pick = playerPickToAIPick(p, date);
      pick.league = "NBA";
      pick.teamColor = p.teamColor || NBA_TEAM_COLORS[p.team] || "#4a9eff";
      picks.push(pick);
      filled++;
    }
    for (const t of extraTrends) {
      if (filled >= remaining) break;
      const pick = teamTrendToAIPick(t, date);
      pick.league = "NBA";
      pick.teamColor = t.teamColor || NBA_TEAM_COLORS[t.team] || "#4a9eff";
      picks.push(pick);
      filled++;
    }
  }

  return picks.slice(0, 3);
}
