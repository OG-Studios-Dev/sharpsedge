import { qualifiesAsTrend } from "@/lib/trend-filter";
import { League, PlayerProp, SGP, TeamTrend } from "@/lib/types";

export type SportsLeague = "All" | "NHL" | "NBA" | "MLB";
export type ClubLineFilter = "all" | "main" | "alt";
export type VenueFilter = "all" | "home" | "away";

export type TrendRow = {
  id: string;
  kind: "player" | "team";
  league: "NHL" | "NBA" | "MLB";
  team: string;
  teamColor: string;
  opponent: string;
  isAway: boolean;
  title: string;
  subtitle: string;
  marketLabel: string;
  lineLabel?: string;
  odds?: number;
  book?: string;
  hitRate: number;
  hits: number;
  total: number;
  recordLabel: string;
  lineType: "main" | "alt";
  gameId?: string;
  score: number;
};

export type QuickHitterRow = TrendRow & { paceLabel: "1P" | "1Q" | "BAT" | "ARM" | "LOW" };

const MAIN_TEAM_BET_TYPES = new Set([
  "Team Goals O/U",
  "Team Points O/U",
  "Total Runs O/U",
  "Run Line",
  "Team Win ML",
  "ML Home Win",
  "ML Road Win",
]);

function normalizePercent(value?: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function normalizeEdge(value?: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function toSportsLeague(league: League): "NHL" | "NBA" | "MLB" | null {
  if (league === "NHL" || league === "NBA" || league === "MLB") return league;
  return null;
}

function getSample(item: { splits: { hits: number; total: number }[] }, fallbackTotal = 0) {
  const primary = item.splits.find((split) => split.total > 0) ?? item.splits[0];
  const hits = primary?.hits ?? 0;
  const total = primary?.total ?? fallbackTotal;
  return {
    hits,
    total,
  };
}

function buildMatchupLabel(team: string, opponent: string, isAway: boolean) {
  return `${team} ${isAway ? "@" : "vs"} ${opponent}`;
}

function classifyPropLine(prop: PlayerProp): "main" | "alt" {
  if (prop.book === "Model Line") return "main";
  return Math.abs(prop.odds) > 140 ? "alt" : "main";
}

function classifyTeamLine(trend: TeamTrend): "main" | "alt" {
  if (MAIN_TEAM_BET_TYPES.has(trend.betType)) return "main";
  return "alt";
}

function computeTrendScore(hitRate: number, total: number, edge?: number | null) {
  return hitRate + Math.min(total, 10) * 1.5 + Math.max(normalizeEdge(edge), 0) * 0.5;
}

function propToTrendRow(prop: PlayerProp): TrendRow | null {
  const league = toSportsLeague(prop.league);
  if (!league) return null;

  const hitRate = normalizePercent(prop.hitRate ?? prop.fairProbability);
  const sample = getSample(prop, prop.recentGames?.length ?? 0);
  const lineLabel = `${prop.overUnder} ${prop.line} ${prop.propType}`;

  return {
    id: `prop-${prop.id}`,
    kind: "player",
    league,
    team: prop.team,
    teamColor: prop.teamColor,
    opponent: prop.opponent,
    isAway: prop.isAway,
    title: prop.playerName,
    subtitle: buildMatchupLabel(prop.team, prop.opponent, prop.isAway),
    marketLabel: lineLabel,
    lineLabel,
    odds: prop.odds,
    book: prop.book,
    hitRate,
    hits: sample.hits,
    total: sample.total,
    recordLabel: sample.total > 0 ? `${sample.hits}/${sample.total}` : `${Math.round(hitRate)}%`,
    lineType: classifyPropLine(prop),
    gameId: prop.gameId,
    score: computeTrendScore(hitRate, sample.total, prop.edge ?? prop.edgePct),
  };
}

function teamTrendToTrendRow(trend: TeamTrend): TrendRow | null {
  const league = toSportsLeague(trend.league);
  if (!league) return null;

  const hitRate = normalizePercent(trend.hitRate);
  const sample = getSample(trend);
  const lineLabel = trend.line ? `${trend.betType} ${trend.line}` : trend.betType;

  return {
    id: `team-${trend.id}`,
    kind: "team",
    league,
    team: trend.team,
    teamColor: trend.teamColor,
    opponent: trend.opponent,
    isAway: trend.isAway,
    title: trend.team,
    subtitle: buildMatchupLabel(trend.team, trend.opponent, trend.isAway),
    marketLabel: lineLabel,
    lineLabel,
    odds: trend.odds,
    book: trend.book,
    hitRate,
    hits: sample.hits,
    total: sample.total,
    recordLabel: sample.total > 0 ? `${sample.hits}/${sample.total}` : `${Math.round(hitRate)}%`,
    lineType: classifyTeamLine(trend),
    gameId: trend.gameId,
    score: computeTrendScore(hitRate, sample.total, trend.edge),
  };
}

function sortRows(rows: TrendRow[]) {
  return rows.sort((a, b) => (
    b.score - a.score
    || b.hitRate - a.hitRate
    || b.total - a.total
    || a.title.localeCompare(b.title)
  ));
}

export function normalizeSportsLeague(league: League): SportsLeague {
  if (league === "All" || league === "NBA" || league === "NHL" || league === "MLB") return league;
  return "NHL";
}

export function buildClubRows(
  props: PlayerProp[],
  teamTrends: TeamTrend[],
  filters: { lineType?: ClubLineFilter; venue?: VenueFilter } = {},
): TrendRow[] {
  const lineType = filters.lineType ?? "all";
  const venue = filters.venue ?? "all";

  const rows = [
    ...props.map(propToTrendRow),
    ...teamTrends.map(teamTrendToTrendRow),
  ].filter((row): row is TrendRow => Boolean(row))
    .filter((row) => row.hitRate >= 80 && row.total >= 5)
    .filter((row) => lineType === "all" || row.lineType === lineType)
    .filter((row) => venue === "all" || (venue === "away" ? row.isAway : !row.isAway));

  return sortRows(rows);
}

export function buildTrendingRows(props: PlayerProp[], count = 5): TrendRow[] {
  const rows = props
    .filter(qualifiesAsTrend)
    .map(propToTrendRow)
    .filter((row): row is TrendRow => Boolean(row));

  return sortRows(rows).slice(0, count);
}

function getQuickHitterPace(prop: PlayerProp): "1P" | "1Q" | "BAT" | "ARM" | "LOW" | null {
  if (prop.league === "NHL") return "LOW"; // Low-line full game props (1P player props don't exist on books)
  if (prop.league === "NBA") return "1Q";
  if (prop.league === "MLB") {
    const market = prop.propType.toLowerCase();
    return market.includes("strikeout") || market.includes("innings") || market.includes("earned") || market.includes("allowed")
      ? "ARM"
      : "BAT";
  }
  return null;
}

function qualifiesAsQuickHitter(prop: PlayerProp) {
  const league = toSportsLeague(prop.league);
  if (!league) return false;

  const hitRate = normalizePercent(prop.hitRate ?? prop.fairProbability);
  if (hitRate < 55) return false;

  const market = prop.propType.toLowerCase();
  if (league === "NHL") {
    return (
      ((market.includes("goal") || market.includes("assist") || market.includes("point")) && prop.line <= 1.5)
      || (market.includes("shot") && prop.line <= 2.5)
    );
  }

  if (league === "MLB") {
    return (
      (market.includes("hit") && prop.line <= 1.5)
      || (market.includes("total bases") && prop.line <= 1.5)
      || (market.includes("home run") && prop.line <= 0.5)
      || (market.includes("rbi") && prop.line <= 1.5)
      || (market.includes("run") && prop.line <= 1.5)
      || (market.includes("stolen") && prop.line <= 0.5)
      || (market.includes("strikeout") && prop.line <= 5.5)
    );
  }

  return (
    (market.includes("point") && prop.line <= 8.5)
    || (market.includes("rebound") && prop.line <= 3.5)
    || (market.includes("assist") && prop.line <= 2.5)
    || ((market.includes("3pm") || market.includes("3pt") || market.includes("three")) && prop.line <= 1.5)
  );
}

export function buildQuickHitters(_props: PlayerProp[], count = 5, teamTrends: TeamTrend[] = []): QuickHitterRow[] {
  // Quick Hitters = TEAMS & TOTALS ONLY (1P, 1Q, early markets)
  // No player props — only team ML, totals, and spreads for early periods

  const teamRows = teamTrends
    .filter((t) => {
      const hr = typeof t.hitRate === "number" ? t.hitRate : 0;
      if (t.betType === "1P ML" || t.betType === "1Q ML") return hr >= 55;
      if (t.betType === "1P Total" || t.betType === "1Q Total") return hr >= 55;
      if (t.betType === "Team Goals O/U" || t.betType === "Team Points O/U") return hr >= 60;
      return false;
    })
    .map((t) => {
      const row = teamTrendToTrendRow(t);
      if (!row) return null;
      const paceLabel = t.league === "NHL" ? "1P" as const
        : t.league === "NBA" ? "1Q" as const
        : "BAT" as const;
      return { ...row, paceLabel };
    })
    .filter(Boolean) as QuickHitterRow[];

  return teamRows
    .sort((a, b) => (
      b.hitRate - a.hitRate
      || b.score - a.score
      || b.total - a.total
      || a.title.localeCompare(b.title)
    ))
    .slice(0, count);
}

function uniquePropSelections(props: PlayerProp[]) {
  const selected: PlayerProp[] = [];
  const players = new Set<string>();
  const markets = new Set<string>();

  for (const prop of props) {
    const playerKey = `${prop.league}:${prop.playerName.toLowerCase()}`;
    const marketKey = `${prop.team}:${prop.propType}:${prop.overUnder}`;
    if (players.has(playerKey) || markets.has(marketKey)) continue;

    selected.push(prop);
    players.add(playerKey);
    markets.add(marketKey);
  }

  return selected;
}

function computeCombinedHitRate(legs: PlayerProp[]) {
  return legs.reduce((acc, leg) => acc * (normalizePercent(leg.hitRate) / 100), 1);
}

function computeTrackedParlaySample(legs: PlayerProp[]) {
  const sampleSize = Math.min(...legs.map((leg) => leg.recentGames?.length ?? 0));
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) {
    return { hits: 0, total: 0 };
  }

  let hits = 0;
  for (let index = 0; index < sampleSize; index++) {
    const allLegsHit = legs.every((leg) => {
      const value = leg.recentGames?.[index];
      if (typeof value !== "number") return false;
      return leg.overUnder === "Under" ? value < leg.line : value > leg.line;
    });

    if (allLegsHit) hits++;
  }

  return {
    hits,
    total: sampleSize,
  };
}

function buildSGPMatchup(legs: PlayerProp[]) {
  const topLeg = legs[0];
  return topLeg.isAway
    ? `${topLeg.team} @ ${topLeg.opponent}`
    : `${topLeg.opponent} @ ${topLeg.team}`;
}

export function buildSGPSuggestions(props: PlayerProp[], limit = 6): SGP[] {
  const grouped = new Map<string, PlayerProp[]>();

  for (const prop of props) {
    const league = toSportsLeague(prop.league);
    const hitRate = normalizePercent(prop.hitRate);
    const sample = getSample(prop, prop.recentGames?.length ?? 0);
    if (!league || !prop.gameId || hitRate < 55 || sample.total < 3) continue;

    const key = `${league}:${prop.gameId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(prop);
  }

  const sgps: SGP[] = [];

  for (const [key, group] of Array.from(grouped.entries())) {
    const sorted = [...group].sort((a, b) => (
      normalizePercent(b.hitRate) - normalizePercent(a.hitRate)
      || normalizeEdge(b.edge ?? b.edgePct) - normalizeEdge(a.edge ?? a.edgePct)
    ));
    const selected = uniquePropSelections(sorted);
    const baseLegs = selected.slice(0, 2);
    if (baseLegs.length < 2) continue;

    const thirdLeg = selected[2];
    const legs = thirdLeg && normalizePercent(thirdLeg.hitRate) >= 70
      ? [...baseLegs, thirdLeg]
      : baseLegs;

    const combinedHitRate = computeCombinedHitRate(legs);
    const trackedParlaySample = computeTrackedParlaySample(legs);
    const matchup = buildSGPMatchup(legs);
    const league = toSportsLeague(legs[0].league);
    if (!league) continue;

    sgps.push({
      id: `sgp-${key}`,
      matchup,
      gameId: legs[0].gameId,
      league,
      combinedHitRate: Number((combinedHitRate * 100).toFixed(1)),
      legCount: legs.length,
      indicators: [{ type: "hot", active: true }],
      splits: [
        {
          label: trackedParlaySample.total > 0
            ? `Parlay hit in ${trackedParlaySample.hits} of ${trackedParlaySample.total} tracked games`
            : `${legs.length}-leg SGP`,
          hitRate: trackedParlaySample.total > 0
            ? Number(((trackedParlaySample.hits / trackedParlaySample.total) * 100).toFixed(1))
            : Number((combinedHitRate * 100).toFixed(1)),
          hits: trackedParlaySample.hits,
          total: trackedParlaySample.total,
          type: "last_n",
        },
      ],
      legs: legs.map((leg) => {
        const sample = getSample(leg, leg.recentGames?.length ?? 0);
        return {
          playerName: leg.playerName,
          team: leg.team,
          teamColor: leg.teamColor,
          opponent: leg.opponent,
          propType: leg.propType,
          line: leg.line,
          overUnder: leg.overUnder,
          odds: leg.odds,
          book: leg.book,
          hitRate: normalizePercent(leg.hitRate),
          hits: sample.hits,
          total: sample.total,
          league,
          gameId: leg.gameId,
        };
      }),
    });
  }

  return sgps.sort((a, b) => (
    (b.combinedHitRate ?? 0) - (a.combinedHitRate ?? 0)
    || (b.legCount ?? 0) - (a.legCount ?? 0)
  )).slice(0, limit);
}
