#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const nodeBin = process.env.NODE_BIN || process.execPath || 'node';
const cacheDir = path.join(cwd, 'tmp', 'sgo-cache');
const ledgerDir = path.join(cwd, 'tmp', 'sgo-ledger');
const ledgerPath = path.join(ledgerDir, 'cache-warehouse-ingest-ledger.json');
const mode = (arg('--mode') || 'append').trim().toLowerCase();
const sports = new Set((arg('--sports') || 'NHL,NBA,MLB,NFL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
const match = arg('--match');
const limit = Number(arg('--limit') || 0);

mkdirSync(ledgerDir, { recursive: true });
loadEnvFile();

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

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

function loadLedger() {
  if (!existsSync(ledgerPath)) return [];
  return JSON.parse(readFileSync(ledgerPath, 'utf8'));
}

function saveLedger(rows) {
  writeFileSync(ledgerPath, JSON.stringify(rows, null, 2));
}

function rowKey(row) {
  return row.file;
}

function dedupeLedger(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    const prev = latest.get(key);
    if (!prev || new Date(row.runAt) >= new Date(prev.runAt)) latest.set(key, row);
  }
  return [...latest.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function listCacheFiles() {
  return readdirSync(cacheDir)
    .filter((name) => name.endsWith('.json') && !name.includes('.goose2.'))
    .map((name) => path.join(cacheDir, name))
    .filter((file) => sports.has(path.basename(file).split('_', 1)[0].toUpperCase()))
    .filter((file) => !match || path.basename(file).includes(match))
    .sort();
}

function ingestOne(file) {
  const sport = path.basename(file).split('_', 1)[0].toUpperCase();
  const raw = execFileSync(nodeBin, [
    'scripts/ingest-sgo-goose2-window.mjs',
    '--sport', sport,
    '--cache', path.relative(cwd, file),
  ], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_BIN: nodeBin },
  });
  return JSON.parse(raw);
}

let ledger = dedupeLedger(loadLedger());
const latestByFile = new Map(ledger.map((row) => [row.file, row]));
const files = listCacheFiles();
const targets = files.filter((file) => {
  const existing = latestByFile.get(file);
  if (mode === 'retry-errors') return existing && existing.status === 'error';
  if (mode === 'force') return true;
  return !existing || existing.status !== 'done';
});
const runFiles = limit > 0 ? targets.slice(0, limit) : targets;

console.log(JSON.stringify({
  ok: true,
  mode,
  ledgerPath,
  cacheDir,
  discovered: files.length,
  targeted: targets.length,
  running: runFiles.length,
  sports: [...sports],
  match: match || null,
  limit,
}, null, 2));

for (const file of runFiles) {
  const sport = path.basename(file).split('_', 1)[0].toUpperCase();
  const row = {
    runAt: new Date().toISOString(),
    file,
    fileName: path.basename(file),
    sport,
    status: 'done',
    ingest: null,
    error: null,
  };
  try {
    row.ingest = ingestOne(file);
  } catch (error) {
    row.status = 'error';
    row.error = error?.stderr?.toString?.() || error?.message || String(error);
  }
  latestByFile.set(file, row);
  ledger = dedupeLedger([...latestByFile.values()]);
  saveLedger(ledger);
  console.log(JSON.stringify({
    file: row.fileName,
    sport: row.sport,
    status: row.status,
    insertedEvents: row.ingest?.inserted?.events ?? null,
    insertedCandidates: row.ingest?.inserted?.candidates ?? null,
    error: row.error ? String(row.error).slice(0, 240) : null,
  }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  completed: runFiles.length,
  ledgerPath,
}, null, 2));
