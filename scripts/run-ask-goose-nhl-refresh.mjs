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
const grade = args.grade === '1' || args.grade === 'true';
const hydrateCache = args.hydrateCache !== 'false' && args.hydrateCache !== '0';

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

async function writeQueryLayerForDay(eventDate) {
  const countsByDate = await rpc('count_ask_goose_nhl_serving_rows_by_date', {
    p_start_date: eventDate,
    p_end_date: eventDate,
  });
  const totalRows = Number((countsByDate || [])[0]?.row_count || 0);
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
  return { totalRows, chunks, rowsWritten };
}

for (const eventDate of enumerateDates(startDate, endDate)) {
  const dayStart = eventDate;
  const dayEnd = eventDate;
  const cacheRows = hydrateCache ? Number(await rpc('refresh_ask_goose_nhl_candidate_cache_v1_batch', { p_start_date: dayStart, p_end_date: dayEnd }) || 0) : 0;
  const servingRows = Number(await rpc('refresh_ask_goose_nhl_serving_source_v2', { p_start_date: dayStart, p_end_date: dayEnd }) || 0);
  const beforeGrade = await writeQueryLayerForDay(eventDate);
  const graded = grade ? Number(await rpc('grade_ask_goose_game_markets_from_event_scores_v1', { p_league: 'NHL', p_start_date: dayStart, p_end_date: dayEnd }) || 0) : 0;
  const afterGrade = grade ? await writeQueryLayerForDay(eventDate) : null;
  console.log(JSON.stringify({ eventDate, cacheRows, servingRows, beforeGrade, graded, afterGrade }));
}

const countRes = await fetch(`${SUPABASE_URL}/rest/v1/ask_goose_query_layer_v1?league=eq.NHL&event_date=gte.${startDate}&event_date=lte.${endDate}&select=candidate_id`, {
  headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
});
const contentRange = countRes.headers.get('content-range') || '*/0';
console.log(JSON.stringify({ ok: true, startDate, endDate, grade, hydrateCache, queryLayerCount: Number(contentRange.split('/')[1] || 0) }));