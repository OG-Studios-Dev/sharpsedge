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
  return res.json();
}

async function select(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, { headers: headers() });
}

async function del(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'DELETE',
    headers: headers('return=representation'),
  });
}

function isPseudo(row) {
  const source = String(row.source_event_id || '');
  const eventId = String(row.event_id || '');
  return source.startsWith('team:') || source.startsWith('team-season:') || eventId.includes(':team-season:');
}

const events = await select('/goose_market_events?select=event_id,source_event_id&sport=eq.NHL&limit=5000');
const pseudo = (events || []).filter(isPseudo);
const report = [];

for (const row of pseudo) {
  const encoded = encodeURIComponent(row.event_id);
  const [resultsDeleted, decisionsDeleted, featuresDeleted, candidatesDeleted, eventsDeleted] = await Promise.all([
    del(`/goose_market_results?event_id=eq.${encoded}`),
    del(`/goose_decision_log?event_id=eq.${encoded}`),
    del(`/goose_feature_rows?event_id=eq.${encoded}`),
    del(`/goose_market_candidates?event_id=eq.${encoded}`),
    del(`/goose_market_events?event_id=eq.${encoded}`),
  ]);
  report.push({
    event_id: row.event_id,
    source_event_id: row.source_event_id,
    deleted: {
      results: Array.isArray(resultsDeleted) ? resultsDeleted.length : 0,
      decisions: Array.isArray(decisionsDeleted) ? decisionsDeleted.length : 0,
      feature_rows: Array.isArray(featuresDeleted) ? featuresDeleted.length : 0,
      candidates: Array.isArray(candidatesDeleted) ? candidatesDeleted.length : 0,
      events: Array.isArray(eventsDeleted) ? eventsDeleted.length : 0,
    },
  });
}

console.log(JSON.stringify({ ok: true, pseudo_events_found: pseudo.length, report }, null, 2));
