import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";

export type Goose2TrainingAudit = {
  snapshotUniverse: {
    snapshots: number;
    snapshotEvents: number;
    snapshotPrices: number;
    bySport: Array<{ sport: string; events: number; prices: number }>;
  };
  learningRails: {
    gooseModelPicks: number;
    pickHistory: number;
    systemQualifiers: number;
    pickSlates: number;
    datagolfCache: number;
  };
  recommendation: {
    readyForShadowLearning: boolean;
    readyForHistoricalCandidateBacktest: boolean;
    gaps: string[];
    nextActions: string[];
  };
};

function serviceHeaders() {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1${path}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Goose2 training audit failed ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

async function fetchCount(table: string) {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/${table}?select=id&limit=1`, {
    headers: {
      ...serviceHeaders(),
      Prefer: "count=exact",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Goose2 training audit count failed for ${table}: ${response.status} ${text.slice(0, 300)}`);
  }

  const contentRange = response.headers.get("content-range") ?? "0-0/0";
  const total = Number(contentRange.split("/")[1] ?? 0);
  return Number.isFinite(total) ? total : 0;
}

export async function buildGoose2TrainingAudit(): Promise<Goose2TrainingAudit> {
  const [
    gooseModelPicks,
    pickHistory,
    systemQualifiers,
    pickSlates,
    datagolfCache,
    snapshotEventsBySport,
    snapshotPricesBySport,
    marketSnapshots,
    marketSnapshotEvents,
    marketSnapshotPrices,
  ] = await Promise.all([
    fetchCount("goose_model_picks"),
    fetchCount("pick_history"),
    fetchCount("system_qualifiers"),
    fetchCount("pick_slates"),
    fetchCount("datagolf_cache"),
    fetchJson<Array<{ sport: string; count: number }>>(`/market_snapshot_events?select=sport,count:id&sport=not.is.null`),
    fetchJson<Array<{ sport: string; count: number }>>(`/market_snapshot_prices?select=sport,count:id&sport=not.is.null`),
    fetchCount("market_snapshots"),
    fetchCount("market_snapshot_events"),
    fetchCount("market_snapshot_prices"),
  ]);

  const sportMap = new Map<string, { events: number; prices: number }>();
  for (const row of snapshotEventsBySport) {
    sportMap.set(row.sport, { events: Number(row.count ?? 0), prices: 0 });
  }
  for (const row of snapshotPricesBySport) {
    const current = sportMap.get(row.sport) ?? { events: 0, prices: 0 };
    current.prices = Number(row.count ?? 0);
    sportMap.set(row.sport, current);
  }

  const bySport = Array.from(sportMap.entries()).map(([sport, counts]) => ({ sport, ...counts }));
  const readyForShadowLearning = marketSnapshotPrices > 0 && marketSnapshotEvents > 0;
  const readyForHistoricalCandidateBacktest = marketSnapshots >= 100 && marketSnapshotPrices >= 10000;

  const gaps: string[] = [];
  if (marketSnapshots < 100) gaps.push("snapshot archive is still shallow, so candidate-universe backtesting is not yet statistically honest");
  if (marketSnapshotPrices < 10000) gaps.push("full-market candidate history is not deep enough yet across books and timestamps");
  if (!bySport.some((row) => row.sport === "NBA" || row.sport === "NHL" || row.sport === "MLB")) gaps.push("major team-sport candidate captures are missing");
  if (gooseModelPicks === 0) gaps.push("legacy Goose comparison rail is empty");
  if (pickHistory === 0) gaps.push("published outcome rail is empty");

  return {
    snapshotUniverse: {
      snapshots: marketSnapshots,
      snapshotEvents: marketSnapshotEvents,
      snapshotPrices: marketSnapshotPrices,
      bySport,
    },
    learningRails: {
      gooseModelPicks,
      pickHistory,
      systemQualifiers,
      pickSlates,
      datagolfCache,
    },
    recommendation: {
      readyForShadowLearning,
      readyForHistoricalCandidateBacktest,
      gaps,
      nextActions: [
        "persist Goose 2.0 shadow runs on every fresh snapshot capture",
        "join legacy goose_model_picks against pick_history for outcome comparison baselines",
        "keep archiving every candidate, every price, and later every player prop before trusting any ML training claims",
      ],
    },
  };
}
