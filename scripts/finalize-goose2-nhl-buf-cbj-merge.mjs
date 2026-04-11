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
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'POST',
    headers: headers('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(rows),
  });
}

async function del(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'DELETE',
    headers: headers('return=minimal'),
  });
}

const oldEventId = 'evt:nhl:nhl:91b731ceb12765cc2cf31bc88c62ddcc';
const newEventId = 'evt:nhl:nhl:columbus-blue-jackets@buffalo-sabres:2026-04-09T23';

function remapText(value) {
  return typeof value === 'string' ? value.split(oldEventId).join(newEventId) : value;
}

function deepRemap(value) {
  if (Array.isArray(value)) return value.map(deepRemap);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepRemap(v)]));
  }
  return remapText(value);
}

function stripGeneratedColumns(row) {
  const clone = { ...row };
  delete clone.sportsbook;
  return clone;
}

async function main() {
  const [candidateRows, featureRows, decisionRows] = await Promise.all([
    select(`/goose_market_candidates?select=*&event_id=eq.${encodeURIComponent(oldEventId)}&limit=5000`),
    select(`/goose_feature_rows?select=*&event_id=eq.${encodeURIComponent(oldEventId)}&limit=5000`),
    select(`/goose_decision_log?select=*&event_id=eq.${encodeURIComponent(oldEventId)}&limit=5000`),
  ]);

  const remappedCandidateRows = (candidateRows || []).map((row) => stripGeneratedColumns(deepRemap({ ...row, event_id: newEventId })));
  const remappedFeatureRows = (featureRows || []).map((row) => deepRemap({ ...row, event_id: newEventId }));
  const remappedDecisionRows = (decisionRows || []).map((row) => deepRemap({ ...row, event_id: newEventId }));

  if (remappedCandidateRows.length) {
    await insert('/goose_market_candidates?on_conflict=candidate_id', remappedCandidateRows);
  }
  if (remappedFeatureRows.length) {
    await insert('/goose_feature_rows?on_conflict=feature_row_id', remappedFeatureRows);
  }
  if (remappedDecisionRows.length) {
    await insert('/goose_decision_log?on_conflict=decision_id', remappedDecisionRows);
  }

  await del(`/goose_feature_rows?event_id=eq.${encodeURIComponent(oldEventId)}`);
  await del(`/goose_decision_log?event_id=eq.${encodeURIComponent(oldEventId)}`);
  await del(`/goose_market_candidates?event_id=eq.${encodeURIComponent(oldEventId)}`);
  await del(`/goose_market_events?event_id=eq.${encodeURIComponent(oldEventId)}`);

  console.log(JSON.stringify({
    ok: true,
    old_event_id: oldEventId,
    new_event_id: newEventId,
    candidate_rows_remapped: remappedCandidateRows.length,
    feature_rows_remapped: remappedFeatureRows.length,
    decision_rows_remapped: remappedDecisionRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
