#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = 'true'] = arg.slice(2).split('=');
    out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const apiBase = `${SUPABASE_URL}/rest/v1`;
const labSlug = args.lab || 'goose-shadow-lab';
const limit = Math.max(1, Math.min(Number(args.limit || 1000), 5000));
const writeMode = args.write !== 'false' && args.dryRun !== 'true';
const lookbackDays = Math.max(1, Number(args.lookbackDays || 14));
const today = new Date();
const settleThrough = args.through || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)).toISOString().slice(0, 10);
const since = args.since || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - lookbackDays)).toISOString().slice(0, 10);

const baseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(pathname, options = {}) {
  const res = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${pathname} failed ${res.status}: ${text.slice(0, 500)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function escapeIn(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function normalizeResult(result, integrityStatus) {
  const r = String(result || '').toLowerCase();
  const i = String(integrityStatus || '').toLowerCase();
  if (['win', 'loss', 'push', 'void'].includes(r)) return r;
  if (['cancelled', 'ungradeable'].includes(r)) return 'void';
  if (['void', 'cancelled', 'postponed', 'unresolvable'].includes(i)) return 'void';
  return null;
}

function profitFromResult(result, odds, units = 1) {
  if (result === 'loss') return -Math.abs(units || 1);
  if (result === 'push' || result === 'void') return 0;
  if (result !== 'win') return 0;
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return Math.abs(units || 1);
  if (o > 0) return Math.abs(units || 1) * (o / 100);
  return Math.abs(units || 1) * (100 / Math.abs(o));
}

const pendingPath = [
  '/goose_learning_shadow_picks?select=id,lab_slug,model_version,candidate_id,pick_date,sport,pick_label,odds,result,status,evidence_snapshot',
  `lab_slug=eq.${encodeURIComponent(labSlug)}`,
  'result=eq.pending',
  'candidate_id=not.is.null',
  `pick_date=gte.${encodeURIComponent(since)}`,
  `pick_date=lte.${encodeURIComponent(settleThrough)}`,
  'order=pick_date.desc',
  `limit=${limit}`,
].join('&');

const pending = await rest(pendingPath);
const candidateIds = Array.from(new Set((pending || []).map((row) => row.candidate_id).filter(Boolean)));
const resultsByCandidate = new Map();

for (const group of chunks(candidateIds, 80)) {
  const results = await rest(`/goose_market_results?select=candidate_id,result,closing_odds,settlement_ts,grade_source,integrity_status,grading_notes,source_payload&candidate_id=in.(${group.map(escapeIn).join(',')})&order=settlement_ts.desc&limit=${group.length}`);
  for (const row of results || []) {
    if (!resultsByCandidate.has(row.candidate_id)) resultsByCandidate.set(row.candidate_id, row);
  }
}

const updates = [];
const skipped = [];
for (const pick of pending || []) {
  const grade = resultsByCandidate.get(pick.candidate_id);
  if (!grade) {
    skipped.push({ id: pick.id, candidate_id: pick.candidate_id, reason: 'missing_market_result' });
    continue;
  }
  const result = normalizeResult(grade.result, grade.integrity_status);
  if (!result) {
    skipped.push({ id: pick.id, candidate_id: pick.candidate_id, reason: `non_terminal:${grade.result || grade.integrity_status || 'unknown'}` });
    continue;
  }
  const odds = Number.isFinite(Number(pick.odds)) ? Number(pick.odds) : Number(grade.closing_odds);
  const evidence = pick.evidence_snapshot && typeof pick.evidence_snapshot === 'object' ? pick.evidence_snapshot : {};
  updates.push({
    id: pick.id,
    candidate_id: pick.candidate_id,
    pick_date: pick.pick_date,
    sport: pick.sport,
    result,
    patch: {
      status: result === 'void' ? 'void' : 'settled',
      result,
      profit_units: Number(profitFromResult(result, odds, 1).toFixed(4)),
      settled_at: grade.settlement_ts || new Date().toISOString(),
      evidence_snapshot: {
        ...evidence,
        settlement: {
          source: 'settle-goose-learning-shadow-picks',
          market_result: grade.result || null,
          integrity_status: grade.integrity_status || null,
          grade_source: grade.grade_source || null,
          grading_notes: grade.grading_notes || null,
          settlement_ts: grade.settlement_ts || null,
        },
      },
    },
  });
}

if (writeMode) {
  for (const update of updates) {
    await rest(`/goose_learning_shadow_picks?id=eq.${encodeURIComponent(update.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(update.patch),
    });
  }
}

const byResult = updates.reduce((acc, update) => {
  acc[update.result] = (acc[update.result] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  ok: true,
  writeMode,
  labSlug,
  since,
  settleThrough,
  pending_checked: pending?.length || 0,
  market_results_found: resultsByCandidate.size,
  updates: updates.length,
  byResult,
  skipped: skipped.slice(0, 20),
}, null, 2));
