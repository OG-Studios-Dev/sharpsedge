#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const nodeBin = process.env.NODE_BIN || process.execPath || 'node';
const childPathNodeBin = process.env.SGO_CHILD_NODE_BIN || process.execPath || nodeBin;
const startIso = process.argv[2] || '2024-02-01T00:00:00Z';
const endIso = process.argv[3] || new Date().toISOString();
const leagues = (process.argv[4] || 'NHL,MLB,NBA,NFL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const chunkDays = Number(process.argv[5] || 7);
const leagueChunkDays = {
  NFL: Number(process.env.SGO_CHUNK_DAYS_NFL || 3),
  MLB: Number(process.env.SGO_CHUNK_DAYS_MLB || chunkDays),
  NBA: Number(process.env.SGO_CHUNK_DAYS_NBA || chunkDays),
  NHL: Number(process.env.SGO_CHUNK_DAYS_NHL || chunkDays),
};
const limit = Number(process.argv[6] || 250);
const mode = (process.argv[7] || 'append').trim().toLowerCase();
const cacheDir = path.join(cwd, 'tmp', 'sgo-cache');
const ledgerDir = path.join(cwd, 'tmp', 'sgo-ledger');
const ledgerPath = path.join(ledgerDir, 'historical-backfill-ledger.json');
const eventCap = Number(process.env.SGO_EVENT_CAP || 50);
const minWindowMinutes = Math.max(1, Number(process.env.SGO_MIN_WINDOW_MINUTES || 60));
const ENABLE_ODDS_API_PHASE1_PREFLIGHT = String(process.env.ENABLE_ODDS_API_PHASE1_PREFLIGHT || '').trim() === '1';
const ODDS_API_PREFLIGHT_WINDOWS = Math.max(1, Number(process.env.ODDS_API_PHASE1_WINDOWS || 2));
const ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT = String(process.env.ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT || '').trim() === '1';

mkdirSync(cacheDir, { recursive: true });
mkdirSync(ledgerDir, { recursive: true });

function loadEnvFile() {
  const envPath = path.join(cwd, '.env.local');
  if (!existsSync(envPath)) return;
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

loadEnvFile();

function monthStart(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0)); }
function nextMonth(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0)); }
function iso(d) { return d.toISOString(); }
function monthKey(d) { return d.toISOString().slice(0, 7); }

function buildPlan(start, end, leagueList) {
  const rows = [];
  for (const league of leagueList) {
    const requestedStart = new Date(start);
    const requestedEnd = new Date(end);
    const seasonYear = inferSeasonYearForLeague(league, start, end);
    const seasonBounds = resolveLeagueSeasonBounds(league, seasonYear);
    const boundedStart = seasonBounds ? new Date(Math.max(requestedStart.getTime(), seasonBounds.start.getTime())) : requestedStart;
    const boundedEnd = seasonBounds ? new Date(Math.min(requestedEnd.getTime(), seasonBounds.end.getTime())) : requestedEnd;
    if (boundedStart > boundedEnd) continue;
    for (let cur = monthStart(boundedStart); cur <= boundedEnd; cur = nextMonth(cur)) {
      const next = nextMonth(cur);
      const windowEnd = next < boundedEnd ? new Date(next.getTime() - 1000) : new Date(boundedEnd);
      rows.push({ league, month: monthKey(cur), startsAfter: iso(cur), startsBefore: iso(windowEnd) });
    }
  }
  return rows;
}

function splitWindows(start, end, days) {
  const out = [];
  let cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(Math.min(endDate.getTime(), chunkStart.getTime() + days * 86400000 - 1000));
    out.push({ startsAfter: chunkStart.toISOString(), startsBefore: chunkEnd.toISOString() });
    cursor = new Date(chunkEnd.getTime() + 1000);
  }
  return out;
}

function loadLedger() {
  if (!existsSync(ledgerPath)) return [];
  return JSON.parse(readFileSync(ledgerPath, 'utf8'));
}

function saveLedger(rows) {
  writeFileSync(ledgerPath, JSON.stringify(rows, null, 2));
}

function rowKey(row) {
  return `${row.league}|${row.startsAfter}|${row.startsBefore}`;
}

function windowDurationMinutes(start, end) {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function splitWindowMidpoint(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!(endMs > startMs)) return null;
  const midpointMs = startMs + Math.floor((endMs - startMs) / 2);
  if (midpointMs <= startMs || midpointMs >= endMs) return null;
  return [
    { startsAfter: new Date(startMs).toISOString(), startsBefore: new Date(midpointMs).toISOString() },
    { startsAfter: new Date(midpointMs + 1).toISOString(), startsBefore: new Date(endMs).toISOString() },
  ];
}

