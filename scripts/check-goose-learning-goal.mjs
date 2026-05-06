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
    process.env[key] ||= value;
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const apiBase = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const startDate = args.start || process.env.GOOSE_LEARNING_GOAL_START_DATE || '2026-03-24';
const labSlug = args.lab || 'goose-shadow-lab';
const sports = String(args.sports || process.env.GOOSE_LEARNING_GOAL_SPORTS || 'NHL,NBA,MLB')
  .split(',')
  .map((sport) => sport.trim().toUpperCase())
  .filter(Boolean);
const overallLearningMin = Number(args.overallMin || process.env.GOOSE_LEARNING_GOAL_OVERALL_MIN || 65);
const sportLearningMin = Number(args.sportMin || process.env.GOOSE_LEARNING_GOAL_SPORT_MIN || 60);
const averageDeltaMin = Number(args.averageDeltaMin || process.env.GOOSE_LEARNING_GOAL_AVG_DELTA_MIN || 8);
const minLearningSettledPerSport = Number(args.minLearningSettledPerSport || process.env.GOOSE_LEARNING_GOAL_MIN_LEARNING_SETTLED_PER_SPORT || 10);
const minOfficialSettledPerSport = Number(args.minOfficialSettledPerSport || process.env.GOOSE_LEARNING_GOAL_MIN_OFFICIAL_SETTLED_PER_SPORT || 10);
const writeMode = args.write === 'true' || args.write === '1';
const statePath = path.join(process.cwd(), args.statePath || 'tmp/goose-learning-goal-status.json');

async function rest(pathname) {
  const res = await fetch(`${apiBase}${pathname}`, { headers, cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${res.status} ${pathname}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function resolveModelVersion() {
  if (args.modelVersion) return args.modelVersion;
  const rows = await rest(`/goose_learning_lab_spaces?slug=eq.${encodeURIComponent(labSlug)}&select=active_model_version&limit=1`).catch(() => []);
  return rows?.[0]?.active_model_version || process.env.GOOSE_SHADOW_MODEL_VERSION || 'shadow-2026-05-03-expanded-oos';
}

function escapeIn(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function profitFromResult(result, odds, units = 1) {
  if (result === 'loss') return -Math.abs(units || 1);
  if (result === 'push' || result === 'void' || result === 'cancelled') return 0;
  if (result !== 'win') return 0;
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return Math.abs(units || 1);
  return o > 0 ? Math.abs(units || 1) * (o / 100) : Math.abs(units || 1) * (100 / Math.abs(o));
}

function emptyRecord() {
  return { total: 0, settled: 0, pending: 0, wins: 0, losses: 0, pushes: 0, units: 0, winRate: null };
}

function finalize(record) {
  const decisions = record.wins + record.losses;
  return {
    ...record,
    units: Number(record.units.toFixed(2)),
    winRate: decisions ? Number(((record.wins / decisions) * 100).toFixed(1)) : null,
  };
}

function add(record, row, kind) {
  const result = row.result || 'pending';
  record.total += 1;
  if (result === 'pending') {
    record.pending += 1;
    return;
  }
  record.settled += 1;
  if (result === 'win') record.wins += 1;
  else if (result === 'loss') record.losses += 1;
  else if (result === 'push' || result === 'void' || result === 'cancelled') record.pushes += 1;
  record.units += kind === 'learning'
    ? Number(row.profit_units || 0)
    : profitFromResult(result, row.odds, Number(row.units || 1));
}

function summarize(rows, kind, sportField) {
  const overall = emptyRecord();
  const bySport = Object.fromEntries(sports.map((sport) => [sport, emptyRecord()]));
  for (const row of rows) {
    const sport = String(row[sportField] || '').toUpperCase();
    if (!sports.includes(sport)) continue;
    add(overall, row, kind);
    add(bySport[sport], row, kind);
  }
  return {
    overall: finalize(overall),
    bySport: Object.fromEntries(Object.entries(bySport).map(([sport, record]) => [sport, finalize(record)])),
  };
}

const modelVersion = await resolveModelVersion();
const sportFilter = sports.map(escapeIn).join(',');
const officialRows = await rest(`/pick_history?select=date,league,result,odds,units&date=gte.${encodeURIComponent(startDate)}&league=in.(${sportFilter})&order=date.asc&limit=5000`);
const learningRows = await rest(`/goose_learning_shadow_picks?select=pick_date,sport,result,status,profit_units&lab_slug=eq.${encodeURIComponent(labSlug)}&model_version=eq.${encodeURIComponent(modelVersion)}&pick_date=gte.${encodeURIComponent(startDate)}&sport=in.(${sportFilter})&order=pick_date.asc&limit=5000`);

const official = summarize(officialRows || [], 'official', 'league');
const learning = summarize(learningRows || [], 'learning', 'sport');
const sportDeltas = {};
const blockers = [];
const validSportDeltas = [];

if ((learning.overall.winRate ?? 0) < overallLearningMin) blockers.push(`overall_learning_hit_rate_below_${overallLearningMin}`);

for (const sport of sports) {
  const l = learning.bySport[sport];
  const o = official.bySport[sport];
  if (l.settled < minLearningSettledPerSport) blockers.push(`${sport}_learning_sample_below_${minLearningSettledPerSport}`);
  if (o.settled < minOfficialSettledPerSport) blockers.push(`${sport}_official_sample_below_${minOfficialSettledPerSport}`);
  if ((l.winRate ?? 0) < sportLearningMin) blockers.push(`${sport}_learning_hit_rate_below_${sportLearningMin}`);
  const delta = l.winRate != null && o.winRate != null ? Number((l.winRate - o.winRate).toFixed(1)) : null;
  sportDeltas[sport] = delta;
  if (delta != null && l.settled >= minLearningSettledPerSport && o.settled >= minOfficialSettledPerSport) validSportDeltas.push(delta);
}

const averageSportDelta = validSportDeltas.length === sports.length
  ? Number((validSportDeltas.reduce((sum, value) => sum + value, 0) / validSportDeltas.length).toFixed(1))
  : null;
if (averageSportDelta == null || averageSportDelta < averageDeltaMin) blockers.push(`average_sport_delta_below_${averageDeltaMin}`);

const goalHit = blockers.length === 0;
let previousGoalHit = false;
if (fs.existsSync(statePath)) {
  try {
    previousGoalHit = Boolean(JSON.parse(fs.readFileSync(statePath, 'utf8'))?.goalHit);
  } catch {}
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  startDate,
  labSlug,
  modelVersion,
  sports,
  thresholds: {
    overallLearningMin,
    sportLearningMin,
    averageDeltaMin,
    minLearningSettledPerSport,
    minOfficialSettledPerSport,
  },
  learning,
  official,
  deltas: {
    overallWinRate: learning.overall.winRate != null && official.overall.winRate != null
      ? Number((learning.overall.winRate - official.overall.winRate).toFixed(1))
      : null,
    overallUnits: Number((learning.overall.units - official.overall.units).toFixed(2)),
    bySportWinRate: sportDeltas,
    averageSportWinRate: averageSportDelta,
  },
  goalHit,
  alert: goalHit && !previousGoalHit,
  blockers,
  alertMessage: goalHit
    ? `GOOSE LEARNING GOAL HIT: ${learning.overall.winRate}% overall, all sports >= ${sportLearningMin}%, avg sport delta ${averageSportDelta} pts vs normal picks since ${startDate}.`
    : null,
};

if (writeMode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));
