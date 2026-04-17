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

function extractLastJsonObject(raw) {
  let depth = 0;
  let startIdx = -1;
  let inString = false;
  let escape = false;
  const objects = [];

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) startIdx = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && startIdx !== -1) {
        objects.push(raw.slice(startIdx, i + 1));
        startIdx = -1;
      }
    }
  }

  if (!objects.length) return null;

  for (let i = objects.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(objects[i]);
    } catch {}
  }

  return null;
}

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
  const parsed = extractLastJsonObject(raw);
  results.push({ sport, result: parsed ?? { raw } });
}

console.log(JSON.stringify({
  ok: true,
  capturedAt: new Date().toISOString(),
  sports,
  startIso,
  endIso,
  results,
}, null, 2));
