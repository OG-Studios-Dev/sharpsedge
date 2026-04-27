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
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const apiBase = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const SUPPORTED_MARKETS = new Set(['moneyline', 'spread', 'total', 'first_five_total', 'first_five_side']);
const SUPPORTED_SPORTS = new Set(['NHL', 'NBA', 'MLB']);
const PAGE_SIZE = Number(process.env.GOOSE2_EXPORT_PAGE_SIZE || 1000);
const MAX_ROWS = Number(process.env.GOOSE2_EXPORT_MAX_ROWS || 50000);
const HYDRATE_CHUNK_SIZE = Number(process.env.GOOSE2_EXPORT_HYDRATE_CHUNK_SIZE || 20);

async function rest(pathname, extraHeaders = {}) {
  const res = await fetch(`${apiBase}${pathname}`, { headers: { ...headers, ...extraHeaders }, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`REST ${res.status} ${pathname}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function encodeIn(values) {
  return values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(',');
}

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function fetchTrainingLabels() {
  const labels = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, MAX_ROWS - offset);
    const page = await rest(`/goose_market_results?select=candidate_id,event_id,result,integrity_status,settlement_ts&integrity_status=eq.ok&result=in.(win,loss)&order=settlement_ts.asc,candidate_id.asc&limit=${limit}&offset=${offset}`);
    labels.push(...page);
    if (page.length < limit) break;
  }
  return labels;
}

async function fetchByCandidateIds(table, select, ids) {
  const rows = [];
  for (const group of chunk(ids, HYDRATE_CHUNK_SIZE)) {
    if (group.length === 0) continue;
    rows.push(...await rest(`/${table}?select=${select}&candidate_id=in.(${encodeIn(group)})`));
  }
  return rows;
}

async function fetchEventRows(eventIds) {
  const rows = [];
  for (const group of chunk(eventIds, HYDRATE_CHUNK_SIZE)) {
    if (group.length === 0) continue;
    rows.push(...await rest(`/goose_market_events?select=event_id,commence_time,home_team,away_team,status&event_id=in.(${encodeIn(group)})`));
  }
  return rows;
}

async function fetchTrainingSourceRows() {
  const labels = await fetchTrainingLabels();
  const candidateIds = labels.map((row) => row.candidate_id);
  const candidates = await fetchByCandidateIds(
    'goose_market_candidates',
    'candidate_id,event_id,sport,league,event_date,market_type,participant_name,opponent_name,side,line,odds,book,capture_ts,is_best_price,is_opening,is_closing,snapshot_id,event_snapshot_id',
    candidateIds,
  );
  const features = await fetchByCandidateIds(
    'goose_feature_rows',
    'candidate_id,feature_row_id,feature_version,feature_payload,system_flags,generated_ts',
    candidateIds,
  );
  const events = await fetchEventRows([...new Set(candidates.map((row) => row.event_id).filter(Boolean))]);
  const labelByCandidate = new Map(labels.map((row) => [row.candidate_id, row]));
  const featureByCandidate = new Map(features.map((row) => [row.candidate_id, row]));
  const eventById = new Map(events.map((row) => [row.event_id, row]));

  return candidates.map((row) => ({
    ...row,
    goose_market_results: labelByCandidate.get(row.candidate_id) ?? null,
    goose_feature_rows: featureByCandidate.get(row.candidate_id) ?? null,
    goose_market_events: eventById.get(row.event_id) ?? null,
  }));
}

function impliedProbFromAmericanOdds(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 100 / (n + 100);
  return Math.abs(n) / (Math.abs(n) + 100);
}

function checkpointKey(ts) {
  return String(ts || '').slice(0, 16);
}

function safeNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function lineHealth(row) {
  const sport = row.sport || row.league || 'UNKNOWN';
  const market = row.market_type || 'unknown_market';
  const line = Number(row.line);
  if (market === 'moneyline') return 'no_line_expected';
  if (!Number.isFinite(line)) return 'missing_line';
  const abs = Math.abs(line);

  if (market === 'total') {
    if (sport === 'NBA') {
      if (line < 150) return 'implausibly_low_full_game_total';
      if (line > 290) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
    if (sport === 'MLB') {
      if (line < 3) return 'implausibly_low_full_game_total';
      if (line > 20) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
    if (sport === 'NHL') {
      if (line < 3) return 'implausibly_low_full_game_total';
      if (line > 10) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
  }

  if (market === 'spread') {
    if (sport === 'NBA' && abs > 35) return 'implausibly_wide_spread';
    if ((sport === 'MLB' || sport === 'NHL') && abs > 5) return 'implausibly_wide_spread';
    return 'plausible_spread';
  }

  return 'unchecked_line_range';
}

function buildExclusionReason(row) {
  if (!SUPPORTED_SPORTS.has(row.sport)) return 'unsupported_sport';
  if (!SUPPORTED_MARKETS.has(row.market_type)) return 'unsupported_market';
  if (!row.event_id || !row.candidate_id || !row.capture_ts) return 'missing_core_fields';
  if (row.result === 'push') return 'push';
  if (row.result === 'pending' || row.integrity_status === 'pending') return 'pending';
  if (row.result === 'ungradeable' || row.integrity_status === 'manual_review') return 'manual_review';
  if (['void', 'cancelled'].includes(String(row.result))) return 'void_or_cancelled';
  if (['void', 'cancelled', 'postponed', 'unresolvable'].includes(String(row.integrity_status))) return 'bad_integrity_status';
  if (!['win', 'loss'].includes(String(row.result)) || row.integrity_status !== 'ok') return 'non_trainable_label';
  const health = lineHealth(row);
  if (String(health).startsWith('implausibly_')) return `implausible_line_range:${health}`;
  return null;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const esc = (value) => {
    if (value == null) return '';
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((col) => esc(row[col])).join(','))].join('\n');
}

async function main() {
  const rows = await fetchTrainingSourceRows();

  const normalized = rows.map((row) => {
    const feature = Array.isArray(row.goose_feature_rows) ? row.goose_feature_rows[0] : row.goose_feature_rows;
    const result = Array.isArray(row.goose_market_results) ? row.goose_market_results[0] : row.goose_market_results;
    const event = Array.isArray(row.goose_market_events) ? row.goose_market_events[0] : row.goose_market_events;
    const featurePayload = feature?.feature_payload && typeof feature.feature_payload === 'object' ? feature.feature_payload : {};
    const systemFlags = feature?.system_flags && typeof feature.system_flags === 'object' ? feature.system_flags : {};
    const qualifierCount = Number(systemFlags.qualifier_count ?? 0);
    const impliedProb = impliedProbFromAmericanOdds(row.odds);
    const exclusion_reason = buildExclusionReason({
      ...row,
      result: result?.result ?? null,
      integrity_status: result?.integrity_status ?? null,
    });
    return {
      candidate_id: row.candidate_id,
      event_id: row.event_id,
      feature_row_id: feature?.feature_row_id ?? null,
      sport: row.sport,
      league: row.league,
      event_date: row.event_date,
      market_type: row.market_type,
      participant_name: row.participant_name,
      opponent_name: row.opponent_name,
      side: row.side,
      line: row.line,
      line_health: lineHealth(row),
      odds: row.odds,
      implied_prob: impliedProb,
      book: row.book,
      capture_ts: row.capture_ts,
      capture_checkpoint: checkpointKey(row.capture_ts),
      snapshot_id: row.snapshot_id,
      event_snapshot_id: row.event_snapshot_id,
      event_status: event?.status ?? null,
      commence_time: event?.commence_time ?? null,
      home_team: event?.home_team ?? null,
      away_team: event?.away_team ?? null,
      is_best_price: !!row.is_best_price,
      is_opening: !!row.is_opening,
      is_closing: !!row.is_closing,
      feature_version: feature?.feature_version ?? null,
      feature_generated_ts: feature?.generated_ts ?? null,
      qualifier_count: qualifierCount,
      source_count: Array.isArray(systemFlags.systems) ? systemFlags.systems.length : qualifierCount,
      feature_market_type: featurePayload.market_type ?? null,
      feature_book: featurePayload.book ?? null,
      feature_line: safeNum(featurePayload.line),
      feature_odds: safeNum(featurePayload.odds),
      result: result?.result ?? null,
      integrity_status: result?.integrity_status ?? null,
      settlement_ts: result?.settlement_ts ?? null,
      label_win: result?.result === 'win' && result?.integrity_status === 'ok' ? 1 : result?.result === 'loss' && result?.integrity_status === 'ok' ? 0 : null,
      exclusion_reason,
      included_in_v1: exclusion_reason === null,
    };
  });

  const included = normalized.filter((row) => row.included_in_v1);
  const excluded = normalized.filter((row) => !row.included_in_v1);

  const summary = {
    generated_at: new Date().toISOString(),
    totals: {
      source_rows: normalized.length,
      included_rows: included.length,
      excluded_rows: excluded.length,
      page_size: PAGE_SIZE,
      max_rows: MAX_ROWS,
      hydrate_chunk_size: HYDRATE_CHUNK_SIZE,
      ordered_by: 'goose_market_results.settlement_ts.asc,candidate_id.asc',
    },
    by_sport: Object.fromEntries([...SUPPORTED_SPORTS].map((sport) => [sport, included.filter((row) => row.sport === sport).length])),
    by_market: Object.fromEntries([...new Set(included.map((row) => row.market_type))].sort().map((market) => [market, included.filter((row) => row.market_type === market).length])),
    exclusion_reasons: Object.fromEntries([...new Set(excluded.map((row) => row.exclusion_reason))].sort().map((reason) => [reason, excluded.filter((row) => row.exclusion_reason === reason).length])),
  };

  fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-training-dataset-v1.json'), JSON.stringify({ summary, rows: included }, null, 2));
  fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-training-dataset-v1.csv'), toCsv(included));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
