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

async function post(pathname, rows, conflict) {
  if (!rows.length) return 0;
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathname}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return rows.length;
}

function dedupe(rows, keyField) {
  const map = new Map();
  for (const row of rows) map.set(row[keyField], row);
  return [...map.values()];
}

const eventRows = dedupe(mapped.eventRows, 'event_id');
const candidateRows = dedupe(mapped.candidateRows.map(({ sportsbook, ...row }) => row), 'candidate_id');
const dedupedFeatureRows = dedupe(featureRows, 'feature_row_id');

await post('goose_market_events', eventRows, 'event_id');
await post('goose_market_candidates', candidateRows, 'candidate_id');
if (dedupedFeatureRows.length) await post('goose_feature_rows', dedupedFeatureRows, 'feature_row_id');

console.log(JSON.stringify({
  ok: true,
  sport,
  cachePath,
  summary: mapped.summary,
  inserted: {
    events: eventRows.length,
    candidates: candidateRows.length,
    feature_rows: dedupedFeatureRows.length,
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
