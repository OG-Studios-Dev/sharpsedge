import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) throw new Error('Missing Supabase env');

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

const DRY_RUN = !process.argv.includes('--apply');
const MAX_GOOD_ODDS = -200;

async function pg(pathname, init = {}) {
  const res = await fetch(`${url}/rest/v1${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 600)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

const badRows = await pg(`/pick_history?select=id,pick_id,date,league,pick_label,odds,book,created_at,game_id,provenance,provenance_note&league=eq.MLB&odds=lt.${MAX_GOOD_ODDS}&order=date.asc,created_at.asc`);

const rows = Array.isArray(badRows) ? badRows : [];
const grouped = rows.reduce((acc, row) => {
  const date = row.date || 'unknown';
  if (!acc[date]) acc[date] = [];
  acc[date].push(row);
  return acc;
}, {});

const dates = Object.keys(grouped).sort();
const slateSummaries = [];
for (const date of dates) {
  const currentRows = await pg(`/pick_history?select=id,date,league,odds&date=eq.${encodeURIComponent(date)}&league=eq.MLB`);
  const remainingCount = Array.isArray(currentRows)
    ? currentRows.filter((row) => !grouped[date].some((bad) => bad.id === row.id)).length
    : 0;

  slateSummaries.push({
    date,
    removeCount: grouped[date].length,
    remainingCount,
    badRows: grouped[date].map((row) => ({ id: row.id, pick_label: row.pick_label, odds: row.odds, book: row.book, game_id: row.game_id })),
  });
}

console.log(JSON.stringify({ dryRun: DRY_RUN, maxGoodOdds: MAX_GOOD_ODDS, dates: slateSummaries }, null, 2));

if (DRY_RUN || rows.length === 0) process.exit(0);

for (const date of dates) {
  const targetRows = grouped[date];
  const filters = targetRows.map((row) => `id.eq.${encodeURIComponent(row.id)}`).join(',');
  await pg(`/pick_history?or=(${filters})`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  const remainingRows = await pg(`/pick_history?select=id,provenance,provenance_note&date=eq.${encodeURIComponent(date)}&league=eq.MLB`);
  const remainingCount = Array.isArray(remainingRows) ? remainingRows.length : 0;

  await pg(`/pick_slates?date=eq.${encodeURIComponent(date)}&league=eq.MLB`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      pick_count: remainingCount,
      status: remainingCount > 0 ? 'locked' : 'incomplete',
      provenance: 'manual_repair',
      provenance_note: `Manual repair: removed MLB rows with out-of-bounds odds below ${MAX_GOOD_ODDS} that slipped through the old production gate.`,
      status_note: remainingCount > 0
        ? `Manual repair removed ${targetRows.length} MLB row(s) with invalid production odds below ${MAX_GOOD_ODDS}.`
        : `Manual repair removed all MLB rows for this date because every stored row was below ${MAX_GOOD_ODDS}.`,
      updated_at: new Date().toISOString(),
    }),
  });
}

console.log(JSON.stringify({ applied: true, datesPatched: dates.length, rowsRemoved: rows.length }, null, 2));
