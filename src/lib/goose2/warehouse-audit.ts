import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";

const CORE_TEAM_MARKETS = ["moneyline", "spread", "total"] as const;
const FAST_SETTLE_SPORTS = new Set(["NBA", "NHL", "MLB", "NFL"]);
const PLAYER_PROP_PREFIX = "player_prop_";

type CountResponse = { total: number | null; rows: any[] | null };

type CandidateAuditRow = {
  candidate_id: string;
  event_id: string;
  sport: string;
  event_date: string;
  market_type: string;
  capture_ts: string;
  goose_market_results?:
    | { result?: string | null; integrity_status?: string | null }
    | Array<{ result?: string | null; integrity_status?: string | null }>
    | null;
  goose_market_events?:
    | { status?: string | null; commence_time?: string | null; home_team?: string | null; away_team?: string | null }
    | Array<{ status?: string | null; commence_time?: string | null; home_team?: string | null; away_team?: string | null }>
    | null;
};

export type Goose2WarehouseAudit = {
  checkedAt: string;
  ok: boolean;
  summary: string;
  counts: {
    snapshotsLast24h: number;
    candidatesLast24h: number;
    resultsLast36h: number;
    stalePendingQualifiers: number;
    auditedPregameEvents: number;
    eventsMissingCoreMarkets: number;
    playerPropRowsLast24h: number;
    auditedSettleableCandidates: number;
    settleableCandidatesMissingTerminalResult: number;
  };
  capture: {
    coreMarkets: string[];
    auditedEventCount: number;
    coreMarketCoverageBySport: Record<string, Record<string, number>>;
    supplementalMarketCounts: Record<string, number>;
    playerPropRowsLast24h: number;
    playerPropSportsCovered: string[];
    eventsMissingCoreMarkets: Array<{
      eventId: string;
      sport: string;
      eventDate: string;
      commenceTime: string | null;
      matchup: string;
      missingMarkets: string[];
      observedMarkets: string[];
    }>;
  };
  settlement: {
    auditedCandidateCount: number;
    missingTerminalCount: number;
    missingTerminalBySport: Record<string, number>;
    explicitManualReviewCount: number;
    explicitUnresolvableCount: number;
    eventsWithMissingTerminalResults: Array<{
      eventId: string;
      sport: string;
      eventDate: string;
      matchup: string;
      missingCandidateCount: number;
      sampleMarkets: string[];
    }>;
  };
  notes: string[];
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "count=exact",
    ...extra,
  };
}