function shouldSplitWindow(row) {
  const events = Number(row?.pull?.summary?.events ?? 0);
  const nextCursor = row?.pull?.summary?.nextCursor || row?.pull?.probableTruncation || row?.pull?.splitPlan ? true : false;
  if (events < eventCap) return false;
  if (!nextCursor) return false;
  return windowDurationMinutes(row.startsAfter, row.startsBefore) > minWindowMinutes;
}

function dedupeLedger(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    const prev = latest.get(key);
    if (!prev || new Date(row.runAt) >= new Date(prev.runAt)) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort((a, b) => {
    if (a.league !== b.league) return a.league.localeCompare(b.league);
    if (a.startsAfter !== b.startsAfter) return a.startsAfter.localeCompare(b.startsAfter);
    return a.startsBefore.localeCompare(b.startsBefore);
  });
}

function cacheKeyFor(league, startsAfter, startsBefore) {
  return `${league}_${startsAfter}_${startsBefore}_true_true_${limit}_all`.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function cacheFileFor(league, startsAfter, startsBefore) {
  return path.join(cacheDir, `${cacheKeyFor(league, startsAfter, startsBefore)}.json`);
}

function normalizeOutFor(league, startsAfter, startsBefore) {
  return path.join(cacheDir, `${cacheKeyFor(league, startsAfter, startsBefore)}.goose2.${league}.json`);
}

function hasUsableSuccess(row) {
  return row?.status === 'done' && (row?.pull?.ok !== false) && hasIngestedCandidates(row);
}

function hasRetryableRateLimit(row) {
  return row?.pull?.status === 429;
}

function retryableEntryScore(row) {
  const pull = row?.pull ?? {};
  const normalize = row?.normalize ?? {};
  const ingest = row?.ingest ?? {};
  return Number(pull?.summary?.events ?? 0)
    + Number(normalize?.summary?.candidates ?? 0)
    + Number(ingest?.inserted?.candidates ?? 0);
}

function hasIngestedCandidates(row) {
  return Number(((row?.ingest ?? {}).inserted ?? {}).candidates ?? 0) > 0;
}

function isEmptyWindowSuccess(row) {
  const pullEvents = Number(((row?.pull ?? {}).summary ?? {}).events ?? 0);
  const normalizeCandidates = Number(((row?.normalize ?? {}).summary ?? {}).candidates ?? 0);
  const ingestedCandidates = Number((((row?.ingest ?? {}).inserted) ?? {}).candidates ?? 0);
  return pullEvents === 0 && normalizeCandidates === 0 && ingestedCandidates === 0;
}

const LEAGUE_SEASON_DEFAULTS = {
  NBA: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30 },
  NHL: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30 },
  MLB: { startMonth: 4, startDay: 1, endMonth: 9, endDay: 30 },
  NFL: { startMonth: 9, startDay: 1, endMonth: 2, endDay: 15 },
};

function resolveLeagueSeasonBounds(league, seasonYear) {
  const season = LEAGUE_SEASON_DEFAULTS[league];
  if (!season) return null;
  const crossesYear = season.endMonth < season.startMonth;
  const startYear = crossesYear ? seasonYear - 1 : seasonYear;
  const endYear = seasonYear;
  return {
    start: new Date(Date.UTC(startYear, season.startMonth - 1, season.startDay, 0, 0, 0)),
    end: new Date(Date.UTC(endYear, season.endMonth - 1, season.endDay, 23, 59, 59)),
  };
}

function inferSeasonYearForLeague(league, startIsoValue, endIsoValue) {
  const start = new Date(startIsoValue);
  const end = new Date(endIsoValue);
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (league === 'NFL') return end.getUTCMonth() + 1 <= 2 ? endYear : startYear + 1;
  if (league === 'NBA' || league === 'NHL') return endYear;
  return startYear;
}

