#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const SPORT_MAP = { MLB: 'baseball_mlb', NBA: 'basketball_nba', NHL: 'icehockey_nhl', NFL: 'americanfootball_nfl' };
const KEY_ENV_NAMES = ['ODDS_API_KEY','ODDS_API_KEY_2','ODDS_API_KEY_3','ODDS_API_KEY_4','ODDS_API_KEY_5','ODDS_API_KEY_6'];
const ROOT = cwd;
const OUT_DIR = path.join(ROOT, 'tmp', 'the-odds-historical');
fs.mkdirSync(OUT_DIR, { recursive: true });

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

function normalizeEnv(value) {
  return String(value || '').replace(/^"|"$/g, '').trim();
}

function getKeys() {
  const seen = new Set();
  const keys = [];
  for (const envName of KEY_ENV_NAMES) {
    const key = normalizeEnv(process.env[envName]);
    if (!key || key === 'your_key_here' || seen.has(key)) continue;
    seen.add(key);
    keys.push({ envName, key });
  }
  return keys;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function endOfDay(dateStr) {
  return new Date(`${dateStr}T23:59:59Z`).toISOString().replace('.000Z', 'Z');
}

function* weeklyWindows(startDate, endDate) {
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:59:59Z`);
  while (cursor <= end) {
    const start = new Date(cursor);
    const weekEnd = addDays(start, 6);
    const boundedEnd = weekEnd < end ? weekEnd : end;
    yield {
      startDate: start.toISOString().slice(0, 10),
      endDate: boundedEnd.toISOString().slice(0, 10),
      probeDate: endOfDay(boundedEnd.toISOString().slice(0, 10)),
    };
    cursor = addDays(start, 7);
  }
}

async function fetchHistoricalOdds({ key, sportKey, date }) {
  const url = new URL(`https://api.the-odds-api.com/v4/historical/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', key);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h,spreads,totals');
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('date', date);
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return {
    status: response.status,
    headers: {
      remaining: response.headers.get('x-requests-remaining'),
      used: response.headers.get('x-requests-used'),
      last: response.headers.get('x-requests-last'),
    },
    body,
  };
}

async function main() {
  const sport = String(arg('--sport', 'MLB')).toUpperCase();
  const startDate = arg('--start');
  const endDate = arg('--end');
  if (!startDate || !endDate) throw new Error('Usage: --sport MLB --start 2025-04-01 --end 2025-11-15');
  const sportKey = SPORT_MAP[sport];
  if (!sportKey) throw new Error(`Unsupported sport: ${sport}`);
  const keys = getKeys();
  if (!keys.length) throw new Error('No The Odds API keys found');

  for (const window of weeklyWindows(startDate, endDate)) {
    let result = null;
    let usedEnv = null;
    for (const candidate of keys) {
      const res = await fetchHistoricalOdds({ key: candidate.key, sportKey, date: window.probeDate });
      result = res;
      usedEnv = candidate.envName;
      if (res.status === 200) break;
      if (![401,429].includes(res.status)) break;
    }

    const outPath = path.join(OUT_DIR, `${sport}_${window.startDate}_${window.endDate}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result.body, null, 2));

    if (result.status !== 200) {
      console.log(JSON.stringify({ sport, ...window, status: result.status, env: usedEnv, remaining: result.headers.remaining, used: result.headers.used, outPath, ingested: false }, null, 2));
      continue;
    }

    const ingestRaw = execFileSync(process.execPath, ['scripts/ingest-the-odds-window.mjs', '--sport', sport, '--cache', path.relative(cwd, outPath)], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const ingest = JSON.parse(ingestRaw);
    console.log(JSON.stringify({ sport, ...window, status: result.status, env: usedEnv, remaining: result.headers.remaining, used: result.headers.used, outPath, ingested: true, inserted: ingest.inserted, summary: ingest.summary }, null, 2));
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
