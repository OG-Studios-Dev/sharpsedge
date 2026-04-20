import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');

const headers = (prefer) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${url} :: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function select(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, { headers: headers() });
}

async function insert(pathname, rows) {
  if (!rows.length) return null;
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'POST',
    headers: headers('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(rows),
  });
}

async function deleteByIds(table, idField, ids) {
  let deleted = 0;
  for (const id of ids) {
    const url = `${supabaseUrl}/rest/v1/${table}?${idField}=eq.${encodeURIComponent(id)}`;
    const rows = await fetchJson(url, { method: 'DELETE', headers: headers('return=representation') });
    deleted += Array.isArray(rows) ? rows.length : 0;
  }
  return deleted;
}

async function deleteEvent(eventId) {
  const url = `${supabaseUrl}/rest/v1/goose_market_events?event_id=eq.${encodeURIComponent(eventId)}`;
  const rows = await fetchJson(url, { method: 'DELETE', headers: headers('return=representation') });
  return Array.isArray(rows) ? rows.length : 0;
}

function remapText(value, fromId, toId) {
  return typeof value === 'string' ? value.split(fromId).join(toId) : value;
}

function deepRemap(value, fromId, toId) {
  if (Array.isArray(value)) return value.map((v) => deepRemap(v, fromId, toId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepRemap(v, fromId, toId)]));
  }
  return remapText(value, fromId, toId);
}

function stripGeneratedColumns(row) {
  const clone = { ...row };
  delete clone.sportsbook;
  return clone;
}

function dedupe(rows, keyField) {
  const seen = new Map();
  for (const row of rows) seen.set(row[keyField], row);
  return [...seen.values()];
}

async function pageSelect(table, eventId, limit = 250, selectColumns = '*') {
  const rows = [];
  for (let offset = 0; ; offset += limit) {
    const page = await select(`/${table}?select=${encodeURIComponent(selectColumns)}&event_id=eq.${encodeURIComponent(eventId)}&limit=${limit}&offset=${offset}`);
    if (!Array.isArray(page) || !page.length) break;
    rows.push(...page);
    if (page.length < limit) break;
  }
  return rows;
}

const targets = [
  {
    oldEventId: 'evt:nhl:nhl:c3a2149dc9e1d5fecaaa643deb3f7ce0',
    newEventId: 'evt:nhl:nhl:calgary-flames@colorado-avalanche:2026-04-10T01',
  },
  {
    oldEventId: 'evt:nhl:nhl:e675fb92144f6351784a23641d216a85',
    newEventId: 'evt:nhl:nhl:carolina-hurricanes@chicago-blackhawks:2026-04-10T00',
  },
  {
    oldEventId: 'evt:nhl:nhl:91b731ceb12765cc2cf31bc88c62ddcc',
    newEventId: 'evt:nhl:nhl:columbus-blue-jackets@buffalo-sabres:2026-04-09T23',
  },
];

const report = [];
for (const target of targets) {
  const [candidateRows, featureRows, decisionRows, resultRows] = await Promise.all([
    pageSelect('goose_market_candidates', target.oldEventId),
    pageSelect('goose_feature_rows', target.oldEventId),
    pageSelect('goose_decision_log', target.oldEventId, 250),
    pageSelect('goose_market_results', target.oldEventId),
  ]);

  const remappedCandidateRows = dedupe(candidateRows.map((row) => stripGeneratedColumns(deepRemap({ ...row, event_id: target.newEventId }, target.oldEventId, target.newEventId))), 'candidate_id');
  const remappedFeatureRows = dedupe(featureRows.map((row) => deepRemap({ ...row, event_id: target.newEventId }, target.oldEventId, target.newEventId)), 'feature_row_id');
  const remappedDecisionRows = dedupe(decisionRows.map((row) => deepRemap({ ...row, event_id: target.newEventId }, target.oldEventId, target.newEventId)), 'decision_id');
  const remappedResultRows = dedupe(resultRows.map((row) => deepRemap({ ...row, event_id: target.newEventId }, target.oldEventId, target.newEventId)), 'candidate_id');

  await insert('/goose_market_candidates?on_conflict=candidate_id', remappedCandidateRows);
  await insert('/goose_feature_rows?on_conflict=feature_row_id', remappedFeatureRows);

  let decisionRowsInserted = 0;
  let decisionRowsSkipped = 0;
  if (remappedDecisionRows.length) {
    try {
      await insert('/goose_decision_log?on_conflict=decision_id', remappedDecisionRows);
      decisionRowsInserted = remappedDecisionRows.length;
    } catch (error) {
      const message = String(error.message || error);
      if (message.includes('23505') || message.includes('duplicate key') || message.includes('21000')) {
        decisionRowsSkipped = remappedDecisionRows.length;
      } else {
        throw error;
      }
    }
  }

  await insert('/goose_market_results?on_conflict=candidate_id', remappedResultRows);

  const deletedResults = await deleteByIds('goose_market_results', 'candidate_id', resultRows.map((row) => row.candidate_id));
  const deletedFeatures = await deleteByIds('goose_feature_rows', 'feature_row_id', featureRows.map((row) => row.feature_row_id));
  const deletedDecisions = await deleteByIds('goose_decision_log', 'decision_id', decisionRows.map((row) => row.decision_id));
  const deletedCandidates = await deleteByIds('goose_market_candidates', 'candidate_id', candidateRows.map((row) => row.candidate_id));
  const deletedEvents = await deleteEvent(target.oldEventId);

  report.push({
    old_event_id: target.oldEventId,
    new_event_id: target.newEventId,
    candidate_rows_remapped: remappedCandidateRows.length,
    feature_rows_remapped: remappedFeatureRows.length,
    decision_rows_remapped: decisionRowsInserted,
    decision_rows_skipped: decisionRowsSkipped,
    result_rows_remapped: remappedResultRows.length,
    deleted_rows: {
      results: deletedResults,
      feature_rows: deletedFeatures,
      decision_rows: deletedDecisions,
      candidates: deletedCandidates,
      events: deletedEvents,
    },
  });
}

console.log(JSON.stringify({ ok: true, fixed: report.length, report }, null, 2));