async function runOddsApiPhase1Preflight(leaguesToCheck, startIsoValue, endIsoValue) {
  if (!ENABLE_ODDS_API_PHASE1_PREFLIGHT) return { enabled: false, ok: true, skipped: true, results: [] };

  const results = [];

  for (const league of leaguesToCheck) {
    try {
      const seasonYear = inferSeasonYearForLeague(league, startIsoValue, endIsoValue);
      const raw = execFileSync(childPathNodeBin, [
        'scripts/the-odds-historical-phase1.mjs',
        league,
        '__AUTO__',
        '__AUTO__',
        String(ODDS_API_PREFLIGHT_WINDOWS),
        String(seasonYear),
      ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
      const parsed = JSON.parse(raw);
      results.push({ league, seasonYear, ...parsed });
    } catch (err) {
      results.push({
        league,
        ok: false,
        error: err?.stderr?.toString?.() || err?.message || String(err),
      });
    }
  }

  return {
    enabled: true,
    skipped: false,
    ok: results.every((row) => row.ok === true),
    defaultVerdict: results.every((row) => row.defaultVerdict === 'trusted_in_season') ? 'trusted_in_season' : 'mixed_or_untrusted',
    results,
  };
}

async function checkSupabaseHealth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return { ok: false, status: 'missing_env', endpoint: null, body: 'Missing Supabase env' };
  const endpoints = [`${supabaseUrl}/rest/v1/`, `${supabaseUrl}/auth/v1/health`];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      const text = await res.text();
      if (!res.ok) return { ok: false, status: res.status, endpoint, body: text.slice(0, 300) };
    } catch (error) {
      return { ok: false, status: 'fetch_error', endpoint, body: String(error?.message || error) };
    }
  }
  return { ok: true, status: 200, endpoint: `${supabaseUrl}/rest/v1/`, body: 'healthy' };
}

let ledger = dedupeLedger(loadLedger());
const latestByKey = new Map(ledger.map((r) => [rowKey(r), r]));
const seen = new Set(
  [...latestByKey.values()]
    .filter((r) => hasUsableSuccess(r))
    .map((r) => rowKey(r))
);
const basePlan = buildPlan(startIso, endIso, leagues);
const extraPlan = [];
for (const row of latestByKey.values()) {
  if (!shouldSplitWindow(row)) continue;
  const children = splitWindowMidpoint(row.startsAfter, row.startsBefore);
  if (!children) continue;
  for (const child of children) {
    extraPlan.push({ league: row.league, month: row.month || row.startsAfter.slice(0, 7), ...child, parentWindowKey: rowKey(row), splitDepth: Number(row.splitDepth || 0) + 1 });
  }
}
const planMap = new Map();
for (const row of [...basePlan, ...extraPlan]) planMap.set(`${row.league}|${row.startsAfter}|${row.startsBefore}`, row);
const plan = [...planMap.values()].sort((a, b) => `${a.league}|${a.startsAfter}`.localeCompare(`${b.league}|${b.startsAfter}`));
const supabaseHealth = await checkSupabaseHealth();
const oddsApiPhase1Preflight = await runOddsApiPhase1Preflight(leagues, startIso, endIso);

if (
  ENABLE_ODDS_API_PHASE1_PREFLIGHT
  && oddsApiPhase1Preflight.enabled
  && !oddsApiPhase1Preflight.skipped
  && oddsApiPhase1Preflight.defaultVerdict !== 'trusted_in_season'
  && !ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT
) {
  console.error(JSON.stringify({
    ok: false,
    blocked: true,
    reason: 'UNTRUSTED_ODDS_API_PREFLIGHT',
    message: 'Historical backfill aborted because Odds API preflight verdict was not trusted_in_season. Set ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT=1 to override deliberately.',
    supabaseHealth,
    oddsApiPhase1Preflight,
  }, null, 2));
  process.exit(2);
}

