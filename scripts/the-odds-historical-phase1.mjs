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

const SEASONAL_DEFAULTS = {
  NBA: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30, label: 'Oct-Jun' },
  NHL: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30, label: 'Oct-Jun' },
  MLB: { startMonth: 4, startDay: 1, endMonth: 11, endDay: 15, label: 'Apr-Nov' },
  NFL: { startMonth: 9, startDay: 1, endMonth: 2, endDay: 15, label: 'Sep-Feb' },
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

function toCompactIso(value) {
  return new Date(value).toISOString().replace('.000Z', 'Z');
}

function toIsoDayStart(value) {
  return toCompactIso(`${value}T00:00:00.000Z`);
}

function toIsoDayEnd(value) {
  return toCompactIso(`${value}T23:59:59.000Z`);
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toCompactIso(d.toISOString());
}

function endOfDayIso(dateOnly) {
  return `${dateOnly}T23:59:59Z`;
}

function* weeklyWindows(startDate, endDate) {
  let cursor = toIsoDayStart(startDate);
  const endInclusive = new Date(toIsoDayEnd(endDate)).getTime();
  while (new Date(cursor).getTime() <= endInclusive) {
    const next = addDays(cursor, 6);
    const boundedEndInclusive = Math.min(new Date(next).getTime(), endInclusive);
    const boundedEndIso = toCompactIso(new Date(boundedEndInclusive).toISOString());
    const endDateInclusive = boundedEndIso.slice(0, 10);
    yield {
      startDate: cursor.slice(0, 10),
      endDateInclusive,
      probeDate: endOfDayIso(endDateInclusive),
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
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } });
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

function isSnapshotAligned(window, summary) {
  const snapshot = summary?.snapshotTimestamp;
  if (!snapshot) return false;
  return snapshot.slice(0, 10) === window.endDateInclusive;
}

function normalizeDateOnly(value) {
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10);
}

function buildSeasonWindow(sportArg, anchorYear) {
  const season = SEASONAL_DEFAULTS[sportArg];
  if (!season) return null;
  const crossesYear = season.endMonth < season.startMonth;
  const startYear = crossesYear ? anchorYear - 1 : anchorYear;
  const endYear = anchorYear;
  return {
    startDate: normalizeDateOnly(`${startYear}-${String(season.startMonth).padStart(2, '0')}-${String(season.startDay).padStart(2, '0')}`),
    endDate: normalizeDateOnly(`${endYear}-${String(season.endMonth).padStart(2, '0')}-${String(season.endDay).padStart(2, '0')}`),
    label: season.label,
  };
}

function resolveRequestedWindow(sportArg, startDateArg, endDateArg, seasonYearArg) {
  const hasExplicitDates = startDateArg && endDateArg && startDateArg !== '__AUTO__' && endDateArg !== '__AUTO__';
  if (hasExplicitDates) {
    return {
      startDate: normalizeDateOnly(startDateArg),
      endDate: normalizeDateOnly(endDateArg),
      source: 'explicit',
      label: 'explicit',
    };
  }

  const nowYear = new Date().getUTCFullYear();
  const seasonYear = Number(seasonYearArg || nowYear);
  const seasonWindow = buildSeasonWindow(sportArg, seasonYear);
  if (!seasonWindow) throw new Error(`No season defaults for ${sportArg}`);
  return {
    ...seasonWindow,
    source: 'season_default',
    seasonYear,
  };
}

function classifyWindowResult(_sportArg, window, row) {
  if (row.status == null) return 'no_result';
  if (row.status !== 200) return 'http_error';
  if (row.windowAligned) return 'pass';

  const snapshot = row.summary?.snapshotTimestamp;
  if (!snapshot) return 'missing_snapshot_timestamp';

  const snapshotMs = Date.parse(snapshot);
  const probeMs = Date.parse(window.probeDate);
  if (Number.isFinite(snapshotMs) && Number.isFinite(probeMs) && snapshotMs < probeMs) {
    return 'stale_snapshot';
  }

  return 'unaligned_snapshot';
}

async function main() {
  const sportArg = (process.argv[2] || 'NBA').toUpperCase();
  const rawStartDate = process.argv[3] || null;
  const rawEndDate = process.argv[4] || null;
  const maxWindows = Number(process.argv[5] || '2');
  const seasonYearArg = process.argv[6] || null;

  const requestedWindow = resolveRequestedWindow(sportArg, rawStartDate, rawEndDate, seasonYearArg);
  const startDate = requestedWindow.startDate;
  const endDate = requestedWindow.endDate;

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
    const probeDate = window.probeDate;
    let attemptResult = null;

    for (const candidate of keys) {
      const res = await fetchHistoricalOdds({ key: candidate.key, sportKey, date: probeDate });
      const summary = res.status === 200 ? summarizeResponse(res) : null;
      attemptResult = {
        envName: candidate.envName,
        ...res,
        summary,
        windowAligned: res.status === 200 ? isSnapshotAligned(window, summary) : false,
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

  const compact = results.map(({ window, result }) => {
    const row = {
      window,
      status: result?.status ?? null,
      envName: result?.envName ?? null,
      remaining: result?.headers?.remaining ?? null,
      used: result?.headers?.used ?? null,
      last: result?.headers?.last ?? null,
      windowAligned: result?.windowAligned ?? false,
      summary: result?.summary ?? null,
    };
    return {
      ...row,
      classification: classifyWindowResult(sportArg, window, row),
    };
  });

  const passedWindows = compact.filter((row) => row.classification === 'pass').length;
  const failedWindows = compact.length - passedWindows;
  const classificationCounts = compact.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    ok: compact.length > 0 && failedWindows === 0,
    passedWindows,
    failedWindows,
    classificationCounts,
    sport: sportArg,
    sportKey,
    requestedWindow,
    windowsTested: compact.length,
    results: compact,
    outPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
