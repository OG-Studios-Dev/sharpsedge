#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const nodeBin = process.env.NODE_BIN || process.execPath || 'node';
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

function cacheFileFor(league, startsAfter, startsBefore) {
  const key = `${league}_${startsAfter}_${startsBefore}_true_true_${limit}_all`.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(cacheDir, `${key}.json`);
}

function normalizeOutFor(league, startsAfter, startsBefore) {
  const key = `${league}_${startsAfter}_${startsBefore}_true_true_${limit}_all`.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(cacheDir, `${key}.goose2.${league}.json`);
}

let ledger = dedupeLedger(loadLedger());
const latestByKey = new Map(ledger.map((r) => [rowKey(r), r]));
const seen = new Set(
  [...latestByKey.values()]
    .filter((r) => r.status === 'done')
    .map((r) => rowKey(r))
);
const plan = buildPlan(startIso, endIso, leagues);

for (const monthRow of plan) {
  const effectiveChunkDays = leagueChunkDays[monthRow.league] || chunkDays;
  const chunks = splitWindows(monthRow.startsAfter, monthRow.startsBefore, effectiveChunkDays);
  for (const chunk of chunks) {
    const id = `${monthRow.league}|${chunk.startsAfter}|${chunk.startsBefore}`;
    if (mode !== 'retry-errors' && seen.has(id)) continue;

    const existing = latestByKey.get(id);
    if (mode === 'retry-errors' && (!existing || existing.status === 'done')) continue;

    let pullMeta = null;
    let normalizeMeta = null;
    let status = 'done';
    let error = null;
    let rowIngestMeta = null;

    try {
      const pullRaw = execFileSync(nodeBin, [
        'scripts/sgo-historical-backfill.mjs',
        '--sport', monthRow.league,
        '--starts-after', chunk.startsAfter,
        '--starts-before', chunk.startsBefore,
        '--limit', String(limit),
        '--chunk-days', String(effectiveChunkDays),
      ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
      pullMeta = JSON.parse(pullRaw);

      const cachePath = cacheFileFor(monthRow.league, chunk.startsAfter, chunk.startsBefore);
      if (existsSync(cachePath)) {
        const normRaw = execFileSync(nodeBin, [
          'scripts/sgo-normalize-cache.mjs',
          path.relative(cwd, cachePath),
          monthRow.league,
        ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
        normalizeMeta = JSON.parse(normRaw);

        const ingestRaw = execFileSync(nodeBin, [
          'scripts/ingest-sgo-goose2-window.mjs',
          '--sport', monthRow.league,
          '--cache', path.relative(cwd, cachePath),
        ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
        rowIngestMeta = JSON.parse(ingestRaw);

        if (['NHL', 'NBA', 'MLB', 'NFL'].includes(monthRow.league)) {
          const enrichRaw = execFileSync(nodeBin, [
            'scripts/enrich-historical-league-ids.mjs',
            chunk.startsAfter.slice(0, 10),
            chunk.startsBefore.slice(0, 10),
            monthRow.league,
          ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_BIN: nodeBin } });
          rowIngestMeta.enrichment = JSON.parse(enrichRaw);
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
    if (status === 'done') seen.add(id);
    saveLedger(ledger);
    console.log(JSON.stringify({ league: monthRow.league, month: monthRow.month, startsAfter: chunk.startsAfter, startsBefore: chunk.startsBefore, status, events: pullMeta?.summary?.events ?? null, candidates: normalizeMeta?.summary?.candidates ?? null, ingestedCandidates: rowIngestMeta?.inserted?.candidates ?? null }, null, 2));
  }
}

console.log(JSON.stringify({ ok: true, ledgerPath, rows: ledger.length, mode }, null, 2));
