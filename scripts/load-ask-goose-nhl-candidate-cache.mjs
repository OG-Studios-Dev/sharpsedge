#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k, v=''] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));
const startDate = args.startDate || null;
const endDate = args.endDate || null;
if (!startDate || !endDate) throw new Error('Usage: --startDate=YYYY-MM-DD --endDate=YYYY-MM-DD');

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(pathname, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${pathname} :: ${text.slice(0, 500)}`);
  }
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchCandidatesForDate(date) {
  const allRows = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      select: 'candidate_id,event_id,sport,event_date,market_type,submarket_type,participant_name,side,line,odds,book,capture_ts',
      sport: 'eq.NHL',
      event_date: `eq.${date}`,
      order: 'capture_ts.desc',
      limit: String(pageSize),
      offset: String(offset),
    });
    const rows = await rest(`/goose_market_candidates?${params.toString()}`);
    const page = Array.isArray(rows) ? rows : [];
    allRows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  const latestByCandidate = new Map();
  for (const row of allRows) {
    const existing = latestByCandidate.get(row.candidate_id);
    if (!existing || String(row.capture_ts || '') > String(existing.capture_ts || '')) {
      latestByCandidate.set(row.candidate_id, row);
    }
  }
  return Array.from(latestByCandidate.values()).map((row) => ({
    candidate_id: row.candidate_id,
    event_id: row.event_id,
    sport: row.sport,
    event_date: row.event_date,
    market_type: row.market_type,
    submarket_type: row.submarket_type,
    participant_name: row.participant_name,
    side: row.side,
    line: row.line,
    odds: row.odds,
    sportsbook: row.book ?? null,
    cached_at: new Date().toISOString(),
  }));
}

function dateRange(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function replaceDateSlice(date, rows) {
  await rest(`/ask_goose_nhl_candidate_cache_v1?event_date=eq.${date}`, { method: 'DELETE' });
  if (!rows.length) return 0;
  await rest('/ask_goose_nhl_candidate_cache_v1?on_conflict=candidate_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

let total = 0;
const dates = dateRange(startDate, endDate);
for (const date of dates) {
  const rows = await fetchCandidatesForDate(date);
  const written = await replaceDateSlice(date, rows);
  total += written;
  console.log(JSON.stringify({ date, candidatesFetched: rows.length, rowsWritten: written }));
}
console.log(JSON.stringify({ ok: true, startDate, endDate, totalDates: dates.length, totalRowsWritten: total }));