async function postgrest(path: string): Promise<CountResponse> {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1${path}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Warehouse audit query failed ${response.status}: ${text.slice(0, 300)}`);
  }
  const rows = text ? JSON.parse(text) : null;
  const contentRange = response.headers.get("content-range");
  const total = contentRange ? Number(contentRange.split("/")[1] || 0) : null;
  return { total, rows };
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function terminalResult(result?: string | null, integrity?: string | null) {
  const resultValue = String(result ?? "").toLowerCase();
  const integrityValue = String(integrity ?? "").toLowerCase();
  return ["win", "loss", "push", "void", "cancelled", "ungradeable"].includes(resultValue)
    || ["ok", "void", "cancelled", "postponed", "unresolvable", "manual_review"].includes(integrityValue);
}

function groupCount(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeStatus(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function isPregameAuditCandidate(row: CandidateAuditRow, nowMs: number, todayKey: string) {
  const event = relationOne(row.goose_market_events);
  const status = normalizeStatus(event?.status);
  if (["final", "cancelled", "postponed"].includes(status)) return false;

  const commenceMs = event?.commence_time ? Date.parse(event.commence_time) : Number.NaN;
  if (Number.isFinite(commenceMs)) {
    return commenceMs >= nowMs - 6 * 60 * 60 * 1000;
  }

  return String(row.event_date || "") >= todayKey;
}

function isSettleableAuditCandidate(row: CandidateAuditRow, yesterdayKey: string) {
  const event = relationOne(row.goose_market_events);
  const status = normalizeStatus(event?.status);
  if (status === "final") return true;
  if (!FAST_SETTLE_SPORTS.has(String(row.sport || "").toUpperCase())) return false;
  return Boolean(row.event_date) && row.event_date <= yesterdayKey;
}

export async function buildGoose2WarehouseAudit(): Promise<Goose2WarehouseAudit> {
  const checkedAt = new Date().toISOString();
  const nowMs = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last7DateKey = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last36h = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const select = "candidate_id,event_id,sport,event_date,market_type,capture_ts,goose_market_events!inner(status,commence_time,home_team,away_team),goose_market_results(result,integrity_status)";

  const [snapshots, recentCandidates, recentResults, stalePending, settlementCandidates] = await Promise.all([
    postgrest(`/market_snapshots?select=id,captured_at&captured_at=gte.${encodeURIComponent(last24h)}&order=captured_at.desc&limit=20`),
    postgrest(`/goose_market_candidates?select=${select}&capture_ts=gte.${encodeURIComponent(last24h)}&order=capture_ts.desc&limit=10000`),
    postgrest(`/goose_market_results?select=candidate_id,settlement_ts,result,integrity_status&settlement_ts=gte.${encodeURIComponent(last36h)}&order=settlement_ts.desc&limit=10000`),
    postgrest(`/system_qualifiers?select=id,system_id,created_at,settlement_status&settlement_status=eq.pending&created_at=lt.${encodeURIComponent(last24h)}&limit=200`),
    postgrest(`/goose_market_candidates?select=${select}&event_date=gte.${last7DateKey}&order=event_date.desc,capture_ts.desc&limit=20000`),
  ]);

  const snapshotCount = snapshots.rows?.length ?? 0;
  const recentCandidateRows = (recentCandidates.rows ?? []) as CandidateAuditRow[];
  const recentResultCount = recentResults.rows?.length ?? 0;
  const stalePendingCount = stalePending.rows?.length ?? 0;
  const settlementRows = (settlementCandidates.rows ?? []) as CandidateAuditRow[];

  const pregameRows = recentCandidateRows.filter((row) => isPregameAuditCandidate(row, nowMs, todayKey));
  const pregameEvents = new Map<string, {
    sport: string;
    eventDate: string;
    commenceTime: string | null;
    matchup: string;
    marketTypes: Set<string>;
  }>();

  for (const row of pregameRows) {
    const event = relationOne(row.goose_market_events);
    const existing = pregameEvents.get(row.event_id) ?? {
      sport: row.sport,
      eventDate: row.event_date,
      commenceTime: event?.commence_time ?? null,
      matchup: [event?.away_team, event?.home_team].filter(Boolean).join(" @ ") || row.event_id,
      marketTypes: new Set<string>(),
    };
    existing.marketTypes.add(row.market_type);
    pregameEvents.set(row.event_id, existing);
  }

  const eventsMissingCoreMarkets = Array.from(pregameEvents.entries())
    .map(([eventId, event]) => {
      const observedMarkets = Array.from(event.marketTypes).sort((a, b) => a.localeCompare(b));
      const missingMarkets = CORE_TEAM_MARKETS.filter((market) => !event.marketTypes.has(market));
      return {
        eventId,
        sport: event.sport,
        eventDate: event.eventDate,
        commenceTime: event.commenceTime,
        matchup: event.matchup,
        missingMarkets,
        observedMarkets,
      };
    })
    .filter((event) => event.missingMarkets.length > 0)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, 25);

  const coreMarketCoverageBySport = pregameRows.reduce<Record<string, Record<string, number>>>((acc, row) => {
    const sport = String(row.sport || "UNKNOWN").toUpperCase();
    acc[sport] ??= {};
    acc[sport][row.market_type] = (acc[sport][row.market_type] ?? 0) + 1;
    return acc;
  }, {});

  const supplementalMarketCounts = groupCount(
    recentCandidateRows
      .map((row) => row.market_type)
      .filter((market) => !CORE_TEAM_MARKETS.includes(market as (typeof CORE_TEAM_MARKETS)[number])),
  );

  const playerPropRows = recentCandidateRows.filter((row) => row.market_type.startsWith(PLAYER_PROP_PREFIX));
  const playerPropSportsCovered = Array.from(new Set(playerPropRows.map((row) => String(row.sport || "").toUpperCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const settleableRows = settlementRows.filter((row) => isSettleableAuditCandidate(row, yesterdayKey));
  const missingTerminalRows = settleableRows.filter((row) => {
    const result = relationOne(row.goose_market_results);
    return !terminalResult(result?.result, result?.integrity_status);
  });

  const eventsWithMissingTerminalResults = Object.values(
    missingTerminalRows.reduce<Record<string, {
      eventId: string;
      sport: string;
      eventDate: string;
      matchup: string;
      missingCandidateCount: number;
      sampleMarkets: Set<string>;
    }>>((acc, row) => {
      const event = relationOne(row.goose_market_events);
      const existing = acc[row.event_id] ?? {
        eventId: row.event_id,
        sport: row.sport,
        eventDate: row.event_date,
        matchup: [event?.away_team, event?.home_team].filter(Boolean).join(" @ ") || row.event_id,
        missingCandidateCount: 0,
        sampleMarkets: new Set<string>(),
      };
      existing.missingCandidateCount += 1;
      if (existing.sampleMarkets.size < 6) existing.sampleMarkets.add(row.market_type);
      acc[row.event_id] = existing;
      return acc;
    }, {}),
  )
    .map((event) => ({
      ...event,
      sampleMarkets: Array.from(event.sampleMarkets).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.missingCandidateCount - a.missingCandidateCount)
    .slice(0, 25);

  const explicitManualReviewCount = settleableRows.filter((row) => {
    const result = relationOne(row.goose_market_results);
    return String(result?.integrity_status ?? "").toLowerCase() === "manual_review";
  }).length;

  const explicitUnresolvableCount = settleableRows.filter((row) => {
    const result = relationOne(row.goose_market_results);
    return String(result?.integrity_status ?? "").toLowerCase() === "unresolvable";
  }).length;

  const missingTerminalBySport = groupCount(missingTerminalRows.map((row) => String(row.sport || "UNKNOWN").toUpperCase()));

  const notes: string[] = [];
  if (snapshotCount === 0) notes.push("No snapshot rows landed in the last 24h.");
  if (recentCandidateRows.length === 0) notes.push("No candidate rows landed in the last 24h.");
  if (playerPropRows.length === 0) notes.push("No player-prop candidate rows landed in the last 24h.");
  if (eventsMissingCoreMarkets.length > 0) notes.push(`${eventsMissingCoreMarkets.length} recent pregame event(s) are missing one or more core team markets.`);
  if (missingTerminalRows.length > 0) notes.push(`${missingTerminalRows.length} settleable candidate row(s) still lack a terminal result.`);
  if (stalePendingCount > 0) notes.push(`${stalePendingCount} system qualifier row(s) are still pending after 24h.`);
  if (!notes.length) notes.push("Daily warehouse rails look healthy: recent snapshots landed, candidate coverage is present, and settleable candidates have terminal results.");

  const ok = snapshotCount > 0
    && recentCandidateRows.length > 0
    && stalePendingCount === 0
    && eventsMissingCoreMarkets.length === 0
    && missingTerminalRows.length === 0;

  const summary = ok
    ? `Goose2 warehouse verification passed. snapshots=${snapshotCount}, candidates=${recentCandidateRows.length}, pregame_events=${pregameEvents.size}, settleable_missing_terminal=0, stale_pending=${stalePendingCount}.`
    : `Goose2 warehouse verification failed. snapshots=${snapshotCount}, candidates=${recentCandidateRows.length}, missing_core_events=${eventsMissingCoreMarkets.length}, settleable_missing_terminal=${missingTerminalRows.length}, stale_pending=${stalePendingCount}.`;

  return {
    checkedAt,
    ok,
    summary,
    counts: {
      snapshotsLast24h: snapshotCount,
      candidatesLast24h: recentCandidateRows.length,
      resultsLast36h: recentResultCount,
      stalePendingQualifiers: stalePendingCount,
      auditedPregameEvents: pregameEvents.size,
      eventsMissingCoreMarkets: eventsMissingCoreMarkets.length,
      playerPropRowsLast24h: playerPropRows.length,
      auditedSettleableCandidates: settleableRows.length,
      settleableCandidatesMissingTerminalResult: missingTerminalRows.length,
    },
    capture: {
      coreMarkets: Array.from(CORE_TEAM_MARKETS),
      auditedEventCount: pregameEvents.size,
      coreMarketCoverageBySport,
      supplementalMarketCounts,
      playerPropRowsLast24h: playerPropRows.length,
      playerPropSportsCovered,
      eventsMissingCoreMarkets,
    },
    settlement: {
      auditedCandidateCount: settleableRows.length,
      missingTerminalCount: missingTerminalRows.length,
      missingTerminalBySport,
      explicitManualReviewCount,
      explicitUnresolvableCount,
      eventsWithMissingTerminalResults,
    },
    notes,
  };
}
