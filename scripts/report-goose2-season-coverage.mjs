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

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

const EXPECTED = {
  MLB: { '2024': 2430, '2025': 2430 },
  NBA: { '2024': 1230, '2025': 1230 },
  NHL: { '2024': 1312, '2025': 1312 },
};

async function get(path) {
  const r = await fetch(`${supabaseUrl}/rest/v1${path}`, { headers });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}

function seasonYear(league, eventDate) {
  const [year, month] = String(eventDate || '').split('-').map(Number);
  if (!year || !month) return null;
  if (league === 'NHL' || league === 'NBA') return month >= 7 ? String(year) : String(year - 1);
  return String(year);
}

async function getAll(pathPrefix, pageSize = 1000) {
  const out = [];
  let offset = 0;
  while (true) {
    const batch = await get(`${pathPrefix}&limit=${pageSize}&offset=${offset}`);
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

const rows = await getAll('/goose_market_events?select=league,event_date,event_id&league=in.(MLB,NBA,NHL)');
const grouped = {};
for (const row of rows) {
  const league = String(row.league || '').toUpperCase();
  const season = seasonYear(league, row.event_date);
  if (!season) continue;
  grouped[league] ||= {};
  grouped[league][season] ||= new Set();
  grouped[league][season].add(row.event_id);
}

const out = {};
for (const [league, seasons] of Object.entries(EXPECTED)) {
  out[league] = {};
  for (const [season, expected] of Object.entries(seasons)) {
    const actual = grouped[league]?.[season]?.size || 0;
    out[league][season] = { actual, expected, coveragePct: expected ? Number(((actual / expected) * 100).toFixed(1)) : null };
  }
}

console.log(JSON.stringify(out, null, 2));
