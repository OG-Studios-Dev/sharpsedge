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

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const sourceFile = args.source || 'tmp/goose-training-examples-chunked-2024-01-01-to-2026-04-29.json';
const leagues = String(args.leagues || 'NBA,NHL,MLB,NFL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const outPath = args.out || 'tmp/ask-goose-context-repair-chunked.json';
const startOverride = args.start || null;
const endOverride = args.end || null;

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`RPC ${name} failed ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function count(pathname) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact,head=true' },
  });
  if (!response.ok) throw new Error(`Count failed ${response.status}: ${await response.text()}`);
  const range = response.headers.get('content-range');
  return range ? Number(range.split('/')[1] || 0) : 0;
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthEnd(date) {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function min(a, b) { return a <= b ? a : b; }
function max(a, b) { return a >= b ? a : b; }

function windowsForLeague(rows, league) {
  const dates = rows.filter((row) => String(row.league || row.sport || '').toUpperCase() === league && row.event_date).map((row) => String(row.event_date));
  if (!dates.length) return [];
  const start = startOverride || dates.reduce((a, b) => min(a, b));
  const end = endOverride || dates.reduce((a, b) => max(a, b));
  const windows = [];
  let cursor = `${start.slice(0, 7)}-01`;
  while (cursor <= end) {
    windows.push({ from: max(cursor, start), to: min(monthEnd(cursor), end) });
    cursor = addDays(monthEnd(cursor), 1);
  }
  return windows;
}

function splitWeekly(window) {
  const chunks = [];
  let cursor = window.from;
  while (cursor <= window.to) {
    const to = min(addDays(cursor, 6), window.to);
    chunks.push({ from: cursor, to });
    cursor = addDays(to, 1);
  }
  return chunks;
}

async function repairWindow(league, window) {
  try {
    const rows = await rpc('refresh_game_context_features_v1_range', {
      p_league: league,
      p_start_date: window.from,
      p_end_date: window.to,
    });
    return [{ league, ...window, ok: true, rows, mode: 'month' }];
  } catch (error) {
    const out = [];
    for (const chunk of splitWeekly(window)) {
      try {
        const rows = await rpc('refresh_game_context_features_v1_range', {
          p_league: league,
          p_start_date: chunk.from,
          p_end_date: chunk.to,
        });
        out.push({ league, ...chunk, ok: true, rows, mode: 'week_retry' });
      } catch (retryError) {
        out.push({ league, ...chunk, ok: false, rows: 0, mode: 'week_retry', error: retryError instanceof Error ? retryError.message : String(retryError) });
      }
    }
    return out;
  }
}

const parsed = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const sourceRows = Array.isArray(parsed.rows) ? parsed.rows : [];
const repairs = [];
for (const league of leagues) {
  const windows = windowsForLeague(sourceRows, league);
  for (const window of windows) {
    const results = await repairWindow(league, window);
    repairs.push(...results);
    for (const result of results) {
      console.error(`[context] ${league} ${result.from}..${result.to} ${result.ok ? 'ok' : 'FAIL'} rows=${result.rows} mode=${result.mode}`);
    }
  }
}

const audit = {};
for (const league of leagues) {
  audit[league] = {
    contextRows: await count(`game_context_features_v1?select=canonical_game_id&league=eq.${league}`),
    askRowsWithPct: await count(`ask_goose_query_layer_v1?select=candidate_id&league=eq.${league}&team_win_pct_pre_game=not.is.null`),
    askRowsAbove500: await count(`ask_goose_query_layer_v1?select=candidate_id&league=eq.${league}&team_above_500_pre_game=eq.true`),
    askRowsOpponentAbove500: await count(`ask_goose_query_layer_v1?select=candidate_id&league=eq.${league}&opponent_above_500_pre_game=eq.true`),
  };
}

const artifact = {
  ok: repairs.every((row) => row.ok),
  generated_at: new Date().toISOString(),
  sourceFile,
  leagues,
  repairs,
  failures: repairs.filter((row) => !row.ok),
  audit,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ ok: artifact.ok, outPath, chunks: repairs.length, failures: artifact.failures.length, audit }, null, 2));
