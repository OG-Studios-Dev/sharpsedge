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
    for (let cur = monthStart(new Date(start)); cur <= new Date(end); cur = nextMonth(cur)) {
      const next = nextMonth(cur);
      const windowEnd = next < new Date(end) ? new Date(next.getTime() - 1000) : new Date(end);
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
  return row?.status === 'done' && (row?.pull?.ok !== false);
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
const plan = buildPlan(startIso, endIso, leagues);
const supabaseHealth = await checkSupabaseHealth();

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
        ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
        pullMeta = JSON.parse(pullRaw);
      }

      if (existsSync(cachePath)) {
        const shouldNormalize = !existsSync(normalizedPath) || !normalizeMeta || hasRetryableRateLimit(existing) || retryableEntryScore(existing) === 0;
        if (shouldNormalize) {
          const normRaw = execFileSync(childPathNodeBin, [
            'scripts/sgo-normalize-cache.mjs',
            path.relative(cwd, cachePath),
            monthRow.league,
          ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
          normalizeMeta = JSON.parse(normRaw);
        }

        const shouldIngest = !rowIngestMeta || hasRetryableRateLimit(existing) || retryableEntryScore(existing) === 0;
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
      }
      seen.add(id);
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

console.log(JSON.stringify({ ok: true, ledgerPath, rows: ledger.length, mode, supabaseHealth }, null, 2));
