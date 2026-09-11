export type NFLLearningSignalSnapshot = {
  test_wins?: number | null;
  test_losses?: number | null;
  test_pushes?: number | null;
  test_sample?: number | null;
  signal_key?: string | null;
  promotion_status?: string | null;
};

export type NFLShadowCandidate = {
  id: string;
  candidate_id: string;
  pick_date: string;
  market_type: string;
  side: string | null;
  line: number | null;
  odds: number | null;
  sportsbook: string | null;
  team_name: string | null;
  opponent_name: string | null;
  confidence_score: number | null;
  model_score: number | null;
  evidence_snapshot: {
    edge?: number | null;
    primary_learning_signal?: NFLLearningSignalSnapshot | null;
    primary_system_edge_signal?: NFLLearningSignalSnapshot | null;
    [key: string]: unknown;
  } | null;
  status: string | null;
  result: string | null;
  recorded_at: string | null;
  capture_ts: string | null;
  commence_time: string | null;
  home_team: string | null;
  away_team: string | null;
};

export type NFLPickSelectionOptions = {
  now?: string;
  maxAgeHours?: number;
  limit?: number;
  productionHitRate?: number;
  productionEdge?: number;
};

export type NFLPickSelection = {
  learningRows: NFLShadowCandidate[];
  productionRows: NFLShadowCandidate[];
  rejectedStale: number;
  rejectedStarted: number;
  duplicatesCollapsed: number;
};

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function nflDisplayDate(commenceTime: string | null | undefined) {
  const date = commenceTime ? new Date(commenceTime) : null;
  if (!date || Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nflShadowHitRate(row: NFLShadowCandidate) {
  const signal = row.evidence_snapshot?.primary_system_edge_signal
    ?? row.evidence_snapshot?.primary_learning_signal;
  const wins = numeric(signal?.test_wins);
  const losses = numeric(signal?.test_losses);
  const decisions = wins + losses;
  return decisions > 0 ? (wins / decisions) * 100 : 0;
}

export function nflShadowEdge(row: NFLShadowCandidate) {
  const edge = numeric(row.evidence_snapshot?.edge);
  return Math.abs(edge) <= 1 ? edge * 100 : edge;
}

function primarySignal(row: NFLShadowCandidate) {
  return row.evidence_snapshot?.primary_system_edge_signal
    ?? row.evidence_snapshot?.primary_learning_signal
    ?? null;
}

function isProductionEligibleSignal(row: NFLShadowCandidate) {
  const status = String(primarySignal(row)?.promotion_status ?? "").trim().toLowerCase();
  return status === "eligible" || status === "promoted";
}

function freshnessMs(row: NFLShadowCandidate) {
  const date = row.capture_ts ? new Date(row.capture_ts) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function matchupKey(row: NFLShadowCandidate) {
  const home = String(row.home_team ?? "").trim().toLowerCase();
  const away = String(row.away_team ?? "").trim().toLowerCase();
  const matchup = home && away
    ? `${away}@${home}`
    : String(row.opponent_name ?? row.team_name ?? row.candidate_id).trim().toLowerCase();
  return [nflDisplayDate(row.commence_time) ?? row.pick_date, matchup, row.market_type].join("|");
}

function compareRows(left: NFLShadowCandidate, right: NFLShadowCandidate) {
  const hitRate = nflShadowHitRate(right) - nflShadowHitRate(left);
  if (hitRate !== 0) return hitRate;

  const edge = nflShadowEdge(right) - nflShadowEdge(left);
  if (edge !== 0) return edge;

  const freshness = freshnessMs(right) - freshnessMs(left);
  if (freshness !== 0) return freshness;

  return numeric(right.odds, -100000) - numeric(left.odds, -100000);
}

export function selectNFLPickRows(
  rows: NFLShadowCandidate[],
  options: NFLPickSelectionOptions = {},
): NFLPickSelection {
  const nowMs = new Date(options.now ?? Date.now()).getTime();
  const maxAgeMs = numeric(options.maxAgeHours, 36) * 60 * 60 * 1000;
  const limit = Math.max(1, Math.floor(numeric(options.limit, 3)));
  const productionHitRate = numeric(options.productionHitRate, 65);
  const productionEdge = numeric(options.productionEdge, 10);

  const freshPriceRows = rows.filter((row) => {
    const capturedAt = freshnessMs(row);
    return capturedAt > 0 && capturedAt <= nowMs && nowMs - capturedAt <= maxAgeMs;
  });
  const rejectedStale = rows.length - freshPriceRows.length;
  const freshRows = freshPriceRows.filter((row) => {
    const commenceAt = row.commence_time ? new Date(row.commence_time).getTime() : Number.NaN;
    return Number.isFinite(commenceAt) && commenceAt > nowMs;
  });
  const rejectedStarted = freshPriceRows.length - freshRows.length;

  const byGameMarket = new Map<string, NFLShadowCandidate>();
  for (const row of freshRows) {
    const key = matchupKey(row);
    const existing = byGameMarket.get(key);
    if (!existing || compareRows(row, existing) < 0) byGameMarket.set(key, row);
  }

  const actionableRows = Array.from(byGameMarket.values()).sort(compareRows).slice(0, limit);
  const productionRows = actionableRows.filter((row) => (
    isProductionEligibleSignal(row)
    && nflShadowHitRate(row) >= productionHitRate
    && nflShadowEdge(row) >= productionEdge
  ));
  const productionIds = new Set(productionRows.map((row) => row.id));
  const learningRows = actionableRows.filter((row) => !productionIds.has(row.id));

  return {
    learningRows,
    productionRows,
    rejectedStale,
    rejectedStarted,
    duplicatesCollapsed: freshRows.length - byGameMarket.size,
  };
}

export default {
  nflDisplayDate,
  nflShadowEdge,
  nflShadowHitRate,
  selectNFLPickRows,
};
