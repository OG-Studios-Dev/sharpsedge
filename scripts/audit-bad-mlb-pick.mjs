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
if (!url || !key) {
  console.error(JSON.stringify({ ok: false, error: 'Missing Supabase env' }, null, 2));
  process.exit(2);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function getJson(endpoint) {
  const res = await fetch(`${url}${endpoint}`, { headers, cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function del(endpoint) {
  const res = await fetch(`${url}${endpoint}`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' }, cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const queries = [
  '/rest/v1/pick_history?select=id,pick_id,date,league,pick_label,odds,book,created_at,game_id,provenance,provenance_note&league=eq.MLB&odds=lt.-200&order=created_at.desc&limit=20',
  '/rest/v1/pick_slates?select=*&league=eq.MLB&order=locked_at.desc&limit=10',
];

const [badRows, slates] = await Promise.all(queries.map(getJson));
console.log(JSON.stringify({ ok: true, badRows, slates: Array.isArray(slates) ? slates.map(s => ({ date: s.date, league: s.league, pick_count: s.pick_count, integrity_status: s.integrity_status, locked_at: s.locked_at })) : slates }, null, 2));

if (process.argv.includes('--delete') && Array.isArray(badRows) && badRows.length) {
  const target = badRows[0];
  const idField = target.id ? `id=eq.${encodeURIComponent(target.id)}` : target.pick_id ? `pick_id=eq.${encodeURIComponent(target.pick_id)}` : null;
  if (!idField) throw new Error('No id or pick_id on target row');
  const deleted = await del(`/rest/v1/pick_history?${idField}`);
  console.log(JSON.stringify({ deleted }, null, 2));
}
