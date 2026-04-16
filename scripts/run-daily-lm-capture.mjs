#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const cwd = process.cwd();
const nodeBin = process.env.NODE_BIN || process.execPath || 'node';
const sports = (process.env.LM_CAPTURE_SPORTS || 'NHL,MLB,NBA,NFL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
const startIso = start.toISOString();
const endIso = end.toISOString();
const chunkDays = Number(process.env.LM_CAPTURE_CHUNK_DAYS || 1);
const limit = Number(process.env.LM_CAPTURE_LIMIT || 250);

const results = [];
for (const sport of sports) {
  const raw = execFileSync(nodeBin, [
    'scripts/sgo-run-backfill.mjs',
    startIso,
    endIso,
    sport,
    String(chunkDays),
    String(limit),
    'append',
  ], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_BIN: nodeBin },
  });
  const lines = raw.trim().split(/\n+/).filter(Boolean);
  const lastJson = [...lines].reverse().find((line) => line.trim().startsWith('{'));
  results.push({ sport, result: lastJson ? JSON.parse(lastJson) : { raw } });
}

console.log(JSON.stringify({
  ok: true,
  capturedAt: new Date().toISOString(),
  sports,
  startIso,
  endIso,
  results,
}, null, 2));