for (const monthRow of plan) {
  const effectiveChunkDays = leagueChunkDays[monthRow.league] || chunkDays;
  const chunks = splitWindows(monthRow.startsAfter, monthRow.startsBefore, effectiveChunkDays);
  for (const chunk of chunks) {
    const id = `${monthRow.league}|${chunk.startsAfter}|${chunk.startsBefore}`;
    if (mode !== 'retry-errors' && seen.has(id)) continue;

    const existing = latestByKey.get(id);
    if (mode === 'retry-errors' && (!existing || hasUsableSuccess(existing))) continue;

    let pullMeta = existing?.pull ?? null;
    let normalizeMeta = existing?.normalize ?? null;
    let status = 'done';
    let error = null;
    let rowIngestMeta = existing?.ingest ?? null;

    try {
      if (!supabaseHealth.ok) {
        throw new Error(`SUPABASE_UNHEALTHY ${supabaseHealth.status} ${supabaseHealth.endpoint || ''} ${supabaseHealth.body || ''}`);
      }
      const cachePath = cacheFileFor(monthRow.league, chunk.startsAfter, chunk.startsBefore);
      const normalizedPath = normalizeOutFor(monthRow.league, chunk.startsAfter, chunk.startsBefore);
      const canReuseRateLimitedCache = mode === 'retry-errors' && hasRetryableRateLimit(existing) && existsSync(cachePath);

      if (!canReuseRateLimitedCache) {
        const pullRaw = execFileSync(childPathNodeBin, [
          'scripts/sgo-historical-backfill.mjs',
          '--sport', monthRow.league,
          '--starts-after', chunk.startsAfter,
          '--starts-before', chunk.startsBefore,
          '--limit', String(limit),
          '--chunk-days', String(effectiveChunkDays),
          '--event-cap', String(eventCap),
          '--min-window-minutes', String(minWindowMinutes),
        ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
        pullMeta = JSON.parse(pullRaw);
      }

      const cacheExists = existsSync(cachePath);
      const pullSucceeded = pullMeta?.ok !== false && pullMeta?.status !== 429;

      if (cacheExists && pullSucceeded) {
        const shouldNormalize = !existsSync(normalizedPath) || !normalizeMeta || hasRetryableRateLimit(existing) || retryableEntryScore(existing) === 0;
        if (shouldNormalize) {
          const normRaw = execFileSync(childPathNodeBin, [
            'scripts/sgo-normalize-cache.mjs',
            path.relative(cwd, cachePath),
            monthRow.league,
          ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
          normalizeMeta = JSON.parse(normRaw);
        }

        const shouldIngest = !hasIngestedCandidates(existing) || !rowIngestMeta || hasRetryableRateLimit(existing) || retryableEntryScore(existing) === 0;
        if (shouldIngest) {
          const ingestRaw = execFileSync(childPathNodeBin, [
            'scripts/ingest-sgo-goose2-window.mjs',
            '--sport', monthRow.league,
            '--cache', path.relative(cwd, cachePath),
          ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
          rowIngestMeta = JSON.parse(ingestRaw);

          if (['NHL', 'NBA', 'MLB', 'NFL'].includes(monthRow.league)) {
            const enrichRaw = execFileSync(childPathNodeBin, [
              'scripts/enrich-historical-league-ids.mjs',
              chunk.startsAfter.slice(0, 10),
              chunk.startsBefore.slice(0, 10),
              monthRow.league,
            ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
            rowIngestMeta.enrichment = JSON.parse(enrichRaw);
          }
        }
      } else if (!pullSucceeded) {
        status = 'error';
        error = `PULL_FAILED ${pullMeta?.status ?? 'unknown'} for ${monthRow.league} ${chunk.startsAfter}..${chunk.startsBefore}`;
        normalizeMeta = null;
        rowIngestMeta = null;
      }

      if (status === 'done' && !hasIngestedCandidates({ ingest: rowIngestMeta, pull: pullMeta, normalize: normalizeMeta }) && !isEmptyWindowSuccess({ ingest: rowIngestMeta, pull: pullMeta, normalize: normalizeMeta })) {
        status = 'error';
        error = error || `INGEST_MISSING for ${monthRow.league} ${chunk.startsAfter}..${chunk.startsBefore}`;
      }

      if (status === 'done') seen.add(id);
    } catch (err) {
      status = 'error';
      error = err?.stderr?.toString?.() || err?.message || String(err);
    }

    const row = {
      runAt: new Date().toISOString(),
      league: monthRow.league,
      month: monthRow.month,
      startsAfter: chunk.startsAfter,
      startsBefore: chunk.startsBefore,
      chunkDays: effectiveChunkDays,
      limit,
      splitDepth: Number(monthRow.splitDepth || 0),
      parentWindowKey: monthRow.parentWindowKey || null,
      pull: pullMeta,
      normalize: normalizeMeta,
      ingest: rowIngestMeta,
      status,
      error,
    };

    latestByKey.set(id, row);
    ledger = dedupeLedger([...latestByKey.values()]);
    if (hasUsableSuccess(row)) seen.add(id);
    saveLedger(ledger);
    console.log(JSON.stringify({ league: monthRow.league, month: monthRow.month, startsAfter: chunk.startsAfter, startsBefore: chunk.startsBefore, status, events: pullMeta?.summary?.events ?? null, candidates: normalizeMeta?.summary?.candidates ?? null, ingestedCandidates: rowIngestMeta?.inserted?.candidates ?? null }, null, 2));
  }
}

console.log(JSON.stringify({
  ok: true,
  ledgerPath,
  rows: ledger.length,
  mode,
  preflightGate: {
    enabled: ENABLE_ODDS_API_PHASE1_PREFLIGHT,
    overrideUsed: ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT,
    verdict: oddsApiPhase1Preflight.defaultVerdict || null,
    blocked: false,
  },
  supabaseHealth,
  oddsApiPhase1Preflight,
}, null, 2));
