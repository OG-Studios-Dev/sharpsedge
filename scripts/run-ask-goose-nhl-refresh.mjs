#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k, v=''] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));
const startDate = args.startDate || '2026-03-01';
const endDate = args.endDate || '2026-03-07';
const chunkSize = Number(args.chunkSize || 1000);
const totalsFile = args.totalsFile || '';

function headers(extra={}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function rest(pathname) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, { headers: headers({ Range: '0-199999' }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

function enumerateDates(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

let totalsOverride = null;
if (totalsFile) {
  totalsOverride = JSON.parse(fs.readFileSync(path.resolve(cwd, totalsFile), 'utf8'));
}

for (const eventDate of enumerateDates(startDate, endDate)) {
  const dayStart = eventDate;
  const dayEnd = eventDate;
  const servingRows = Number(await rpc('refresh_ask_goose_nhl_serving_source_v2', { p_start_date: dayStart, p_end_date: dayEnd }) || 0);
  const rows = totalsOverride ? null : await rest(`/rest/v1/ask_goose_nhl_serving_source_v2?select=event_date&event_date=eq.${eventDate}&limit=200000`);
  const totalRows = totalsOverride ? Number(totalsOverride[eventDate] || 0) : rows.length;
  let chunkStart = 1;
  let rowsWritten = 0;
  let chunks = 0;
  let first = true;
  while (chunkStart <= totalRows) {
    const written = Number(await rpc('refresh_ask_goose_query_layer_nhl_v2_chunk', {
      p_event_date: eventDate,
      p_chunk_start: chunkStart,
      p_chunk_size: chunkSize,
      p_delete_existing: first,
    }) || 0);
    rowsWritten += written;
    chunks += 1;
    first = false;
    chunkStart += chunkSize;
  }
  console.log(JSON.stringify({ eventDate, servingRows, totalRows, chunks, rowsWritten }));
}

const countRes = await fetch(`${SUPABASE_URL}/rest/v1/ask_goose_query_layer_v1?league=eq.NHL&event_date=gte.${startDate}&event_date=lte.${endDate}&select=candidate_id`, {
  headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
});
const contentRange = countRes.headers.get('content-range') || '*/0';
console.log(JSON.stringify({ ok: true, startDate, endDate, queryLayerCount: Number(contentRange.split('/')[1] || 0) }));