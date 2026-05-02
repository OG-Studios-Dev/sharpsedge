#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] ??= value;
  }
}

function addDays(dateKey, days) {
  const [year, month, day] = String(dateKey).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function isBeforeSundayWindow(dateKey, now = new Date()) {
  const earliest = addDays(dateKey, 3);
  return earliest ? now.getTime() < earliest.getTime() : true;
}

async function pg(pathname) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/rest/v1${pathname}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${pathname} failed ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function fetchPgaStatusByEventId() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard', { cache: 'no-store' });
  if (!res.ok) return new Map();
  const data = await res.json();
  return new Map((data.events ?? []).map((event) => {
    const competition = event?.competitions?.[0];
    const status = competition?.status?.type ?? event?.status?.type ?? {};
    return [String(event?.id ?? ''), {
      id: String(event?.id ?? ''),
      name: event?.name ?? event?.shortName ?? 'PGA event',
      completed: status?.completed === true,
      final: status?.completed === true && /final|tournament complete/i.test(String(status?.detail ?? status?.shortDetail ?? status?.description ?? status?.name ?? '')),
      detail: status?.detail ?? status?.description ?? 'unknown',
      date: String(event?.date ?? '').slice(0, 10),
    }];
  }).filter(([id]) => id));
}

function summarize(rows) {
  return rows.reduce((acc, row) => {
    acc[row.result] = (acc[row.result] ?? 0) + 1;
    return acc;
  }, {});
}

loadEnv();

const now = new Date();
const since = new Date(now.getTime());
since.setUTCDate(since.getUTCDate() - 14);
const sinceKey = since.toISOString().slice(0, 10);

const [pickHistory, gooseModel, pgaStatuses] = await Promise.all([
  pg(`/pick_history?select=id,date,league,pick_label,result,updated_at,game_id&league=eq.PGA&date=gte.${sinceKey}&order=date.desc,updated_at.desc&limit=500`),
  pg(`/goose_model_picks?select=id,date,sport,pick_label,result,updated_at,game_id&sport=eq.PGA&date=gte.${sinceKey}&order=date.desc,updated_at.desc&limit=500`).catch((error) => ({ error: error.message, rows: [] })),
  fetchPgaStatusByEventId(),
]);

const gooseRows = Array.isArray(gooseModel) ? gooseModel : [];
const all = [
  ...pickHistory.map((row) => ({ table: 'pick_history', ...row })),
  ...gooseRows.map((row) => ({ table: 'goose_model_picks', ...row })),
];

const prematureSettlements = all.filter((row) => {
  if (row.result === 'pending') return false;
  const status = row.game_id ? pgaStatuses.get(String(row.game_id)) : null;
  if (status && status.final === false) return true;
  return isBeforeSundayWindow(row.date, now);
});

const output = {
  ok: prematureSettlements.length === 0,
  checked_since: sinceKey,
  now: now.toISOString(),
  counts: {
    pick_history: { total: pickHistory.length, by_result: summarize(pickHistory) },
    goose_model_picks: Array.isArray(gooseModel)
      ? { total: gooseRows.length, by_result: summarize(gooseRows) }
      : { total: 0, error: gooseModel.error },
  },
  active_pga_events: Array.from(pgaStatuses.values()),
  premature_settlements: prematureSettlements.map((row) => ({
    table: row.table,
    id: row.id,
    date: row.date,
    pick_label: row.pick_label,
    result: row.result,
    updated_at: row.updated_at,
    game_id: row.game_id,
    event_status: row.game_id ? pgaStatuses.get(String(row.game_id)) ?? null : null,
  })),
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exit(1);
