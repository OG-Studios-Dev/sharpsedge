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
    const key = trimmed.slice(0, idx);
    let value = trimmed.slice(idx + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env');

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [k, v = ''] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));

const labSlug = args.lab || 'goose-shadow-lab';
const writeMode = args.write === 'true' || args.write === '1';

async function rest(pathname, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${pathname} failed ${res.status}: ${text}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

const rows = await rest(`/rest/v1/goose_learning_lab_status_v1?lab_slug=eq.${encodeURIComponent(labSlug)}&select=*&limit=1`);
const status = rows?.[0];
if (!status) throw new Error(`No lab status found for ${labSlug}`);

const readyToRecord = Boolean(status.ready_to_record);
const readyToCompare = Boolean(status.ready_to_compare);
const blockers = Array.isArray(status.blockers) ? status.blockers : [];
const nextStatus = readyToRecord ? 'recording_ready' : 'learning_only';

const snapshot = {
  lab_slug: status.lab_slug,
  model_version: status.model_version,
  status: nextStatus,
  ready_to_record: readyToRecord,
  ready_to_compare: readyToCompare,
  train_examples: Number(status.train_examples || 0),
  test_examples: Number(status.test_examples || 0),
  candidate_signals: Number(status.candidate_signals || 0),
  eligible_signals: Number(status.eligible_signals || 0),
  sanity_rejected_signals: Number(status.sanity_rejected_signals || 0),
  shadow_picks: Number(status.shadow_picks || 0),
  settled_shadow_picks: Number(status.settled_shadow_picks || 0),
  production_comparison_picks: 0,
  reasons: blockers,
  metrics: {
    lab_status: status.lab_status,
    readiness_rules: status.readiness_rules,
    model_metrics: status.model_metrics,
  },
};

if (writeMode) {
  await rest('/rest/v1/goose_learning_lab_readiness_snapshots', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(snapshot),
  });
  await rest(`/rest/v1/goose_learning_lab_spaces?slug=eq.${encodeURIComponent(labSlug)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: nextStatus, updated_at: new Date().toISOString() }),
  });
}

console.log(JSON.stringify({ ok: true, writeMode, snapshot }, null, 2));
