#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
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

const DRY_RUN = process.argv.includes('--dry-run');
const sport = (argValue('--sport') || 'NBA').toUpperCase();
const startsAfter = argValue('--starts-after');
const startsBefore = argValue('--starts-before');
const finalized = flagValue('--finalized', true);
const includeAltLine = flagValue('--include-alt-line', true);
const limit = Number(argValue('--limit') || 50);
const oddID = argValue('--odd-id') || null;
const chunkDays = Number(argValue('--chunk-days') || 0);
const cursor = argValue('--cursor') || null;
const eventCap = Number(argValue('--event-cap') || 50);
const minWindowMinutes = Math.max(1, Number(argValue('--min-window-minutes') || 60));
const outDir = path.join(cwd, 'tmp', 'sgo-cache');
mkdirSync(outDir, { recursive: true });

const apiKeys = Array.from(new Set(
  [process.env.SPORTSGAMEODDS_API_KEYS, process.env.SPORTSGAMEODDS_API_KEY]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
));

let rankedKeyOrder = apiKeys.map((_, index) => index);

if (!apiKeys.length) throw new Error('Missing SPORTSGAMEODDS_API_KEY(S)');
if (!startsAfter || !startsBefore) throw new Error('Use --starts-after and --starts-before');

const base = 'https://api.sportsgameodds.com/v2/events';
const params = new URLSearchParams({
  leagueID: sport,
  startsAfter,
  startsBefore,
  finalized: String(finalized),
  includeAltLine: String(includeAltLine),
  limit: String(limit),
});
if (oddID) params.set('oddID', oddID);
if (cursor) params.set('cursor', cursor);

const url = `${base}?${params.toString()}`;
function buildCacheKey(windowStart, windowEnd, cursorValue = null) {
  return `${sport}_${windowStart}_${windowEnd}_${finalized}_${includeAltLine}_${limit}_${oddID || 'all'}${cursorValue ? `_cursor_${cursorValue}` : ''}`
    .replace(/[^a-zA-Z0-9._-]+/g, '_');
}

const cacheKey = buildCacheKey(startsAfter, startsBefore, cursor);
const cachePath = path.join(outDir, `${cacheKey}.json`);

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function flagValue(name, fallback = false) {
  const yes = process.argv.includes(name);
  const no = process.argv.includes(`--no-${name.replace(/^--/, '')}`);
  if (yes) return true;
  if (no) return false;
  return fallback;
}

