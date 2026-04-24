#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k, v = ''] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));

const league = String(args.league || '').trim().toUpperCase();
const startDate = args.startDate;
const endDate = args.endDate;
const dryRun = args.dryRun === 'true' || args.dryRun === '1';
if (!['NBA', 'MLB'].includes(league)) throw new Error('--league must be NBA or MLB');
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) throw new Error('--startDate and --endDate are required as YYYY-MM-DD');

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function count(pathname) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`count failed ${res.status}: ${text}`);
  return Number((res.headers.get('content-range') || '0/0').split('/').pop() || 0);
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

const rows = [];
for (const day of enumerateDates(startDate, endDate)) {
  const beforeRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}`);
  if (dryRun) {
    rows.push({ day, dryRun: true, beforeRows });
    continue;
  }
  const materializedBeforeGrade = Number(await rpc('refresh_ask_goose_simple_league_v1', { p_league: league, p_start_date: day, p_end_date: day }) || 0);
  const graded = Number(await rpc('grade_ask_goose_game_markets_from_event_scores_v1', { p_league: league, p_start_date: day, p_end_date: day }) || 0);
  const materializedAfterGrade = Number(await rpc('refresh_ask_goose_simple_league_v1', { p_league: league, p_start_date: day, p_end_date: day }) || 0);
  const afterRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}`);
  const gradedRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}&graded=eq.true`);
  rows.push({ day, beforeRows, materializedBeforeGrade, graded, materializedAfterGrade, afterRows, gradedRows });
  console.log(JSON.stringify(rows.at(-1)));
}

const summary = {
  ok: true,
  league,
  startDate,
  endDate,
  dryRun,
  days: rows.length,
  totalAfterRows: rows.reduce((sum, row) => sum + Number(row.afterRows || 0), 0),
  totalGradedRows: rows.reduce((sum, row) => sum + Number(row.gradedRows || 0), 0),
  rows,
};

fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
const outPath = path.join(process.cwd(), 'tmp', `ask-goose-${league.toLowerCase()}-backfill-${startDate}-to-${endDate}.json`);
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, rows: undefined, outPath }, null, 2));
