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

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const startDate = args.start || '2024-01-01';
const endDate = args.end || '2026-12-31';
const sports = String(args.sports || 'NBA,NHL,MLB,NFL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const pageSize = Number(args.pageSize || 750);
const maxRows = Number(args.maxRows || 250000);
const outPath = args.out || path.join('tmp', `goose-training-examples-chunked-${startDate}-to-${endDate}.json`);

function isoDateOk(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
if (!isoDateOk(startDate) || !isoDateOk(endDate)) throw new Error('Dates must be YYYY-MM-DD');

async function rest(pathname) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, { headers, cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${pathname} failed ${res.status}: ${text}`);
  if (!text) return [];
  return JSON.parse(text);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStarts(start, end) {
  const out = [];
  let cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  while (cursor.getTime() <= endTime) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function monthEnd(monthStart) {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

const select = [
  'candidate_id',
  'canonical_game_id',
  'event_id',
  'sport',
  'league',
  'event_date',
  'home_team',
  'away_team',
  'team_name',
  'opponent_name',
  'market_family',
  'market_type',
  'side',
  'line',
  'odds',
  'sportsbook',
  'is_favorite',
  'is_underdog',
  'is_home_team_bet',
  'is_away_team_bet',
  'team_above_500_pre_game',
  'opponent_above_500_pre_game',
  'is_back_to_back',
  'is_prime_time',
  'is_divisional_game',
  'team_role',
  'result',
  'graded',
  'integrity_status',
  'profit_units',
  'refreshed_at',
].join(',');

function eventKeyForRow(row) {
  return row.canonical_game_id || row.event_id || `${row.league || row.sport || 'UNKNOWN'}:${row.event_date || 'unknown'}:${row.away_team || ''}@${row.home_team || ''}`;
}

function decisionKey(row) {
  return [
    eventKeyForRow(row),
    row.market_family || 'unknown_market',
    row.market_type || '',
    row.side || 'unknown_side',
    row.team_name || '',
    row.opponent_name || '',
    row.team_role || '',
    row.line == null ? 'no_line' : Number(row.line).toFixed(2),
  ].join('|');
}

function bookRank(book) {
  const preferred = ['pinnacle', 'draftkings', 'fanduel', 'betmgm', 'caesars', 'espnbet'];
  const normalized = String(book || '').toLowerCase().replace(/[^a-z]/g, '');
  const idx = preferred.findIndex((p) => normalized.includes(p));
  return idx === -1 ? preferred.length : idx;
}

function dedupe(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = decisionKey(row);
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }
    const nextRank = bookRank(row.sportsbook);
    const currentRank = bookRank(current.sportsbook);
    if (nextRank < currentRank) best.set(key, row);
    else if (nextRank === currentRank && String(row.refreshed_at || '') > String(current.refreshed_at || '')) best.set(key, row);
  }
  return Array.from(best.values());
}

async function fetchWindow(sport, from, to) {
  const rows = [];
  for (let offset = 0; rows.length < maxRows; offset += pageSize) {
    const params = new URLSearchParams({
      select,
      sport: `eq.${sport}`,
      graded: 'eq.true',
      result: 'in.(win,loss,push)',
      integrity_status: 'eq.ok',
      market_family: 'in.(moneyline,spread,total)',
      order: 'event_date.asc,candidate_id.asc',
      limit: String(pageSize),
      offset: String(offset),
    });
    params.append('event_date', `gte.${from}`);
    params.append('event_date', `lte.${to}`);
    const page = await rest(`/rest/v1/ask_goose_query_layer_v1?${params.toString()}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const rawRows = [];
const windows = [];
for (const monthStart of monthStarts(startDate, endDate)) {
  const from = monthStart < startDate ? startDate : monthStart;
  const to = monthEnd(monthStart) > endDate ? endDate : monthEnd(monthStart);
  windows.push({ from, to });
}

const chunkSummaries = [];
for (const sport of sports) {
  for (const window of windows) {
    try {
      const rows = await fetchWindow(sport, window.from, window.to);
      rawRows.push(...rows);
      chunkSummaries.push({ sport, ...window, rows: rows.length, ok: true });
      console.error(`[export] ${sport} ${window.from}..${window.to}: ${rows.length}`);
    } catch (error) {
      chunkSummaries.push({ sport, ...window, rows: 0, ok: false, error: error instanceof Error ? error.message : String(error) });
      console.error(`[export] ${sport} ${window.from}..${window.to}: FAILED ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const dedupedRows = dedupe(rawRows).map((row) => ({
  example_id: row.candidate_id,
  ...row,
  sport: row.sport || row.league,
  profit_units: Number(row.profit_units || 0),
}));

const artifact = {
  summary: {
    generated_at: new Date().toISOString(),
    source: 'ask_goose_query_layer_v1 chunked monthly export',
    startDate,
    endDate,
    sports,
    windows: windows.length,
    chunks: chunkSummaries.length,
    failedChunks: chunkSummaries.filter((c) => !c.ok),
    rawRows: rawRows.length,
    dedupedRows: dedupedRows.length,
  },
  chunks: chunkSummaries,
  rows: dedupedRows,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ ok: artifact.summary.failedChunks.length === 0, outPath, ...artifact.summary }, null, 2));