async function usageForKey(index) {
  const key = apiKeys[index];
  const res = await fetch('https://api.sportsgameodds.com/v2/account/usage', {
    headers: { accept: 'application/json', 'x-api-key': key },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const usage = data?.data?.rateLimits?.['per-month'] ?? null;
  const remainingApprox = usage ? Number(usage['max-entities'] ?? 0) - Number(usage['current-entities'] ?? 0) : -Infinity;
  return { index, ok: res.ok, status: res.status, usage, remainingApprox };
}

async function refreshKeyRanking() {
  const usageRows = [];
  for (const index of apiKeys.map((_, i) => i)) usageRows.push(await usageForKey(index));
  rankedKeyOrder = usageRows
    .sort((a, b) => (b.remainingApprox ?? -Infinity) - (a.remainingApprox ?? -Infinity))
    .map((row) => row.index);
  return usageRows;
}

async function fetchWithRotation(targetUrl) {
  let last = null;
  for (const index of rankedKeyOrder) {
    const key = apiKeys[index];
    const res = await fetch(targetUrl, {
      headers: {
        accept: 'application/json',
        'x-api-key': key,
      },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    last = { ok: res.ok, status: res.status, data, text, keyIndex: index + 1 };
    if (res.ok) return last;
    if (![401, 403, 429].includes(res.status)) return last;
  }
  return last;
}

function summarize(payload) {
  const events = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const nextCursor = payload && typeof payload === 'object' ? payload.nextCursor ?? null : null;
  let totalOdds = 0;
  let bookmakerRefs = 0;
  let sample = null;
  for (const event of events) {
    const odds = event?.odds && typeof event.odds === 'object' ? Object.values(event.odds) : [];
    totalOdds += odds.length;
    bookmakerRefs += odds.reduce((sum, odd) => sum + (odd?.byBookmaker ? Object.keys(odd.byBookmaker).length : 0), 0);
    if (!sample && odds[0]) {
      sample = {
        eventID: event.eventID ?? null,
        homeTeamID: event.homeTeamID ?? null,
        awayTeamID: event.awayTeamID ?? null,
        startsAt: event.status?.startsAt ?? null,
        oddID: odds[0].oddID ?? null,
        marketName: odds[0].marketName ?? null,
        score: odds[0].score ?? null,
      };
    }
  }
  return {
    events: events.length,
    totalOdds,
    bookmakerRefs,
    estimatedEntities: events.length + totalOdds,
    nextCursor,
    hitCap: events.length >= eventCap,
    sample,
  };
}

function windowDurationMinutes(startIso, endIso) {
  return Math.max(0, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

function splitWindowMidpoint(startIso, endIso) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!(endMs > startMs)) return null;
  const midpointMs = startMs + Math.floor((endMs - startMs) / 2);
  if (midpointMs <= startMs || midpointMs >= endMs) return null;
  return {
    left: { startsAfter: new Date(startMs).toISOString(), startsBefore: new Date(midpointMs).toISOString() },
    right: { startsAfter: new Date(midpointMs + 1).toISOString(), startsBefore: new Date(endMs).toISOString() },
  };
}

function splitWindows(startIso, endIso, days) {
  if (!days || days <= 0) return [{ startsAfter: startIso, startsBefore: endIso }];
  const out = [];
  let cursor = new Date(startIso);
  const end = new Date(endIso);
  while (cursor <= end) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(Math.min(end.getTime(), chunkStart.getTime() + days * 86400000 - 1000));
    out.push({ startsAfter: chunkStart.toISOString(), startsBefore: chunkEnd.toISOString() });
    cursor = new Date(chunkEnd.getTime() + 1000);
  }
  return out;
}

async function runSingleWindow(windowStart, windowEnd) {
  const localParams = new URLSearchParams({
    leagueID: sport,
    startsAfter: windowStart,
    startsBefore: windowEnd,
    finalized: String(finalized),
    includeAltLine: String(includeAltLine),
    limit: String(limit),
  });
  if (oddID) localParams.set('oddID', oddID);
  const localUrl = `${base}?${localParams.toString()}`;
  const localCacheKey = buildCacheKey(windowStart, windowEnd, null);
  const localCachePath = path.join(outDir, `${localCacheKey}.json`);

  if (existsSync(localCachePath)) {
    const cached = JSON.parse(readFileSync(localCachePath, 'utf8'));
    return { fromCache: true, cachePath: localCachePath, ...cached.meta };
  }

  const usageRowsBefore = await refreshKeyRanking();
  const beforeUsage = await fetchWithRotation('https://api.sportsgameodds.com/v2/account/usage');
  const result = await fetchWithRotation(localUrl);
  const usageRowsAfter = await refreshKeyRanking();
  const afterUsage = await fetchWithRotation('https://api.sportsgameodds.com/v2/account/usage');
  const summary = summarize(result.data);
  const canSplit = windowDurationMinutes(windowStart, windowEnd) > minWindowMinutes;
  const probableTruncation = summary.hitCap && !cursor && canSplit;
  const splitPlan = probableTruncation ? splitWindowMidpoint(windowStart, windowEnd) : null;
  const meta = {
    ok: result.ok,
    status: result.status,
    usedKeyIndex: result.keyIndex,
    sport,
    startsAfter: windowStart,
    startsBefore: windowEnd,
    finalized,
    includeAltLine,
    limit,
    oddID,
    summary,
    usageBefore: beforeUsage.data?.data?.rateLimits?.['per-month'] ?? null,
    usageAfter: afterUsage.data?.data?.rateLimits?.['per-month'] ?? null,
    keyRankingBefore: usageRowsBefore.map((row) => ({ keyIndex: row.index + 1, status: row.status, remainingApprox: row.remainingApprox })),
    keyRankingAfter: usageRowsAfter.map((row) => ({ keyIndex: row.index + 1, status: row.status, remainingApprox: row.remainingApprox })),
    dryRun: DRY_RUN,
    probableTruncation,
    minWindowMinutes,
    splitPlan,
  };
  if (result.ok) writeFileSync(localCachePath, JSON.stringify({ meta, payload: result.data }, null, 2));
  return { fromCache: false, cachePath: localCachePath, ...meta };
}

async function main() {
  const windows = splitWindows(startsAfter, startsBefore, chunkDays);
  if (windows.length === 1 && chunkDays <= 0) {
    if (existsSync(cachePath)) {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      console.log(JSON.stringify({ fromCache: true, cachePath, ...cached.meta }, null, 2));
      return;
    }
  }

  const results = [];
  for (const window of windows) results.push(await runSingleWindow(window.startsAfter, window.startsBefore));

  if (results.length === 1) {
    console.log(JSON.stringify(results[0], null, 2));
    return;
  }

  console.log(JSON.stringify({
    sport,
    startsAfter,
    startsBefore,
    chunkDays,
    windows: results.length,
    totalEvents: results.reduce((sum, row) => sum + (row.summary?.events || 0), 0),
    totalOdds: results.reduce((sum, row) => sum + (row.summary?.totalOdds || 0), 0),
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
