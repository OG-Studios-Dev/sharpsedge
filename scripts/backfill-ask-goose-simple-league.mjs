#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

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
const stopOnFailure = args.stopOnFailure !== 'false';
const minGradeRate = Number(args.minGradeRate || 0);
const maxDayMs = Number(args.maxDayMs || 45000);
if (!['NBA', 'MLB'].includes(league)) throw new Error('--league must be NBA or MLB');
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) throw new Error('--startDate and --endDate are required as YYYY-MM-DD');

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function requestWithRetry(label, fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const retryable = /57014|timeout|fetch failed|ECONNRESET|ETIMEDOUT|502|503|504/i.test(message);
      if (!retryable || attempt === attempts) break;
      const waitMs = 1000 * attempt;
      console.error(JSON.stringify({ level: 'warn', label, attempt, retryingInMs: waitMs, error: message.slice(0, 400) }));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

async function rpc(fn, body) {
  return requestWithRetry(fn, async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${fn} failed ${res.status}: ${text}`);
    try { return JSON.parse(text); } catch { return text; }
  });
}

async function count(pathname) {
  return requestWithRetry(`count:${pathname}`, async () => {
    const res = await fetch(`${SUPABASE_URL}${pathname}`, {
      headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`count failed ${res.status}: ${text}`);
    return Number((res.headers.get('content-range') || '0/0').split('/').pop() || 0);
  });
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

function qualityStatus(row) {
  if (row.error) return 'failed';
  if (row.afterRows === 0) return row.beforeRows === 0 ? 'empty' : 'lost_rows';
  if (row.materializedBeforeGrade !== row.materializedAfterGrade) return 'row_count_changed_after_grade';
  if (row.gradedRows > row.afterRows) return 'bad_graded_count';
  if (row.gradeRate < minGradeRate) return 'low_grade_rate';
  if (row.durationMs > maxDayMs) return 'slow_day';
  return 'ok';
}

const rows = [];
for (const day of enumerateDates(startDate, endDate)) {
  const started = performance.now();
  try {
    const beforeRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}`);
    if (dryRun) {
      const row = { day, dryRun: true, beforeRows, durationMs: Math.round(performance.now() - started) };
      row.status = qualityStatus(row);
      rows.push(row);
      console.log(JSON.stringify(row));
      continue;
    }
    const materializedBeforeGrade = Number(await rpc('refresh_ask_goose_simple_league_v1', { p_league: league, p_start_date: day, p_end_date: day }) || 0);
    const graded = Number(await rpc('grade_ask_goose_game_markets_from_event_scores_v1', { p_league: league, p_start_date: day, p_end_date: day }) || 0);
    const materializedAfterGrade = Number(await rpc('refresh_ask_goose_simple_league_v1', { p_league: league, p_start_date: day, p_end_date: day }) || 0);
    const afterRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}`);
    const gradedRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}&graded=eq.true`);
    const ungradeableRows = await count(`/rest/v1/ask_goose_query_layer_v1?select=*&league=eq.${league}&event_date=eq.${day}&result=eq.ungradeable`);
    const durationMs = Math.round(performance.now() - started);
    const gradeRate = afterRows > 0 ? Number((gradedRows / afterRows).toFixed(4)) : 0;
    const row = { day, beforeRows, materializedBeforeGrade, graded, materializedAfterGrade, afterRows, gradedRows, ungradeableRows, gradeRate, durationMs };
    row.status = qualityStatus(row);
    rows.push(row);
    console.log(JSON.stringify(row));
    if (stopOnFailure && !['ok', 'empty'].includes(row.status)) break;
  } catch (error) {
    const row = { day, error: String(error?.message || error), durationMs: Math.round(performance.now() - started) };
    row.status = qualityStatus(row);
    rows.push(row);
    console.error(JSON.stringify(row));
    if (stopOnFailure) break;
  }
}

const failedRows = rows.filter((row) => !['ok', 'empty'].includes(row.status));
const summary = {
  ok: failedRows.length === 0,
  league,
  startDate,
  endDate,
  dryRun,
  stopOnFailure,
  minGradeRate,
  maxDayMs,
  days: rows.length,
  totalAfterRows: rows.reduce((sum, row) => sum + Number(row.afterRows || 0), 0),
  totalGradedRows: rows.reduce((sum, row) => sum + Number(row.gradedRows || 0), 0),
  totalUngradeableRows: rows.reduce((sum, row) => sum + Number(row.ungradeableRows || 0), 0),
  avgGradeRate: rows.reduce((sum, row) => sum + Number(row.afterRows || 0), 0) > 0
    ? Number((rows.reduce((sum, row) => sum + Number(row.gradedRows || 0), 0) / rows.reduce((sum, row) => sum + Number(row.afterRows || 0), 0)).toFixed(4))
    : 0,
  failedRows,
  rows,
};

fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
const outPath = path.join(process.cwd(), 'tmp', `ask-goose-${league.toLowerCase()}-backfill-${startDate}-to-${endDate}.json`);
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, rows: undefined, outPath }, null, 2));
if (!summary.ok) process.exitCode = 1;
