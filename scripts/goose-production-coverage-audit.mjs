import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Missing Supabase env');

function headers(extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchJson(path, { count = false } = {}) {
  const res = await fetch(`${base}/rest/v1${path}`, {
    headers: headers(count ? { Prefer: 'count=exact' } : {}),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 400)}`);
  const data = text ? JSON.parse(text) : null;
  const contentRange = res.headers.get('content-range');
  const total = count && contentRange ? Number(contentRange.split('/')[1] || 0) : null;
  return { data, total };
}

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString();
}

function dateKey(n) {
  return daysAgo(n).slice(0, 10);
}

function groupCounts(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const k = row[key] ?? 'UNKNOWN';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function groupCountsBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const k = row[key] ?? 'UNKNOWN';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

async function main() {
  const today = dateKey(0);
  const last7 = dateKey(7);
  const last24h = daysAgo(1);

  const [
    snapshotsTotal,
    snapshotEventsTotal,
    snapshotPricesTotal,
    gooseEventsTotal,
    gooseCandidatesTotal,
    gooseResultsTotal,
    gooseFeaturesTotal,
    gooseDecisionsTotal,
    snapshotsBySport,
    pricesBySport,
    candidatesBySport,
    resultsBySport,
    pendingQualifiers,
    pendingOlderThan24h,
    ungradeableQualifiersBySystem,
    recentSnapshots,
    recentCandidates,
    recentResults,
  ] = await Promise.all([
    fetchJson('/market_snapshots?select=id&limit=1', { count: true }),
    fetchJson('/market_snapshot_events?select=id&limit=1', { count: true }),
    fetchJson('/market_snapshot_prices?select=id&limit=1', { count: true }),
    fetchJson('/goose_market_events?select=event_id&limit=1', { count: true }),
    fetchJson('/goose_market_candidates?select=candidate_id&limit=1', { count: true }),
    fetchJson('/goose_market_results?select=candidate_id&limit=1', { count: true }),
    fetchJson('/goose_feature_rows?select=feature_row_id&limit=1', { count: true }),
    fetchJson('/goose_decision_log?select=decision_id&limit=1', { count: true }),
    fetchJson('/market_snapshot_events?select=id,sport,captured_at&captured_at=gte.' + encodeURIComponent(last7) + '&sport=not.is.null&limit=5000'),
    fetchJson('/market_snapshot_prices?select=id,sport,book,market_type,captured_at&captured_at=gte.' + encodeURIComponent(last7) + '&sport=not.is.null&limit=20000'),
    fetchJson('/goose_market_candidates?select=candidate_id,sport,book,market_type,capture_ts&capture_ts=gte.' + encodeURIComponent(last7) + '&sport=not.is.null&limit=20000'),
    fetchJson('/goose_market_results?select=candidate_id,settlement_ts,result,integrity_status,event_id&settlement_ts=gte.' + encodeURIComponent(last7) + '&order=settlement_ts.desc&limit=5000'),
    fetchJson('/system_qualifiers?select=id,system_id,game_date,matchup,settlement_status,outcome&settlement_status=eq.pending&order=game_date.asc&limit=500'),
    fetchJson('/system_qualifiers?select=id,system_id,game_date,matchup,settlement_status,outcome,created_at&settlement_status=eq.pending&created_at=lt.' + encodeURIComponent(last24h) + '&order=game_date.asc&limit=500'),
    fetchJson('/system_qualifiers?select=system_id,count:id&outcome=eq.ungradeable'),
    fetchJson('/market_snapshots?select=id,date_key,captured_at,trigger&order=captured_at.desc&limit=10'),
    fetchJson('/goose_market_candidates?select=candidate_id,sport,event_date,market_type,book,capture_ts&order=capture_ts.desc&limit=15'),
    fetchJson('/goose_market_results?select=candidate_id,result,integrity_status,settlement_ts,grade_source,event_id&order=settlement_ts.desc&limit=15'),
  ]);

  const report = {
    generated_at: new Date().toISOString(),
    owner: 'Magoo',
    goal: 'production coverage audit for Goose all-sports ingestion',
    totals: {
      market_snapshots: snapshotsTotal.total,
      market_snapshot_events: snapshotEventsTotal.total,
      market_snapshot_prices: snapshotPricesTotal.total,
      goose_market_events: gooseEventsTotal.total,
      goose_market_candidates: gooseCandidatesTotal.total,
      goose_market_results: gooseResultsTotal.total,
      goose_feature_rows: gooseFeaturesTotal.total,
      goose_decision_log: gooseDecisionsTotal.total,
    },
    last_7_days: {
      snapshot_events_by_sport: groupCountsBy(snapshotsBySport.data, 'sport'),
      snapshot_prices_by_sport: groupCountsBy(pricesBySport.data, 'sport'),
      snapshot_prices_by_book: groupCountsBy(pricesBySport.data, 'book'),
      snapshot_prices_by_market: groupCountsBy(pricesBySport.data, 'market_type'),
      goose_candidates_by_sport: groupCountsBy(candidatesBySport.data, 'sport'),
      goose_candidates_by_book: groupCountsBy(candidatesBySport.data, 'book'),
      goose_candidates_by_market: groupCountsBy(candidatesBySport.data, 'market_type'),
      goose_results_total: (resultsBySport.data || []).length,
      goose_results_by_integrity: groupCountsBy(resultsBySport.data, 'integrity_status'),
      goose_results_by_result: groupCountsBy(resultsBySport.data, 'result'),
    },
    qualifier_health: {
      pending_count: (pendingQualifiers.data || []).length,
      pending_older_than_24h_count: (pendingOlderThan24h.data || []).length,
      pending_rows: pendingQualifiers.data || [],
      pending_older_than_24h_rows: pendingOlderThan24h.data || [],
      ungradeable_by_system: groupCounts(ungradeableQualifiersBySystem.data, 'system_id'),
    },
    recent_activity: {
      snapshots: recentSnapshots.data || [],
      candidates: recentCandidates.data || [],
      results: recentResults.data || [],
    },
    assessment: {
      healthy_capture_surface: Boolean((snapshotsTotal.total || 0) > 0 && (snapshotPricesTotal.total || 0) > 0 && (gooseCandidatesTotal.total || 0) > 0),
      has_recent_settlement_flow: (resultsBySport.data || []).length > 0,
      stale_pending_problem: (pendingOlderThan24h.data || []).length > 0,
      notes: [
        'Ingest broad, train narrow.',
        'Do not claim all-sports learning until per-sport candidate and settlement counts are consistently non-trivial.',
        'Pending older than 24h should be treated as an ops failure unless explicitly justified.',
      ],
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
