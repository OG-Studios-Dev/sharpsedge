#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k, v = ''] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));
const startDate = args.startDate || '2025-09-01';
const endDate = args.endDate || '2026-02-28';
const dryRun = args.dryRun === '1' || args.dryRun === 'true';

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function ymd(date) { return date.toISOString().slice(0, 10); }
function espnDate(date) { return ymd(date).replaceAll('-', ''); }
function norm(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function teamMatch(a, b) {
  const aa = norm(a); const bb = norm(b);
  return Boolean(aa && bb && (aa === bb || aa.includes(bb) || bb.includes(aa)));
}
function dates(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) { out.push(new Date(cur)); cur.setUTCDate(cur.getUTCDate() + 1); }
  return out;
}

async function rest(pathname, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, { headers: { ...headers, ...(options.headers || {}) }, method: options.method || 'GET', body: options.body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${pathname} failed ${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function rpc(fn, body) {
  return rest(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
}
async function fetchEspn(day) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${espnDate(day)}`);
  if (!res.ok) throw new Error(`ESPN ${res.status} ${ymd(day)}`);
  return await res.json();
}
async function fetchDbEvents(day) {
  const q = new URLSearchParams({ select: 'event_id,sport,league,event_date,commence_time,home_team,away_team,status,event_label,source,source_event_id,odds_api_event_id,metadata', league: 'eq.NFL', event_date: `eq.${ymd(day)}` });
  return await rest(`/rest/v1/goose_market_events?${q}`);
}
async function patchEvents(rows) {
  if (!rows.length || dryRun) return 0;
  await rest('/rest/v1/goose_market_events?on_conflict=event_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

const daily = [];
for (const day of dates(startDate, endDate)) {
  const date = ymd(day);
  const [espn, dbEvents] = await Promise.all([fetchEspn(day), fetchDbEvents(day)]);
  const finals = (espn.events || []).filter((event) => event?.status?.type?.completed === true);
  const patches = [];
  for (const db of dbEvents) {
    const match = finals.find((event) => {
      const competitors = event?.competitions?.[0]?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      return teamMatch(db.home_team, home?.team?.displayName) && teamMatch(db.away_team, away?.team?.displayName);
    });
    if (!match) continue;
    const competitors = match?.competitions?.[0]?.competitors || [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const homeScore = Number(home?.score);
    const awayScore = Number(away?.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    const metadata = {
      ...(db.metadata && typeof db.metadata === 'object' ? db.metadata : {}),
      espn_event_id: String(match.id || ''),
      espn_status: match.status?.type || null,
      teams: {
        home: {
          score: homeScore,
          names: { long: db.home_team, medium: home?.team?.displayName || db.home_team, abbreviation: home?.team?.abbreviation || null },
        },
        away: {
          score: awayScore,
          names: { long: db.away_team, medium: away?.team?.displayName || db.away_team, abbreviation: away?.team?.abbreviation || null },
        },
      },
    };
    patches.push({
      event_id: db.event_id,
      sport: db.sport || 'NFL',
      league: db.league || 'NFL',
      event_date: db.event_date,
      commence_time: db.commence_time,
      home_team: db.home_team,
      away_team: db.away_team,
      status: 'final',
      event_label: db.event_label || `${db.away_team} @ ${db.home_team}`,
      source: db.source || 'the_odds_api',
      source_event_id: db.source_event_id,
      odds_api_event_id: db.odds_api_event_id,
      metadata,
    });
  }
  const patched = await patchEvents(patches);
  daily.push({ date, espnFinals: finals.length, dbEvents: dbEvents.length, patched });
  console.log(JSON.stringify(daily[daily.length - 1]));
}

const monthly = [];
if (!dryRun) {
  const months = new Map();
  for (const day of dates(startDate, endDate)) {
    const key = ymd(day).slice(0, 7);
    const start = months.get(key)?.start || ymd(day);
    months.set(key, { start, end: ymd(day) });
  }
  for (const { start, end } of months.values()) {
    const materialized = Number(await rpc('refresh_ask_goose_nfl_simple_v1', { p_start_date: start, p_end_date: end }) || 0);
    const graded = Number(await rpc('grade_ask_goose_game_markets_from_event_scores_v1', { p_league: 'NFL', p_start_date: start, p_end_date: end }) || 0);
    const rematerialized = Number(await rpc('refresh_ask_goose_nfl_simple_v1', { p_start_date: start, p_end_date: end }) || 0);
    const row = { start, end, materialized, graded, rematerialized };
    monthly.push(row);
    console.log(JSON.stringify(row));
  }
}

const summary = {
  ok: true,
  dryRun,
  startDate,
  endDate,
  days: daily.length,
  espnFinals: daily.reduce((sum, row) => sum + row.espnFinals, 0),
  dbEvents: daily.reduce((sum, row) => sum + row.dbEvents, 0),
  patched: daily.reduce((sum, row) => sum + row.patched, 0),
  materialized: monthly.reduce((sum, row) => sum + row.materialized, 0),
  graded: monthly.reduce((sum, row) => sum + row.graded, 0),
  rematerialized: monthly.reduce((sum, row) => sum + row.rematerialized, 0),
  monthly,
  daily,
};
fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
const outPath = path.join(process.cwd(), 'tmp', `ask-goose-nfl-espn-score-backfill-${startDate}-to-${endDate}.json`);
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, daily: undefined, outPath }, null, 2));
