import { PlayerProp, TeamTrend, AIPick } from "@/lib/types";
import { NBA_TEAM_COLORS } from "@/lib/nba-api";
import { MLB_TEAM_COLORS } from "@/lib/mlb-api";
import { formatAmericanOdds, resolveSelectedBookOdds } from "@/lib/book-odds";

type ScoredPlayerProp = PlayerProp & { _score: number };
type ScoredTeamTrend = TeamTrend & { _score: number };

function normalizePercentValue(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function parseTrendLine(line?: string): number | undefined {
  if (!line) return undefined;
  const normalized = line.trim();
  if (!normalized) return undefined;

  // Only parse actual market lines. Ignore descriptive labels like "L10", "W5 recent",
  // "Home ML", or "Road ML" which are context strings, not betting lines.
  const exactNumber = normalized.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (exactNumber) {
    const parsed = parseFloat(exactNumber[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const prefixedNumber = normalized.match(/^(?:O\/U|Over|Under)\s+([+-]?\d+(?:\.\d+)?)$/i);
  if (prefixedNumber) {
    const parsed = parseFloat(prefixedNumber[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
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
  if (betType === "Total Runs O/U") {
    return `${trend.team} ${trend.line}`;
  }
  if (betType === "Team Win ML" || betType === "ML Home Win" || betType === "ML Streak") {
    return `${trend.team} Win ML`;
  }
  if (betType === "ML Road Win") {
    return `${trend.team} Win ML (Road)`;
  }
  if (betType === "Run Line") {
    return `${trend.team} ${trend.line} Run Line`;
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

function hasVerifiedSample(split?: { hits?: number; total?: number }): boolean {
  if (!split) return false;
  return typeof split.total === "number" && split.total > 0;
}

function isVerifiedTeamTrend(trend: TeamTrend): boolean {
  const betType = (trend.betType || "").toLowerCase();
  const requiresQuarterEvidence = betType.startsWith("1q") || betType.startsWith("1p");

  if (!requiresQuarterEvidence) return true;

  return (trend.splits || []).some(hasVerifiedSample);
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
  const bestBookOdds = resolveSelectedBookOdds(prop.bookOdds || [], {
    book: prop.book,
    odds: prop.odds,
    line: prop.line,
  });
  const displayBook = bestBookOdds?.book ?? prop.book;
  const displayOdds = bestBookOdds?.odds ?? prop.odds;
  const splitLabels = (prop.splits || []).map((split) => split.label).filter(Boolean).slice(0, 2);

  const parts: string[] = [];
  parts.push(`${prop.playerName} has hit ${direction} ${prop.line} ${prop.propType} in ${hr.toFixed(0)}% of recent games.`);

  if (avg10 != null) {
    parts.push(`L10 avg: ${avg10.toFixed(1)}${avg5 != null ? `, L5 avg: ${avg5.toFixed(1)}` : ""}.`);
  }

  if (avg10 != null) {
    const cushion = direction === "Under" ? prop.line - avg10 : avg10 - prop.line;
    parts.push(`Model cushion vs line: ${cushion >= 0 ? "+" : ""}${cushion.toFixed(1)}.`);
  }

  if (last3.length >= 3) {
    parts.push(`Last 3 games: ${last3.join(", ")}.`);
  }

  if (splitLabels.length > 0) {
    parts.push(splitLabels.map((label) => `${label}.`).join(" "));
  }

  if (edge > 0) {
    parts.push(`Model edge: +${edge.toFixed(1)}% over implied odds.`);
  }

  if (displayBook && displayBook !== "Model Line" && typeof displayOdds === "number") {
    parts.push(`Best price: ${displayBook} ${formatAmericanOdds(displayOdds)}.`);
  }

  parts.push(`${matchup} today.`);
  return parts.join(" ");
}

function buildTeamReasoning(trend: ScoredTeamTrend): string {
  const hr = normalizePercentValue(trend.hitRate);
  const edge = normalizePercentValue(trend.edge);
  const matchup = trend.isAway ? `@ ${trend.opponent}` : `vs ${trend.opponent}`;
  const splits = trend.splits || [];
  const bestBookOdds = resolveSelectedBookOdds(trend.bookOdds || [], {
    book: trend.book,
    odds: trend.odds,
  });
  const displayBook = bestBookOdds?.book ?? trend.book;
  const displayOdds = bestBookOdds?.odds ?? trend.odds;

  const parts: string[] = [];

  // Build reasoning per template: hit rate, recent form, matchup, edge, why now
  const betLabel = trend.betType || "trend";
  const lookback = betLabel.toLowerCase().includes("streak") ? "recent stretch" : "L10";

  parts.push(`${trend.team} ${betLabel}: ${hr.toFixed(0)}% hit rate over ${lookback}.`);

  // Include split context but strip unverified streak claims
  for (const split of splits.slice(0, 2)) {
    if (split.label) {
      // Don't parrot specific streak numbers we can't verify
      const cleaned = split.label
        .replace(/Active \d+-game (win |)streak\.?/gi, "Strong recent form.")
        .replace(/\d+-game (win |)streak/gi, "recent winning run")
        .trim();
      if (cleaned) parts.push(cleaned + (cleaned.endsWith(".") ? "" : "."));
    }
  }

  if (edge > 0) {
    parts.push(`Model edge: +${edge.toFixed(1)}% over implied book odds.`);
  }

  if (displayBook && displayBook !== "Model Line" && typeof displayOdds === "number") {
    parts.push(`Best price: ${displayBook} ${formatAmericanOdds(displayOdds)}.`);
  }

  parts.push(`${matchup} today.`);
  return parts.join(" ");
}

// Filter: odds must be between -200 and +300 (no heavy favorites or long shots)
function isPickableOdds(odds?: number): boolean {
  if (typeof odds !== "number") return true; // allow if no odds data
  return odds >= -200 && odds <= 300;
}

function playerPickToAIPick(prop: ScoredPlayerProp, date: string): AIPick {
  const direction = prop.direction || prop.overUnder;
  const bestBookOdds = resolveSelectedBookOdds(prop.bookOdds || [], {
    book: prop.book,
    odds: prop.odds,
    line: prop.line,
  });

  return {
    id: `pick-${btoa(`${prop.gameId || 'no-game'}-${prop.playerName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${prop.propType}-${prop.line}-${date}`).slice(0, 36)}`,
    date: prop.gameDate || date,
    type: "player",
    playerId: prop.playerId,
    playerName: prop.playerName,
    team: prop.team,
    teamColor: prop.teamColor || "#4a9eff",
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
    oddsEventId: prop.oddsEventId,
    odds: bestBookOdds?.odds ?? prop.odds,
    // Fall back to "Model Line" so the sportsbook field is never null in UI
    book: bestBookOdds?.book ?? prop.book ?? "Model Line",
    bookOdds: prop.bookOdds,
    league: prop.league,
  };
}

function teamTrendToAIPick(trend: ScoredTeamTrend, date: string): AIPick {
  const bestBookOdds = resolveSelectedBookOdds(trend.bookOdds || [], {
    book: trend.book,
    odds: trend.odds,
  });

  return {
    id: `pick-${btoa(`${trend.gameId || 'no-game'}-${trend.team.toLowerCase().replace(/[^a-z0-9]/g, '') || trend.team.toLowerCase().replace(/[^a-z0-9]/g, '')}-${trend.betType || 'unknown'}-${trend.line || 0}-${date}`).slice(0, 36)}`,
    date: trend.gameDate || date,
    type: "team",
    team: trend.team,
    teamColor: trend.teamColor || "#4a9eff",
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
    odds: bestBookOdds?.odds ?? trend.odds,
    // Fall back to "Model Line" so the sportsbook field is never null in UI
    book: bestBookOdds?.book ?? trend.book ?? "Model Line",
    bookOdds: trend.bookOdds,
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
  if (propType.includes("hit")) return "hits";
  if (propType.includes("total base")) return "total_bases";
  if (propType.includes("home run")) return "home_runs";
  if (propType.includes("strikeout")) return "strikeouts";
  return propType || prop.id;
}

function normalizePlayerKey(name?: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function teamTrendConflictKey(trend: TeamTrend): string {
  const betType = (trend.betType || "").toLowerCase();
  const marketFamily = betType.includes("ml")
    ? "ml"
    : betType.includes("1q")
      ? "1q"
      : betType.includes("1p")
        ? "1p"
        : betType.includes("total")
          ? "total"
          : betType;
  const matchupKey = trend.gameId || [trend.team, trend.opponent].sort().join(":");
  return `${trend.league || "NHL"}:${matchupKey}:${marketFamily}`;
}

function selectDistinctTeamPicks(trends: ScoredTeamTrend[], count: number): ScoredTeamTrend[] {
  const selected: ScoredTeamTrend[] = [];
  const usedKeys = new Set<string>();

  for (const trend of trends) {
    if (selected.length >= count) break;
    const conflictKey = teamTrendConflictKey(trend);
    if (usedKeys.has(conflictKey)) continue;

    selected.push(trend);
    usedKeys.add(conflictKey);
  }

  return selected;
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

// ── Production quality floors (V1 user-facing picks) ─────────────────────────
// hitRate floor: 65% hard minimum (no streak exception — 60% picks were slipping through daily)
// edge floor: 10% minimum model edge over implied odds
// These gates apply to NHL, NBA, and MLB picks equally.
const V1_HIT_RATE_FLOOR = 65;
const V1_EDGE_FLOOR = 10;

export function selectTopPicks(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  date: string,
): AIPick[] {
  // Pick quality filter:
  // - 65%+ hit rate AND 10%+ edge: pickable
  // - Anything below either floor: never pick
  // NOTE: The 60-64% streak exception was removed 2026-03-29 because 60% picks
  // were qualifying daily via the streak path, failing QA gate consistently.
  function meetsQualityThreshold(hitRate: number, edge?: number): boolean {
    const hr = normalizePercentValue(hitRate);
    const e = typeof edge === "number" ? normalizePercentValue(edge) : 0;
    return hr >= V1_HIT_RATE_FLOOR && e >= V1_EDGE_FLOOR;
  }

  const scoredProps: ScoredPlayerProp[] = props
    .filter((p) => isPickableOdds(p.odds))
    .filter((p) => meetsQualityThreshold(normalizePercentValue(p.hitRate), p.edge))
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .filter((t) => isPickableOdds(t.odds))
    .filter((t) => isVerifiedTeamTrend(t))
    .filter((t) => meetsQualityThreshold(normalizePercentValue(t.hitRate), t.edge))
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];

  // Try to pick 2 player props + 1 team trend
  const playerPicks = selectVariedPlayerPicks(scoredProps, 2);
  const teamPicks = selectDistinctTeamPicks(scoredTrends, 1);

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
    const usedBuckets = new Set(playerPicks.map((pick) => propVarietyBucket(pick)));
    const usedTrendKeys = new Set(teamPicks.map((trend) => teamTrendConflictKey(trend)));

    const extraTrends = scoredTrends
      .slice(teamPicks.length)
      .filter((t) => !usedIds.has(`pick-${t.id}-${date}`))
      .filter((t) => !usedTrendKeys.has(teamTrendConflictKey(t)));
    const extraProps = scoredProps
      .filter((p) => !playerPicks.some((selected) => selected.id === p.id))
      .filter((p) => !usedIds.has(`pick-${p.id}-${date}`));

    let filled = 0;
    for (const t of extraTrends) {
      if (filled >= remaining) break;
      picks.push(teamTrendToAIPick(t, date));
      usedIds.add(`pick-${t.id}-${date}`);
      usedTrendKeys.add(teamTrendConflictKey(t));
      filled++;
    }
    for (const p of extraProps) {
      if (filled >= remaining) break;
      const bucket = propVarietyBucket(p);
      if (usedBuckets.has(bucket)) continue;
      picks.push(playerPickToAIPick(p, date));
      usedIds.add(`pick-${p.id}-${date}`);
      usedBuckets.add(bucket);
      filled++;
    }
    for (const p of extraProps) {
      if (filled >= remaining) break;
      if (usedIds.has(`pick-${p.id}-${date}`)) continue;
      picks.push(playerPickToAIPick(p, date));
      usedIds.add(`pick-${p.id}-${date}`);
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
  // Apply same V1 quality floors as NHL: 65% hitRate + 10% edge minimum
  function meetsQualityThreshold(hitRate: number, edge?: number): boolean {
    const hr = normalizePercentValue(hitRate);
    const e = typeof edge === "number" ? normalizePercentValue(edge) : 0;
    return hr >= V1_HIT_RATE_FLOOR && e >= V1_EDGE_FLOOR;
  }

  const scoredProps: ScoredPlayerProp[] = props
    .filter((p) => isPickableOdds(p.odds))
    .filter((p) => meetsQualityThreshold(normalizePercentValue(p.hitRate), p.edge))
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .filter((t) => isPickableOdds(t.odds))
    .filter((t) => isVerifiedTeamTrend(t))
    .filter((t) => meetsQualityThreshold(normalizePercentValue(t.hitRate), t.edge))
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];

  const playerPicks = selectVariedPlayerPicks(scoredProps, 2);
  const teamPicks = selectDistinctTeamPicks(scoredTrends, 1);

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
    const usedBuckets = new Set(playerPicks.map((pick) => propVarietyBucket(pick)));
    const usedTrendKeys = new Set(teamPicks.map((trend) => teamTrendConflictKey(trend)));

    const extraTrends = scoredTrends
      .slice(teamPicks.length)
      .filter((t) => !usedIds.has(`pick-${t.id}-${date}`))
      .filter((t) => !usedTrendKeys.has(teamTrendConflictKey(t)));
    const extraProps = scoredProps
      .filter((p) => !playerPicks.some((selected) => selected.id === p.id))
      .filter((p) => !usedIds.has(`pick-${p.id}-${date}`));

    let filled = 0;
    for (const t of extraTrends) {
      if (filled >= remaining) break;
      const pick = teamTrendToAIPick(t, date);
      pick.teamColor = t.teamColor || NBA_TEAM_COLORS[t.team] || "#4a9eff";
      picks.push(pick);
      usedIds.add(`pick-${t.id}-${date}`);
      usedTrendKeys.add(teamTrendConflictKey(t));
      filled++;
    }
    for (const p of extraProps) {
      if (filled >= remaining) break;
      const bucket = propVarietyBucket(p);
      if (usedBuckets.has(bucket)) continue;
      const pick = playerPickToAIPick(p, date);
      pick.teamColor = p.teamColor || NBA_TEAM_COLORS[p.team] || "#4a9eff";
      picks.push(pick);
      usedIds.add(`pick-${p.id}-${date}`);
      usedBuckets.add(bucket);
      filled++;
    }
    for (const p of extraProps) {
      if (filled >= remaining) break;
      if (usedIds.has(`pick-${p.id}-${date}`)) continue;
      const pick = playerPickToAIPick(p, date);
      pick.teamColor = p.teamColor || NBA_TEAM_COLORS[p.team] || "#4a9eff";
      picks.push(pick);
      usedIds.add(`pick-${p.id}-${date}`);
      filled++;
    }
  }

  return picks.slice(0, 3);
}

export function selectMLBTopPicks(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  date: string,
): AIPick[] {
  // MLB uses the same V1 quality floors as NHL/NBA.
  // MLB season is short and early-season samples are thin, so we use a slightly
  // lower edge floor (8%) compared to NHL/NBA (10%) to avoid 0-pick slates in
  // the first weeks. hitRate floor remains the same 65%.
  const MLB_EDGE_FLOOR = 8;

  const scoredProps: ScoredPlayerProp[] = props
    .filter((p) => isPickableOdds(p.odds))
    .filter((p) => {
      const hr = normalizePercentValue(p.hitRate);
      const e = typeof p.edge === "number" ? normalizePercentValue(p.edge) : 0;
      return hr >= V1_HIT_RATE_FLOOR && e >= MLB_EDGE_FLOOR;
    })
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .filter((t) => isPickableOdds(t.odds))
    .filter((t) => {
      const hr = normalizePercentValue(t.hitRate);
      const e = typeof t.edge === "number" ? normalizePercentValue(t.edge) : 0;
      return hr >= V1_HIT_RATE_FLOOR && e >= MLB_EDGE_FLOOR;
    })
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  const picks: AIPick[] = [];
  const playerPicks = selectVariedPlayerPicks(scoredProps, 2);
  const teamPicks = scoredTrends.slice(0, 1);

  for (const prop of playerPicks) {
    const pick = playerPickToAIPick(prop, date);
    pick.teamColor = prop.teamColor || MLB_TEAM_COLORS[prop.team] || "#4a9eff";
    picks.push(pick);
  }

  for (const trend of teamPicks) {
    const pick = teamTrendToAIPick(trend, date);
    pick.teamColor = trend.teamColor || MLB_TEAM_COLORS[trend.team] || "#4a9eff";
    picks.push(pick);
  }

  if (picks.length < 3) {
    const remaining = 3 - picks.length;
    const usedIds = new Set(picks.map((pick) => pick.id));

    const extraProps = scoredProps
      .filter((prop) => !playerPicks.some((selected) => selected.id === prop.id))
      .filter((prop) => !usedIds.has(`pick-${prop.id}-${date}`));
    const extraTrends = scoredTrends
      .slice(teamPicks.length)
      .filter((trend) => !usedIds.has(`pick-${trend.id}-${date}`));

    let filled = 0;
    for (const prop of extraProps) {
      if (filled >= remaining) break;
      const pick = playerPickToAIPick(prop, date);
      pick.teamColor = prop.teamColor || MLB_TEAM_COLORS[prop.team] || "#4a9eff";
      picks.push(pick);
      filled++;
    }

    for (const trend of extraTrends) {
      if (filled >= remaining) break;
      const pick = teamTrendToAIPick(trend, date);
      pick.teamColor = trend.teamColor || MLB_TEAM_COLORS[trend.team] || "#4a9eff";
      picks.push(pick);
      filled++;
    }
  }

  return picks.slice(0, 3);
}
