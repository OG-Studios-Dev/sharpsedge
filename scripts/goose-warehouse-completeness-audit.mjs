import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const CORE_TEAM_MARKETS = ['moneyline', 'spread', 'total'];
const FAST_SETTLE_SPORTS = new Set(['NBA', 'NHL', 'MLB', 'NFL']);
const PLAYER_PROP_PREFIX = 'player_prop_';

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'count=exact',
    ...extra,
  };
}

async function postgrest(pathname) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${pathname}`, {
    headers: headers(),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Warehouse audit query failed ${response.status}: ${text.slice(0, 300)}`);
  }
  const rows = text ? JSON.parse(text) : null;
  const contentRange = response.headers.get('content-range');
  const total = contentRange ? Number(contentRange.split('/')[1] || 0) : null;
  return { total, rows };
}

function relationOne(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function terminalResult(result, integrity) {
  const resultValue = String(result ?? '').toLowerCase();
  const integrityValue = String(integrity ?? '').toLowerCase();
  return ['win', 'loss', 'push', 'void', 'cancelled', 'ungradeable'].includes(resultValue)
    || ['ok', 'void', 'cancelled', 'postponed', 'unresolvable', 'manual_review'].includes(integrityValue);
}

function groupCount(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isPregameAuditCandidate(row, nowMs, todayKey) {
  const event = relationOne(row.goose_market_events);
  const status = normalizeStatus(event?.status);
  if (['final', 'cancelled', 'postponed'].includes(status)) return false;

  const commenceMs = event?.commence_time ? Date.parse(event.commence_time) : Number.NaN;
  if (Number.isFinite(commenceMs)) return commenceMs >= nowMs - 6 * 60 * 60 * 1000;
  return String(row.event_date || '') >= todayKey;
}

function isSettleableAuditCandidate(row, yesterdayKey) {
  const event = relationOne(row.goose_market_events);
  const status = normalizeStatus(event?.status);
  if (status === 'final') return true;
  if (!FAST_SETTLE_SPORTS.has(String(row.sport || '').toUpperCase())) return false;
  return Boolean(row.event_date) && row.event_date <= yesterdayKey;
}

async function buildWarehouseAudit() {
  const checkedAt = new Date().toISOString();
  const nowMs = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last7DateKey = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last36h = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

  const select = 'candidate_id,event_id,sport,event_date,market_type,capture_ts,goose_market_events!inner(status,commence_time,home_team,away_team),goose_market_results(result,integrity_status)';

  const [snapshots, recentCandidates, recentResults, stalePending, settlementCandidates] = await Promise.all([
    postgrest(`/market_snapshots?select=id,captured_at&captured_at=gte.${encodeURIComponent(last24h)}&order=captured_at.desc&limit=20`),
    postgrest(`/goose_market_candidates?select=${select}&capture_ts=gte.${encodeURIComponent(last24h)}&order=capture_ts.desc&limit=10000`),
    postgrest(`/goose_market_results?select=candidate_id,settlement_ts,result,integrity_status&settlement_ts=gte.${encodeURIComponent(last36h)}&order=settlement_ts.desc&limit=10000`),
    postgrest(`/system_qualifiers?select=id,system_id,created_at,settlement_status&settlement_status=eq.pending&created_at=lt.${encodeURIComponent(last24h)}&limit=200`),
    postgrest(`/goose_market_candidates?select=${select}&event_date=gte.${last7DateKey}&order=event_date.desc,capture_ts.desc&limit=20000`),
  ]);

  const snapshotCount = snapshots.rows?.length ?? 0;
  const recentCandidateRows = recentCandidates.rows ?? [];
  const recentResultCount = recentResults.rows?.length ?? 0;
  const stalePendingCount = stalePending.rows?.length ?? 0;
  const settlementRows = settlementCandidates.rows ?? [];

  const pregameRows = recentCandidateRows.filter((row) => isPregameAuditCandidate(row, nowMs, todayKey));
  const pregameEvents = new Map();

  for (const row of pregameRows) {
    const event = relationOne(row.goose_market_events);
    const existing = pregameEvents.get(row.event_id) ?? {
      sport: row.sport,
      eventDate: row.event_date,
      commenceTime: event?.commence_time ?? null,
      matchup: [event?.away_team, event?.home_team].filter(Boolean).join(' @ ') || row.event_id,
      marketTypes: new Set(),
    };
    existing.marketTypes.add(row.market_type);
    pregameEvents.set(row.event_id, existing);
  }

  const eventsMissingCoreMarkets = Array.from(pregameEvents.entries())
    .map(([eventId, event]) => {
      const observedMarkets = Array.from(event.marketTypes).sort((a, b) => a.localeCompare(b));
      const missingMarkets = CORE_TEAM_MARKETS.filter((market) => !event.marketTypes.has(market));
      return { eventId, sport: event.sport, eventDate: event.eventDate, commenceTime: event.commenceTime, matchup: event.matchup, missingMarkets, observedMarkets };
    })
    .filter((event) => event.missingMarkets.length > 0)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    .slice(0, 25);

  const coreMarketCoverageBySport = pregameRows.reduce((acc, row) => {
    const sport = String(row.sport || 'UNKNOWN').toUpperCase();
    acc[sport] ??= {};
    acc[sport][row.market_type] = (acc[sport][row.market_type] ?? 0) + 1;
    return acc;
  }, {});

  const supplementalMarketCounts = groupCount(
    recentCandidateRows.map((row) => row.market_type).filter((market) => !CORE_TEAM_MARKETS.includes(market)),
  );

  const playerPropRows = recentCandidateRows.filter((row) => String(row.market_type || '').startsWith(PLAYER_PROP_PREFIX));
  const playerPropSportsCovered = Array.from(new Set(playerPropRows.map((row) => String(row.sport || '').toUpperCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  const settleableRows = settlementRows.filter((row) => isSettleableAuditCandidate(row, yesterdayKey));
  const missingTerminalRows = settleableRows.filter((row) => {
    const result = relationOne(row.goose_market_results);
    return !terminalResult(result?.result, result?.integrity_status);
  });

  const eventsWithMissingTerminalResults = Object.values(
    missingTerminalRows.reduce((acc, row) => {
      const event = relationOne(row.goose_market_events);
      const existing = acc[row.event_id] ?? {
        eventId: row.event_id,
        sport: row.sport,
        eventDate: row.event_date,
        matchup: [event?.away_team, event?.home_team].filter(Boolean).join(' @ ') || row.event_id,
        missingCandidateCount: 0,
        sampleMarkets: new Set(),
      };
      existing.missingCandidateCount += 1;
      if (existing.sampleMarkets.size < 6) existing.sampleMarkets.add(row.market_type);
      acc[row.event_id] = existing;
      return acc;
    }, {}),
  ).map((event) => ({ ...event, sampleMarkets: Array.from(event.sampleMarkets).sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.missingCandidateCount - a.missingCandidateCount)
    .slice(0, 25);

  const explicitManualReviewCount = settleableRows.filter((row) => String(relationOne(row.goose_market_results)?.integrity_status ?? '').toLowerCase() === 'manual_review').length;
  const explicitUnresolvableCount = settleableRows.filter((row) => String(relationOne(row.goose_market_results)?.integrity_status ?? '').toLowerCase() === 'unresolvable').length;
  const missingTerminalBySport = groupCount(missingTerminalRows.map((row) => String(row.sport || 'UNKNOWN').toUpperCase()));

  const notes = [];
  if (snapshotCount === 0) notes.push('No snapshot rows landed in the last 24h.');
  if (recentCandidateRows.length === 0) notes.push('No candidate rows landed in the last 24h.');
  if (playerPropRows.length === 0) notes.push('No player-prop candidate rows landed in the last 24h.');
  if (eventsMissingCoreMarkets.length > 0) notes.push(`${eventsMissingCoreMarkets.length} recent pregame event(s) are missing one or more core team markets.`);
  if (missingTerminalRows.length > 0) notes.push(`${missingTerminalRows.length} settleable candidate row(s) still lack a terminal result.`);
  if (stalePendingCount > 0) notes.push(`${stalePendingCount} system qualifier row(s) are still pending after 24h.`);
  if (!notes.length) notes.push('Daily warehouse rails look healthy: recent snapshots landed, candidate coverage is present, and settleable candidates have terminal results.');

  const ok = snapshotCount > 0
    && recentCandidateRows.length > 0
    && stalePendingCount === 0
    && eventsMissingCoreMarkets.length === 0
    && missingTerminalRows.length === 0;

  return {
    checkedAt,
    ok,
    summary: ok
      ? `Goose2 warehouse verification passed. snapshots=${snapshotCount}, candidates=${recentCandidateRows.length}, pregame_events=${pregameEvents.size}, settleable_missing_terminal=0, stale_pending=${stalePendingCount}.`
      : `Goose2 warehouse verification failed. snapshots=${snapshotCount}, candidates=${recentCandidateRows.length}, missing_core_events=${eventsMissingCoreMarkets.length}, settleable_missing_terminal=${missingTerminalRows.length}, stale_pending=${stalePendingCount}.`,
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

function topEntries(obj, limit = 8) {
  return Object.entries(obj || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, count: Number(value) }));
}

function linesForSummary(audit) {
  return [
    'Goose warehouse completeness audit',
    `Checked: ${audit.checkedAt}`,
    `Status: ${audit.ok ? 'PASS' : 'FAIL'}`,
    `Snapshots last 24h: ${audit.counts.snapshotsLast24h}`,
    `Candidates last 24h: ${audit.counts.candidatesLast24h}`,
    `Player prop rows last 24h: ${audit.counts.playerPropRowsLast24h}`,
    `Audited pregame events: ${audit.counts.auditedPregameEvents}`,
    `Events missing core markets: ${audit.counts.eventsMissingCoreMarkets}`,
    `Audited settleable candidates: ${audit.counts.auditedSettleableCandidates}`,
    `Settleable candidates missing terminal result: ${audit.counts.settleableCandidatesMissingTerminalResult}`,
    `Stale pending qualifiers: ${audit.counts.stalePendingQualifiers}`,
    `Core coverage by sport: ${JSON.stringify(audit.capture.coreMarketCoverageBySport)}`,
    `Supplemental market leaders: ${JSON.stringify(topEntries(audit.capture.supplementalMarketCounts))}`,
    `Missing terminal by sport: ${JSON.stringify(topEntries(audit.settlement.missingTerminalBySport))}`,
    `Notes: ${(audit.notes || []).join(' | ')}`,
  ];
}

async function main() {
  const audit = await buildWarehouseAudit();

  const outDir = path.join(process.cwd(), 'logs', 'goose-audits');
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d+Z$/, 'Z');
  const jsonPath = path.join(outDir, `${stamp}-warehouse.json`);
  const txtPath = path.join(outDir, `${stamp}-warehouse-summary.txt`);
  const latestJsonPath = path.join(outDir, 'latest-warehouse.json');
  const latestTxtPath = path.join(outDir, 'latest-warehouse-summary.txt');

  const payload = {
    generated_at: new Date().toISOString(),
    owner: 'Magoo',
    goal: 'daily warehouse completeness proof for future learning models',
    audit,
    proof: {
      missing_core_event_samples: audit.capture.eventsMissingCoreMarkets.slice(0, 10),
      missing_terminal_event_samples: audit.settlement.eventsWithMissingTerminalResults.slice(0, 10),
      player_prop_sports_covered: audit.capture.playerPropSportsCovered,
    },
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(latestJsonPath, JSON.stringify(payload, null, 2));

  const summary = linesForSummary(audit).join('\n');
  fs.writeFileSync(txtPath, summary);
  fs.writeFileSync(latestTxtPath, summary);

  console.log(JSON.stringify({
    ok: audit.ok,
    jsonPath,
    txtPath,
    latestJsonPath,
    latestTxtPath,
    counts: audit.counts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
