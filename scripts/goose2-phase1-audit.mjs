import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing Supabase env vars');
}

const sports = ['NHL', 'NBA', 'MLB'];
const apiBase = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function statusFromCounts({ critical = 0, warning = 0 }) {
  if (critical > 0) return 'critical';
  if (warning > 0) return 'warning';
  return 'clean';
}

async function rest(pathname, { count = false } = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    headers: {
      ...headers,
      ...(count ? { Prefer: 'count=exact' } : {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`REST ${response.status} for ${pathname}: ${text.slice(0, 400)}`);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const total = count ? Number(response.headers.get('content-range')?.split('/')[1] || 0) : null;
  return { data, total };
}

function normalizeEvent(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    event_id: row.event_id,
    source_event_id: row.source_event_id,
    sport: row.sport,
    event_date: row.event_date,
    commence_time: row.commence_time,
    home_team: row.home_team,
    away_team: row.away_team,
    event_label: row.event_label,
    metadata,
  };
}

function getSuspicionReasons(event) {
  const reasons = [];
  const eventId = event.event_id || '';
  const sourceEventId = event.source_event_id || '';

  const isLegacyPrefixed = /^evt:(nhl|nba|mlb):(nhl|nba|mlb):/.test(eventId);
  const isCanonicalHashed = /^evt:(nhl|nba|mlb):(nhl|nba|mlb):[a-f0-9]{32}$/i.test(eventId);
  const isCanonicalSlugged = /^evt:(nhl|nba|mlb):(nhl|nba|mlb):.+@.+:\d{4}-\d{2}-\d{2}T\d{2}$/i.test(eventId);

  const metadataKind = event.metadata?.kind;
  const isSeasonSummary = metadataKind === 'team_season_summary' && /^evt:(nhl|nba|mlb):(nhl|nba|mlb):team-season:/i.test(eventId);

  if (isLegacyPrefixed && !isCanonicalHashed && !isCanonicalSlugged && !isSeasonSummary) {
    reasons.push('legacy_event_id');
  }
  if (/^[A-Z]+:[A-Z0-9]+@[A-Z0-9]+:na$/.test(sourceEventId)) {
    reasons.push('legacy_source_event_id');
  }
  return reasons;
}

function duplicateClusterKey(event) {
  const commenceHour = event.commence_time ? new Date(event.commence_time).toISOString().slice(0, 13) : 'no-time';
  return [event.sport, event.event_date, event.home_team || '', event.away_team || '', commenceHour].join('|');
}

async function getIdentityAudit(sport) {
  const { data: events } = await rest(`/goose_market_events?select=event_id,source_event_id,sport,event_date,commence_time,home_team,away_team,event_label,metadata&sport=eq.${sport}&order=event_date.desc,commence_time.desc&limit=5000`);
  const normalized = (events || []).map(normalizeEvent);
  const suspiciousRows = normalized
    .map((event) => {
      const suspicionReasons = getSuspicionReasons(event);
      return suspicionReasons.length ? { ...event, suspicion_reasons: suspicionReasons } : null;
    })
    .filter(Boolean);

  const clusterMap = new Map();
  for (const event of normalized) {
    const key = duplicateClusterKey(event);
    if (!clusterMap.has(key)) clusterMap.set(key, []);
    clusterMap.get(key).push(event);
  }

  const duplicateClusters = [...clusterMap.values()]
    .filter((eventsForKey) => eventsForKey.length > 1)
    .map((cluster) => ({
      sport,
      event_date: cluster[0].event_date,
      home_team: cluster[0].home_team,
      away_team: cluster[0].away_team,
      commence_hour: cluster[0].commence_time ? new Date(cluster[0].commence_time).toISOString().slice(0, 13) : null,
      event_count: cluster.length,
      event_ids: cluster.map((event) => event.event_id),
    }));

  const suspiciousWithCounts = [];
  for (const row of suspiciousRows.slice(0, 10)) {
    const eventId = encodeURIComponent(row.event_id);
    const [candidateCount, featureCount, decisionCount, resultCount] = await Promise.all([
      rest(`/goose_market_candidates?select=candidate_id&event_id=eq.${eventId}`, { count: true }),
      rest(`/goose_feature_rows?select=feature_row_id&event_id=eq.${eventId}`, { count: true }),
      rest(`/goose_decision_log?select=decision_id&event_id=eq.${eventId}`, { count: true }),
      rest(`/goose_market_results?select=candidate_id&event_id=eq.${eventId}`, { count: true }),
    ]);

    suspiciousWithCounts.push({
      ...row,
      candidate_count: candidateCount.total || 0,
      feature_row_count: featureCount.total || 0,
      decision_count: decisionCount.total || 0,
      result_count: resultCount.total || 0,
    });
  }

  const critical = duplicateClusters.length;
  const warning = suspiciousRows.length;
  return {
    sport,
    total_events: normalized.length,
    suspicious_event_id_count: suspiciousRows.filter((row) => row.suspicion_reasons.includes('legacy_event_id')).length,
    suspicious_source_event_id_count: suspiciousRows.filter((row) => row.suspicion_reasons.includes('legacy_source_event_id')).length,
    duplicate_cluster_count: duplicateClusters.length,
    suspicious_rows: suspiciousWithCounts,
    duplicate_clusters: duplicateClusters.slice(0, 10),
    status: statusFromCounts({ critical, warning }),
  };
}

function gradingBucket(row) {
  const result = row.result;
  const integrity = row.integrity_status;
  const commence = row.commence_time ? new Date(row.commence_time).getTime() : null;
  const ageHours = commence ? (Date.now() - commence) / 36e5 : null;
  const staleThreshold = row.sport === 'MLB' ? 10 : 8;
  const staleUngraded = !result && ageHours !== null && ageHours >= staleThreshold && ['final', 'in_progress', 'unknown', 'scheduled'].includes(row.event_status);
  const impossibleState =
    ((result === 'win' || result === 'loss' || result === 'push') && !row.settlement_ts) ||
    (result === 'pending' && !!row.settlement_ts) ||
    (integrity === 'ok' && !result);
  const contradictoryState =
    ((result === 'win' || result === 'loss') && ['void', 'cancelled', 'manual_review'].includes(integrity || ''));
  const trainableSettled = (result === 'win' || result === 'loss') && integrity === 'ok';
  const pushRow = result === 'push';
  const excludedRow = ['void', 'cancelled'].includes(result || '') || ['void', 'cancelled', 'postponed'].includes(integrity || '');
  const manualReviewRow = integrity === 'manual_review' || result === 'ungradeable';

  return {
    staleUngraded,
    impossibleState,
    contradictoryState,
    trainableSettled,
    pushRow,
    excludedRow,
    manualReviewRow,
  };
}

async function getGradingAudit(sport) {
  const { data: rows } = await rest(`/goose_market_candidates?select=candidate_id,event_id,sport,event_date,market_type,odds,capture_ts,goose_market_events!inner(commence_time,status),goose_market_results(result,integrity_status,settlement_ts,grade_source,grading_notes)&sport=eq.${sport}&event_date=gte.${new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)}&order=event_date.desc,capture_ts.desc&limit=5000`);

  const normalized = (rows || []).map((row) => ({
    candidate_id: row.candidate_id,
    event_id: row.event_id,
    sport: row.sport,
    event_date: row.event_date,
    market_type: row.market_type,
    odds: row.odds,
    capture_ts: row.capture_ts,
    commence_time: row.goose_market_events?.commence_time || null,
    event_status: row.goose_market_events?.status || 'unknown',
    result: row.goose_market_results?.result || null,
    integrity_status: row.goose_market_results?.integrity_status || null,
    settlement_ts: row.goose_market_results?.settlement_ts || null,
    grade_source: row.goose_market_results?.grade_source || null,
    grading_notes: row.goose_market_results?.grading_notes || null,
  }));

  const evaluated = normalized.map((row) => ({ ...row, ...gradingBucket(row) }));
  const sampleBrokenRows = evaluated.filter((row) => row.staleUngraded || row.impossibleState || row.contradictoryState).slice(0, 10);
  const critical = evaluated.filter((row) => row.impossibleState || row.contradictoryState).length;
  const warning = evaluated.filter((row) => row.staleUngraded || row.manualReviewRow).length;

  return {
    sport,
    candidate_count: evaluated.length,
    trainable_settled_count: evaluated.filter((row) => row.trainableSettled).length,
    push_count: evaluated.filter((row) => row.pushRow).length,
    excluded_count: evaluated.filter((row) => row.excludedRow).length,
    manual_review_count: evaluated.filter((row) => row.manualReviewRow).length,
    stale_ungraded_count: evaluated.filter((row) => row.staleUngraded).length,
    impossible_state_count: evaluated.filter((row) => row.impossibleState).length,
    contradictory_state_count: evaluated.filter((row) => row.contradictoryState).length,
    sample_broken_rows: sampleBrokenRows,
    status: statusFromCounts({ critical, warning }),
  };
}

async function main() {
  const identity = [];
  const grading = [];
  for (const sport of sports) {
    identity.push(await getIdentityAudit(sport));
    grading.push(await getGradingAudit(sport));
  }

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    audits: { identity, grading },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
