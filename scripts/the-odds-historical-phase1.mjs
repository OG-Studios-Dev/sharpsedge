#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'the-odds-phase1');
const ODDS_BASE = 'https://api.the-odds-api.com/v4';
const MARKETS = 'h2h,spreads,totals';

const SPORT_MAP = {
  NBA: 'basketball_nba',
  NHL: 'icehockey_nhl',
  MLB: 'baseball_mlb',
  NFL: 'americanfootball_nfl',
};

const KEY_ENV_NAMES = [
  'ODDS_API_KEY',
  'ODDS_API_KEY_2',
  'ODDS_API_KEY_3',
  'ODDS_API_KEY_4',
  'ODDS_API_KEY_5',
  'ODDS_API_KEY_6',
];

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

function toIsoDayStart(value) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toIsoDayEnd(value) {
  return new Date(`${value}T23:59:59.000Z`).toISOString();
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function* weeklyWindows(startDate, endDate) {
  let cursor = toIsoDayStart(startDate);
  const end = new Date(toIsoDayEnd(endDate)).getTime();
  while (new Date(cursor).getTime() <= end) {
    const next = addDays(cursor, 6);
    const boundedEnd = Math.min(new Date(next).getTime(), end);
    yield {
      start: cursor,
      end: new Date(boundedEnd).toISOString().replace('.000Z', '.000Z').slice(0,24)+'Z'.replace('ZZ','Z'),
    };
    cursor = addDays(cursor, 7);
  }
}

async function fetchHistoricalOdds({ key, sportKey, date }) {
  const url = new URL(`${ODDS_BASE}/historical/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', key);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', MARKETS);
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('date', date);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return {
    status: response.status,
    headers: {
      remaining: response.headers.get('x-requests-remaining'),
      used: response.headers.get('x-requests-used'),
      last: response.headers.get('x-requests-last'),
    },
    body,
    url: url.toString().replace(key, 'REDACTED'),
  };
}

function summarizeResponse(payload) {
  const data = Array.isArray(payload?.body?.data) ? payload.body.data : [];
  let books = new Set();
  let marketCounts = { h2h: 0, spreads: 0, totals: 0 };
  for (const event of data) {
    for (const bookmaker of event.bookmakers || []) {
      if (bookmaker?.title) books.add(bookmaker.title);
      for (const market of bookmaker.markets || []) {
        if (market?.key in marketCounts) marketCounts[market.key] += 1;
      }
    }
  }
  return {
    snapshotTimestamp: payload?.body?.timestamp || null,
    previousTimestamp: payload?.body?.previous_timestamp || null,
    nextTimestamp: payload?.body?.next_timestamp || null,
    eventCount: data.length,
    bookmakerCount: books.size,
    marketCounts,
  };
}

async function main() {
  const sportArg = (process.argv[2] || 'NBA').toUpperCase();
  const startDate = process.argv[3] || '2024-01-01';
  const endDate = process.argv[4] || '2024-01-31';
  const maxWindows = Number(process.argv[5] || '2');

  const sportKey = SPORT_MAP[sportArg];
  if (!sportKey) {
    console.error(`Unsupported sport '${sportArg}'. Use one of: ${Object.keys(SPORT_MAP).join(', ')}`);
    process.exit(1);
  }

  const keys = getKeys();
  if (!keys.length) {
    console.error('No The Odds API keys found in env.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const windows = [...weeklyWindows(startDate, endDate)].slice(0, maxWindows);
  const results = [];

  for (let i = 0; i < windows.length; i += 1) {
    const window = windows[i];
    const probeDate = window.end;
    let attemptResult = null;

    for (const candidate of keys) {
      const res = await fetchHistoricalOdds({ key: candidate.key, sportKey, date: probeDate });
      attemptResult = {
        envName: candidate.envName,
        ...res,
        summary: res.status === 200 ? summarizeResponse(res) : null,
      };
      if (res.status === 200) break;
      if (res.status !== 401 && res.status !== 429) break;
    }

    results.push({ window, result: attemptResult });
  }

  const outPath = path.join(OUT_DIR, `${sportArg}_${startDate}_${endDate}.json`);
  await writeFile(outPath, JSON.stringify({
    sport: sportArg,
    sportKey,
    startDate,
    endDate,
    markets: MARKETS.split(','),
    windows: results,
    capturedAt: new Date().toISOString(),
  }, null, 2));

  const compact = results.map(({ window, result }) => ({
    window,
    status: result?.status ?? null,
    envName: result?.envName ?? null,
    remaining: result?.headers?.remaining ?? null,
    used: result?.headers?.used ?? null,
    last: result?.headers?.last ?? null,
    summary: result?.summary ?? null,
  }));

  console.log(JSON.stringify({
    ok: compact.some((row) => row.status === 200),
    sport: sportArg,
    sportKey,
    windowsTested: compact.length,
    results: compact,
    outPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
