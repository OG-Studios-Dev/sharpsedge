#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
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

const sport = (arg('--sport') || '').toUpperCase();
const cachePathArg = arg('--cache');
if (!sport || !cachePathArg) throw new Error('Usage: node scripts/ingest-sgo-goose2-window.mjs --sport NBA --cache tmp/...json');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');

const cachePath = path.isAbsolute(cachePathArg) ? cachePathArg : path.join(cwd, cachePathArg);
const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const payload = raw.payload ?? raw;

const normalizeMod = await import(pathToFileURL(path.join(cwd, 'scripts/lib/sgo-normalize-standalone.mjs')).href);
const mapped = normalizeMod.mapSportsGameOddsToGoose2(payload, sport);
const featureRows = [];
const batchSize = Number(process.env.SGO_INGEST_BATCH_SIZE || 100);
const maxAttempts = Number(process.env.SGO_INGEST_MAX_ATTEMPTS || 4);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(pathname, rows, conflict) {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let success = false;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const res = await fetch(`${supabaseUrl}/rest/v1/${pathname}?on_conflict=${encodeURIComponent(conflict)}`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        inserted += batch.length;
        success = true;
        break;
      }
      const text = await res.text();
      lastError = new Error(`${pathname} ${res.status}: ${text.slice(0, 400)}`);
      if (![408, 409, 425, 429, 500, 502, 503, 504, 522, 524].includes(res.status) || attempt === maxAttempts) break;
      await sleep(750 * attempt);
    }
    if (!success) throw lastError;
  }
  return inserted;
}

function dedupe(rows, keyField) {
  const map = new Map();
  for (const row of rows) map.set(row[keyField], row);
  return [...map.values()];
}

const eventRows = dedupe(mapped.eventRows, 'event_id');
const candidateRows = dedupe(mapped.candidateRows.map(({ sportsbook, ...row }) => row), 'candidate_id');
const dedupedFeatureRows = dedupe(featureRows, 'feature_row_id');

const insertedEvents = await post('goose_market_events', eventRows, 'event_id');
const insertedCandidates = await post('goose_market_candidates', candidateRows, 'candidate_id');
const insertedFeatureRows = dedupedFeatureRows.length ? await post('goose_feature_rows', dedupedFeatureRows, 'feature_row_id') : 0;

console.log(JSON.stringify({
  ok: true,
  sport,
  cachePath,
  summary: mapped.summary,
  inserted: {
    events: insertedEvents,
    candidates: insertedCandidates,
    feature_rows: insertedFeatureRows,
  },
  deduped_from: {
    events: mapped.eventRows.length,
    candidates: mapped.candidateRows.length,
    feature_rows: featureRows.length,
  },
}, null, 2));

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}
