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
let ENABLE_ODDS_API_PHASE1_PREFLIGHT = false;
let ODDS_API_PREFLIGHT_WINDOWS = 2;
let ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT = false;
let MIN_SGO_QUOTA_REMAINING = 1;
let ALLOW_SGO_QUOTA_EXHAUSTED = false;

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
ENABLE_ODDS_API_PHASE1_PREFLIGHT = String(process.env.ENABLE_ODDS_API_PHASE1_PREFLIGHT || '').trim() === '1';
ODDS_API_PREFLIGHT_WINDOWS = Math.max(1, Number(process.env.ODDS_API_PHASE1_WINDOWS || 2));
ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT = String(process.env.ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT || '').trim() === '1';
MIN_SGO_QUOTA_REMAINING = Math.max(1, Number(process.env.MIN_SGO_QUOTA_REMAINING || 1));
ALLOW_SGO_QUOTA_EXHAUSTED = String(process.env.ALLOW_SGO_QUOTA_EXHAUSTED || '').trim() === '1';

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

function isTerminalNoOddsWindow(row) {
  return row?.status === 'skipped' && row?.skipReason === 'source_no_odds_available';
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

function isNoOddsAvailableWindow(row) {
  const pull = row?.pull ?? {};
  const pullEvents = Number((pull.summary ?? {}).events ?? 0);
  const totalOdds = Number((pull.summary ?? {}).totalOdds ?? 0);
  const normalizeCandidates = Number(((row?.normalize ?? {}).summary ?? {}).candidates ?? 0);
  const ingestedCandidates = Number((((row?.ingest ?? {}).inserted) ?? {}).candidates ?? 0);
  return pullEvents > 0 && totalOdds === 0 && normalizeCandidates === 0 && ingestedCandidates === 0;
}

const LEAGUE_SEASON_DEFAULTS = {
  NBA: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30 },
  NHL: { startMonth: 10, startDay: 1, endMonth: 6, endDay: 30 },
  MLB: { startMonth: 3, startDay: 1, endMonth: 11, endDay: 15 },
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

function getSgoApiKeys() {
  return Array.from(new Set(
    [process.env.SPORTSGAMEODDS_API_KEYS, process.env.SPORTSGAMEODDS_API_KEY]
      .filter(Boolean)
      .join(',')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ));
}

async function checkSgoQuota() {
  const keys = getSgoApiKeys();
  if (!keys.length) {
    return { ok: false, blocked: true, reason: 'missing_sgo_keys', minRemainingRequired: MIN_SGO_QUOTA_REMAINING, keys: 0, ranked: [] };
  }

  const ranked = [];
  for (let index = 0; index < keys.length; index += 1) {
    try {
      const res = await fetch('https://api.sportsgameodds.com/v2/account/usage', {
        headers: { accept: 'application/json', 'x-api-key': keys[index] },
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      const usage = data?.data?.rateLimits?.['per-month'] ?? null;
      const maxEntities = Number(usage?.['max-entities'] ?? 0);
      const currentEntities = Number(usage?.['current-entities'] ?? 0);
      ranked.push({
        keyIndex: index + 1,
        ok: res.ok,
        status: res.status,
        usage,
        remainingApprox: usage ? maxEntities - currentEntities : null,
      });
    } catch (error) {
      ranked.push({ keyIndex: index + 1, ok: false, status: 'fetch_error', usage: null, remainingApprox: null, error: String(error?.message || error) });
    }
  }

  ranked.sort((a, b) => (b.remainingApprox ?? -Infinity) - (a.remainingApprox ?? -Infinity));
  const bestRemaining = ranked[0]?.remainingApprox ?? null;
  const usable = ranked.some((row) => row.ok && Number(row.remainingApprox ?? -Infinity) >= MIN_SGO_QUOTA_REMAINING);
  return {
    ok: usable,
    blocked: !usable,
    reason: usable ? null : 'source_quota_exhausted',
    overrideUsed: ALLOW_SGO_QUOTA_EXHAUSTED,
    minRemainingRequired: MIN_SGO_QUOTA_REMAINING,
    keys: ranked.length,
    bestRemaining,
    ranked,
  };
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
const sgoQuotaPreflight = await checkSgoQuota();
const oddsApiPhase1Preflight = await runOddsApiPhase1Preflight(leagues, startIso, endIso);
const runRows = [];

if (sgoQuotaPreflight.blocked && !ALLOW_SGO_QUOTA_EXHAUSTED) {
  console.error(JSON.stringify({
    ok: false,
    status: 'blocked',
    blocked: true,
    reason: 'SGO_QUOTA_EXHAUSTED',
    message: 'SportsGameOdds historical backfill aborted before event pulls because no configured key has enough monthly entity quota remaining. Set ALLOW_SGO_QUOTA_EXHAUSTED=1 to override deliberately.',
    ledgerPath,
    rows: ledger.length,
    mode,
    supabaseHealth,
    sgoQuotaPreflight,
    oddsApiPhase1Preflight,
  }, null, 2));
  process.exit(3);
}

function classifyBackfillError(row) {
  if (row.status !== 'error') return null;
  const errorText = String(row.error || '');
  const pullStatus = row?.pull?.status;
  const events = Number(row?.pull?.summary?.events ?? 0);
  const candidates = row?.normalize?.summary?.candidates;
  const ingested = row?.ingest?.inserted?.candidates;

  const usage = row?.pull?.usageAfter || row?.pull?.usageBefore;
  const maxEntities = Number(usage?.['max-entities'] ?? usage?.maxEntities ?? usage?.limit ?? 0);
  const currentEntities = Number(usage?.['current-entities'] ?? usage?.currentEntities ?? usage?.used ?? 0);

  if ((pullStatus === 401 || /PULL_FAILED 401/.test(errorText)) && maxEntities > 0 && currentEntities >= maxEntities) return 'source_quota_exhausted';
  if (pullStatus === 401 || /PULL_FAILED 401/.test(errorText)) return 'source_auth_error';
  if (pullStatus === 429 || /PULL_FAILED 429/.test(errorText)) return 'source_rate_limited';
  if (String(pullStatus).startsWith('5') || /PULL_FAILED 5\d\d/.test(errorText)) return 'source_server_error';
  if (/SUPABASE_UNHEALTHY/.test(errorText)) return 'supabase_unhealthy';
  if (/statement timeout|canceling statement due to statement timeout/i.test(errorText)) return 'supabase_timeout';
  const totalOdds = Number(row?.pull?.summary?.totalOdds ?? 0);
  if (/INGEST_MISSING/.test(errorText) && events > 0 && totalOdds === 0 && Number(candidates ?? 0) === 0) return 'source_no_odds_available';
  if (/INGEST_MISSING/.test(errorText) && events > 0 && Number(candidates ?? 0) === 0) return 'normalization_zero_candidates';
  if (/INGEST_MISSING/.test(errorText) && events > 0 && Number(candidates ?? 0) > 0 && Number(ingested ?? 0) === 0) return 'ingest_zero_inserted';
  if (/INGEST_MISSING/.test(errorText) && events === 0) return 'empty_window_incomplete_metadata';
  if (/Unexpected token|JSON/.test(errorText)) return 'child_json_parse_error';
  return 'unknown_error';
}

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
        if (isNoOddsAvailableWindow({ ingest: rowIngestMeta, pull: pullMeta, normalize: normalizeMeta })) {
          status = 'skipped';
          error = null;
        } else {
          status = 'error';
          error = error || `INGEST_MISSING for ${monthRow.league} ${chunk.startsAfter}..${chunk.startsBefore}`;
        }
      }

      if (status === 'done' || status === 'skipped') seen.add(id);
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
      skipReason: status === 'skipped' ? 'source_no_odds_available' : null,
    };
    row.errorClass = classifyBackfillError(row);

    latestByKey.set(id, row);
    runRows.push(row);
    ledger = dedupeLedger([...latestByKey.values()]);
    if (hasUsableSuccess(row) || isTerminalNoOddsWindow(row)) seen.add(id);
    saveLedger(ledger);
    console.log(JSON.stringify({ league: monthRow.league, month: monthRow.month, startsAfter: chunk.startsAfter, startsBefore: chunk.startsBefore, status, errorClass: row.errorClass, error: row.error, events: pullMeta?.summary?.events ?? null, candidates: normalizeMeta?.summary?.candidates ?? null, ingestedCandidates: rowIngestMeta?.inserted?.candidates ?? null }, null, 2));
  }
}

const chunkStatusCounts = runRows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const errorClassCounts = runRows.reduce((acc, row) => {
  if (!row.errorClass) return acc;
  acc[row.errorClass] = (acc[row.errorClass] || 0) + 1;
  return acc;
}, {});
const failedChunks = runRows.filter((row) => row.status === 'error').length;
const partial = failedChunks > 0;

console.log(JSON.stringify({
  ok: !partial,
  status: partial ? 'partial' : 'done',
  ledgerPath,
  rows: ledger.length,
  chunksProcessed: runRows.length,
  chunkStatusCounts,
  failedChunks,
  errorClassCounts,
  mode,
  preflightGate: {
    enabled: ENABLE_ODDS_API_PHASE1_PREFLIGHT,
    overrideUsed: ALLOW_UNTRUSTED_ODDS_API_PREFLIGHT,
    verdict: oddsApiPhase1Preflight.defaultVerdict || null,
    blocked: false,
  },
  supabaseHealth,
  sgoQuotaPreflight,
  oddsApiPhase1Preflight,
}, null, 2));

process.exit(partial ? 1 : 0);
