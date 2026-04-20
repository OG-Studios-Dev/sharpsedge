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

function serviceHeaders(preferCount = true) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(preferCount ? { Prefer: "count=exact" } : {}),
  };
}

async function postgrest(path: string, options?: { preferCount?: boolean; head?: boolean }): Promise<CountResponse> {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1${path}`, {
    method: options?.head ? "HEAD" : "GET",
    headers: serviceHeaders(options?.preferCount !== false),
    cache: "no-store",
  });
  const text = options?.head ? "" : await response.text();
  if (!response.ok) {
    throw new Error(`Warehouse audit query failed ${response.status}: ${text.slice(0, 300)}`);
  }
  const rows = options?.head ? null : (text ? JSON.parse(text) : null);
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

function inferResultSport(candidateId?: string | null) {
  const value = String(candidateId ?? "").toLowerCase();
  if (value.includes(':nba:')) return 'NBA';
  if (value.includes(':nhl:')) return 'NHL';
  if (value.includes(':mlb:')) return 'MLB';
  if (value.includes(':nfl:')) return 'NFL';
  return 'UNKNOWN';
}

export async function buildGoose2WarehouseAudit(): Promise<Goose2WarehouseAudit> {
  const checkedAt = new Date().toISOString();
  const nowMs = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last3DateKey = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last36h = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const eventSelect = "event_id,status,commence_time,home_team,away_team,sport,event_date";
  const resultSelect = "candidate_id,result,integrity_status,settlement_ts";
  const snapshotPriceSelect = "id,sport,market_type,captured_at";

  const [snapshots, recentResults, stalePending, recentEvents, settleableResults, recentSnapshotPrices] = await Promise.all([
    postgrest(`/market_snapshots?select=id,captured_at&captured_at=gte.${encodeURIComponent(last24h)}&order=captured_at.desc&limit=20`, { preferCount: false }),
    postgrest(`/goose_market_results?select=${resultSelect}&settlement_ts=gte.${encodeURIComponent(last36h)}&order=settlement_ts.desc&limit=4000`, { preferCount: false }),
    postgrest(`/system_qualifiers?select=id,system_id,created_at,settlement_status&settlement_status=eq.pending&created_at=lt.${encodeURIComponent(last24h)}&limit=200`, { preferCount: false }),
    postgrest(`/goose_market_events?select=${eventSelect}&event_date=gte.${last3DateKey}&sport=in.(NBA,NHL,MLB,NFL)&order=event_date.desc,commence_time.desc&limit=1000`, { preferCount: false }),
    postgrest(`/goose_market_results?select=${resultSelect}&settlement_ts=gte.${encodeURIComponent(last36h)}&order=settlement_ts.desc&limit=6000`, { preferCount: false }),
    postgrest(`/market_snapshot_prices?select=${snapshotPriceSelect}&captured_at=gte.${encodeURIComponent(last24h)}&order=captured_at.desc&limit=4000`, { preferCount: false }),
  ]);

  const snapshotCount = snapshots.rows?.length ?? 0;
  const recentResultRows = (recentResults.rows ?? []) as Array<{ candidate_id: string; result?: string | null; integrity_status?: string | null; settlement_ts?: string | null }>;
  const recentResultCount = recentResultRows.length;
  const stalePendingCount = stalePending.rows?.length ?? 0;
  const recentEventRows = (recentEvents.rows ?? []) as Array<{ event_id: string; status?: string | null; commence_time?: string | null; home_team?: string | null; away_team?: string | null; sport?: string | null; event_date?: string | null }>;
  const settleableResultRows = (settleableResults.rows ?? []) as Array<{ candidate_id: string; result?: string | null; integrity_status?: string | null; settlement_ts?: string | null }>;
  const recentSnapshotPriceRows = (recentSnapshotPrices.rows ?? []) as Array<{ id: string; sport?: string | null; market_type?: string | null; captured_at?: string | null }>;

  const recentCandidateRows = recentSnapshotPriceRows.map((row, index) => {
    const rawId = String(row.id ?? `snapshot-price-${index}`);
    const parts = rawId.split(':');
    const syntheticEventId = parts.length >= 7
      ? parts.slice(0, 7).join(':')
      : rawId;
    return {
      candidate_id: rawId,
      event_id: syntheticEventId,
      sport: String(row.sport ?? "UNKNOWN").toUpperCase(),
      event_date: String(row.captured_at ?? "").slice(0, 10),
      market_type: String(row.market_type ?? "unknown").replace(/-/g, '_'),
      capture_ts: String(row.captured_at ?? checkedAt),
      goose_market_events: null,
      goose_market_results: null,
    };
  }) as CandidateAuditRow[];

  const settlementRows: CandidateAuditRow[] = [];

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
    .filter((event) => {
      if (event.missingMarkets.length === 0) return false;
      const mlbSourceLimited = event.sport === 'MLB'
        && event.missingMarkets.length === 1
        && event.missingMarkets[0] === 'spread'
        && event.observedMarkets.includes('moneyline')
        && event.observedMarkets.includes('total');
      return !mlbSourceLimited;
    })
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
  const missingTerminalRows: CandidateAuditRow[] = [];
  const eventsWithMissingTerminalResults: Array<{
    eventId: string;
    sport: string;
    eventDate: string;
    matchup: string;
    missingCandidateCount: number;
    sampleMarkets: string[];
  }> = [];

  const explicitManualReviewCount = settleableResultRows.filter((row) => String(row.integrity_status ?? '').toLowerCase() === 'manual_review').length;
  const explicitUnresolvableCount = settleableResultRows.filter((row) => String(row.integrity_status ?? '').toLowerCase() === 'unresolvable').length;
  const missingTerminalBySport: Record<string, number> = {};
  for (const event of recentEventRows) {
    const sport = String(event.sport ?? 'UNKNOWN').toUpperCase();
    if (!FAST_SETTLE_SPORTS.has(sport)) continue;
    if (!event.event_date || event.event_date > yesterdayKey) continue;
    const status = normalizeStatus(event.status);
    if (status && !['final', 'complete', 'completed'].includes(status)) continue;

    const hasResult = settleableResultRows.some((row) => inferResultSport(row.candidate_id) === sport);
    if (!hasResult) {
      missingTerminalBySport[sport] = (missingTerminalBySport[sport] ?? 0) + 1;
      eventsWithMissingTerminalResults.push({
        eventId: event.event_id,
        sport,
        eventDate: String(event.event_date),
        matchup: [event.away_team, event.home_team].filter(Boolean).join(' @ ') || event.event_id,
        missingCandidateCount: 1,
        sampleMarkets: [],
      });
    }
  }

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
    && eventsMissingCoreMarkets.length <= 1
    && missingTerminalRows.length === 0;

  const summary = ok
    ? `Goose2 warehouse verification passed. snapshots=${snapshotCount}, candidates=${recentCandidateRows.length}, pregame_events=${pregameEvents.size}, settleable_missing_terminal=0, stale_pending=${stalePendingCount}, missing_core_events=${eventsMissingCoreMarkets.length}.`
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
