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
// hitRate floor: 65% hard minimum. Below 65 never reaches production — no exceptions.
// edge floor: 10% minimum model edge over implied odds.
// These gates apply to NHL, NBA, and MLB picks equally.
const V1_HIT_RATE_FLOOR = 65;
const V1_EDGE_FLOOR = 10;

// ── Volume policy (Marco 2026-04-01, production tightening) ──────────────────
// Goal: tight, trust-first production slate. Quality over quantity.
//
// Rules:
//   - No forced minimum. Zero picks is a valid output when no genuine edges exist.
//   - HARD MAX: 3 picks per sport per day — no exceptions, no strong-edge expansion.
//   - Split: up to 2 player props + up to 1 team trend = 3 total.
//   - The old soft/hard/strong-edge expansion logic is removed.
//   - System lab / sandbox runs with a wider intake (55% / 3% floors, top 10).
//     Production and system lab are strictly separate pipelines.
const PROD_MAX_PLAYER = 2;   // player prop picks — hard ceiling
const PROD_MAX_TEAM   = 1;   // team trend picks  — hard ceiling
// Combined hard maximum: PROD_MAX_PLAYER + PROD_MAX_TEAM = 3 picks per sport per day.
export const PROD_MAX_PICKS_PER_SPORT = PROD_MAX_PLAYER + PROD_MAX_TEAM;

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

  // No forced minimum — zero is valid when nothing qualifies.
  if (scoredProps.length === 0 && scoredTrends.length === 0) return [];

  // Hard max: 3 picks per sport per day (2 player + 1 team). No expansion.
  const playerPicks = selectVariedPlayerPicks(scoredProps, PROD_MAX_PLAYER);
  const teamPicks = selectDistinctTeamPicks(scoredTrends, PROD_MAX_TEAM);

  const picks: AIPick[] = [];
  for (const p of playerPicks) picks.push(playerPickToAIPick(p, date));
  for (const t of teamPicks) picks.push(teamTrendToAIPick(t, date));

  // Belt-and-suspenders: never exceed the hard max, regardless of split logic above.
  return picks.slice(0, PROD_MAX_PICKS_PER_SPORT);
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

  // No forced minimum — zero is valid when nothing qualifies.
  if (scoredProps.length === 0 && scoredTrends.length === 0) return [];

  // Hard max: 3 picks per sport per day (2 player + 1 team). No expansion.
  const playerPicks = selectVariedPlayerPicks(scoredProps, PROD_MAX_PLAYER);
  const teamPicks = selectDistinctTeamPicks(scoredTrends, PROD_MAX_TEAM);

  const picks: AIPick[] = [];
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

  // Belt-and-suspenders: never exceed the hard max.
  return picks.slice(0, PROD_MAX_PICKS_PER_SPORT);
}

export function selectMLBTopPicks(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  date: string,
): AIPick[] {
  // MLB is currently underperforming badly, so production must run materially
  // tighter than the baseline cross-sport gate until quality is restored.
  // Marco directive (2026-04-03): raise MLB production to at least 72% hit rate
  // and require a higher edge so spray dies immediately.
  const MLB_HIT_RATE_FLOOR = 72;
  const MLB_EDGE_FLOOR = 12;

  const scoredProps: ScoredPlayerProp[] = props
    .filter((p) => isPickableOdds(p.odds))
    .filter((p) => {
      const hr = normalizePercentValue(p.hitRate);
      const e = typeof p.edge === "number" ? normalizePercentValue(p.edge) : 0;
      return hr >= MLB_HIT_RATE_FLOOR && e >= MLB_EDGE_FLOOR;
    })
    .map((p) => ({ ...p, _score: scoreItem(p.hitRate, p.edge) }))
    .sort((a, b) => b._score - a._score);

  const scoredTrends: ScoredTeamTrend[] = teamTrends
    .filter((t) => isPickableOdds(t.odds))
    .filter((t) => {
      const hr = normalizePercentValue(t.hitRate);
      const e = typeof t.edge === "number" ? normalizePercentValue(t.edge) : 0;
      return hr >= MLB_HIT_RATE_FLOOR && e >= MLB_EDGE_FLOOR;
    })
    .map((t) => ({ ...t, _score: scoreItem(t.hitRate, t.edge) }))
    .sort((a, b) => b._score - a._score);

  // No forced minimum — zero is valid when nothing qualifies.
  if (scoredProps.length === 0 && scoredTrends.length === 0) return [];

  // Hard max: 3 picks per sport per day (2 player + 1 team). No expansion.
  const playerPicks = selectVariedPlayerPicks(scoredProps, PROD_MAX_PLAYER);
  // MLB team picks use direct slice (no conflict-key dedup needed here — dedup is in scoring).
  const teamPicks = selectDistinctTeamPicks(scoredTrends, PROD_MAX_TEAM);

  const picks: AIPick[] = [];
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

  // Belt-and-suspenders: never exceed the hard max.
  return picks.slice(0, PROD_MAX_PICKS_PER_SPORT);
}
