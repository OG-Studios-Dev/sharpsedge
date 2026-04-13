#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const startIso = process.argv[2] || '2024-02-01T00:00:00Z';
const endIso = process.argv[3] || new Date().toISOString();
const leagues = (process.argv[4] || 'NBA,NHL,MLB').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const chunkDays = Number(process.argv[5] || 7);
const limit = Number(process.argv[6] || 250);
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

function cacheFileFor(league, startsAfter, startsBefore) {
  const key = `${league}_${startsAfter}_${startsBefore}_true_true_${limit}_all`.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(cacheDir, `${key}.json`);
}

function normalizeOutFor(league, startsAfter, startsBefore) {
  const key = `${league}_${startsAfter}_${startsBefore}_true_true_${limit}_all`.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return path.join(cacheDir, `${key}.goose2.${league}.json`);
}

const ledger = loadLedger();
const seen = new Set(ledger.filter((r) => r.status === 'done').map((r) => `${r.league}|${r.startsAfter}|${r.startsBefore}`));
const plan = buildPlan(startIso, endIso, leagues);

for (const monthRow of plan) {
  const chunks = splitWindows(monthRow.startsAfter, monthRow.startsBefore, chunkDays);
  for (const chunk of chunks) {
    const id = `${monthRow.league}|${chunk.startsAfter}|${chunk.startsBefore}`;
    if (seen.has(id)) continue;

    let pullMeta = null;
    let normalizeMeta = null;
    let status = 'done';
    let error = null;

    try {
      const pullRaw = execFileSync('node', [
        'scripts/sgo-historical-backfill.mjs',
        '--sport', monthRow.league,
        '--starts-after', chunk.startsAfter,
        '--starts-before', chunk.startsBefore,
        '--limit', String(limit),
      ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      pullMeta = JSON.parse(pullRaw);

      const cachePath = cacheFileFor(monthRow.league, chunk.startsAfter, chunk.startsBefore);
      if (existsSync(cachePath)) {
        const normRaw = execFileSync('node', [
          'scripts/sgo-normalize-cache.mjs',
          path.relative(cwd, cachePath),
          monthRow.league,
        ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        normalizeMeta = JSON.parse(normRaw);
      }
      seen.add(id);
    } catch (err) {
      status = 'error';
      error = err?.stderr?.toString?.() || err?.message || String(err);
    }

    ledger.push({
      runAt: new Date().toISOString(),
      league: monthRow.league,
      month: monthRow.month,
      startsAfter: chunk.startsAfter,
      startsBefore: chunk.startsBefore,
      chunkDays,
      limit,
      pull: pullMeta,
      normalize: normalizeMeta,
      status,
      error,
    });
    saveLedger(ledger);
    console.log(JSON.stringify({ league: monthRow.league, month: monthRow.month, startsAfter: chunk.startsAfter, startsBefore: chunk.startsBefore, status, events: pullMeta?.summary?.events ?? null, candidates: normalizeMeta?.summary?.candidates ?? null }, null, 2));
  }
}

console.log(JSON.stringify({ ok: true, ledgerPath, rows: ledger.length }, null, 2));
