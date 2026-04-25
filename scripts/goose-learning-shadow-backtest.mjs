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

const modelVersion = args.modelVersion || `shadow-${new Date().toISOString().slice(0, 10)}`;
const trainStart = args.trainStart || '2024-01-01';
const trainEnd = args.trainEnd || '2024-12-31';
const testStart = args.testStart || '2025-01-01';
const testEnd = args.testEnd || '2026-12-31';
const minSample = Number(args.minSample || 50);
const writeMode = args.write === 'true' || args.write === '1';
const maxRows = Number(args.maxRows || 100000);

function isoDateOk(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
if (![trainStart, trainEnd, testStart, testEnd].every(isoDateOk)) throw new Error('Dates must be YYYY-MM-DD');

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

async function fetchExamples(startDate, endDate) {
  const out = [];
  let offset = 0;
  const pageSize = 1000;
  while (out.length < maxRows) {
    const q = new URLSearchParams({
      select: 'example_id,sport,league,event_date,market_family,side,line,odds,sportsbook,is_favorite,is_underdog,is_home_team_bet,is_away_team_bet,team_above_500_pre_game,opponent_above_500_pre_game,is_back_to_back,is_prime_time,is_divisional_game,team_role,result,profit_units',
      event_date: `gte.${startDate}`,
      order: 'event_date.asc',
      limit: String(Math.min(pageSize, maxRows - out.length)),
      offset: String(offset),
    });
    q.append('event_date', `lte.${endDate}`);
    const page = await rest(`/rest/v1/goose_training_examples_v1?${q.toString()}`);
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

function lineBucket(line) {
  if (line == null || !Number.isFinite(Number(line))) return 'no_line';
  const n = Number(line);
  if (Math.abs(n) <= 2.5) return 'line_0_to_2_5';
  if (Math.abs(n) <= 5.5) return 'line_3_to_5_5';
  if (Math.abs(n) <= 8.5) return 'line_6_to_8_5';
  return 'line_9_plus';
}

function oddsBucket(odds) {
  if (odds == null || !Number.isFinite(Number(odds))) return 'odds_unknown';
  const n = Number(odds);
  if (n <= -200) return 'odds_heavy_favorite';
  if (n < 0) return 'odds_favorite';
  if (n < 150) return 'odds_short_dog';
  if (n < 250) return 'odds_mid_dog';
  return 'odds_long_dog';
}

function boolSignal(name, value) { return value === true ? name : null; }

function signalsFor(row) {
  const signals = new Set();
  const sport = row.sport || row.league || 'UNKNOWN';
  const market = row.market_family || 'unknown_market';
  const side = row.side || 'unknown_side';
  signals.add(`${sport}:${market}:${side}`);
  signals.add(`${sport}:${market}:${side}:${oddsBucket(row.odds)}`);
  signals.add(`${sport}:${market}:${side}:${lineBucket(row.line)}`);
  signals.add(`${sport}:${market}:${side}:book:${row.sportsbook || 'unknown_book'}`);
  for (const sig of [
    boolSignal('favorite', row.is_favorite),
    boolSignal('underdog', row.is_underdog),
    boolSignal('home_bet', row.is_home_team_bet),
    boolSignal('away_bet', row.is_away_team_bet),
    boolSignal('both_teams_above_500', row.team_above_500_pre_game === true && row.opponent_above_500_pre_game === true),
    boolSignal('back_to_back', row.is_back_to_back),
    boolSignal('prime_time', row.is_prime_time),
    boolSignal('divisional', row.is_divisional_game),
  ]) {
    if (sig) signals.add(`${sport}:${market}:${side}:${sig}`);
  }
  return Array.from(signals);
}

function emptyStat(signalKey, sampleRow) {
  return {
    signal_key: signalKey,
    sport: sampleRow?.sport || sampleRow?.league || 'UNKNOWN',
    league: sampleRow?.league || sampleRow?.sport || 'UNKNOWN',
    market_family: sampleRow?.market_family || 'unknown_market',
    side: sampleRow?.side || null,
    filter_json: { generated_by: 'goose-learning-shadow-backtest', signal_key: signalKey },
    sample: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    units: 0,
  };
}

function accumulate(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const signal of signalsFor(row)) {
      const stat = map.get(signal) || emptyStat(signal, row);
      stat.sample += 1;
      if (row.result === 'win') stat.wins += 1;
      else if (row.result === 'loss') stat.losses += 1;
      else stat.pushes += 1;
      stat.units += Number(row.profit_units || 0);
      map.set(signal, stat);
    }
  }
  return map;
}

function finalize(trainMap, testMap) {
  const rows = [];
  for (const [signal, train] of trainMap.entries()) {
    if (train.sample < minSample) continue;
    const test = testMap.get(signal) || { sample: 0, wins: 0, losses: 0, pushes: 0, units: 0 };
    const trainRoi = train.sample ? train.units / train.sample : 0;
    const testRoi = test.sample ? test.units / test.sample : 0;
    const trainWinRate = (train.wins + train.losses) ? train.wins / (train.wins + train.losses) : 0;
    const testWinRate = (test.wins + test.losses) ? test.wins / (test.wins + test.losses) : 0;
    const tooGoodToBeTrue = trainRoi > 0.25 || testRoi > 0.25 || trainWinRate > 0.72 || testWinRate > 0.72;
    const hasOutOfSampleVolume = test.sample >= Math.max(20, Math.floor(minSample / 2));
    const survives = hasOutOfSampleVolume && !tooGoodToBeTrue && trainRoi > 0 && testRoi > 0 && trainWinRate >= 0.52 && testWinRate >= 0.52;
    const rejectionReason = survives
      ? null
      : tooGoodToBeTrue
        ? 'Rejected by sanity gate: ROI/win-rate is too high for a broad historical betting signal and likely indicates source/selection/line artifact.'
        : 'Needs positive train/test ROI, 52%+ train/test WR, and enough out-of-sample volume.';
    rows.push({
      ...train,
      train_roi: trainRoi,
      train_win_rate: trainWinRate,
      test_sample: test.sample,
      test_wins: test.wins,
      test_losses: test.losses,
      test_pushes: test.pushes,
      test_units: test.units,
      test_roi: testRoi,
      test_win_rate: testWinRate,
      edge_score: Number(((trainRoi * 0.35) + (testRoi * 0.65)).toFixed(6)),
      confidence_score: Number((Math.min(1, train.sample / 500) * Math.min(1, Math.max(test.sample, 1) / 250)).toFixed(6)),
      promotion_status: survives ? 'eligible' : 'shadow',
      rejection_reason: rejectionReason,
    });
  }
  return rows.sort((a, b) => (b.edge_score * b.confidence_score) - (a.edge_score * a.confidence_score));
}

async function writeResults(candidates, summary) {
  await rest('/rest/v1/goose_learning_model_versions?on_conflict=model_version', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      model_version: modelVersion,
      status: 'shadow',
      train_start_date: trainStart,
      train_end_date: trainEnd,
      test_start_date: testStart,
      test_end_date: testEnd,
      sports: Array.from(new Set(candidates.map((c) => c.sport))).sort(),
      markets: Array.from(new Set(candidates.map((c) => c.market_family))).sort(),
      min_sample: minSample,
      config: { maxRows, generator: 'goose-learning-shadow-backtest' },
      metrics: summary,
      notes: 'Shadow learning run only. Does not affect production pick generation.',
    }),
  });

  await rest(`/rest/v1/goose_signal_candidates_v1?model_version=eq.${encodeURIComponent(modelVersion)}`, { method: 'DELETE' });
  const payload = candidates.slice(0, 1000).map((c) => ({
    model_version: modelVersion,
    signal_key: c.signal_key,
    sport: c.sport,
    league: c.league,
    market_family: c.market_family,
    side: c.side,
    filter_json: c.filter_json,
    train_sample: c.sample,
    train_wins: c.wins,
    train_losses: c.losses,
    train_pushes: c.pushes,
    train_units: c.units,
    train_roi: c.train_roi,
    test_sample: c.test_sample,
    test_wins: c.test_wins,
    test_losses: c.test_losses,
    test_pushes: c.test_pushes,
    test_units: c.test_units,
    test_roi: c.test_roi,
    edge_score: c.edge_score,
    confidence_score: c.confidence_score,
    promotion_status: c.promotion_status,
    rejection_reason: c.rejection_reason,
  }));
  if (payload.length) {
    await rest('/rest/v1/goose_signal_candidates_v1', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
  }
  await rest('/rest/v1/goose_backtest_runs_v1', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      model_version: modelVersion,
      run_type: 'shadow_backtest',
      train_start_date: trainStart,
      train_end_date: trainEnd,
      test_start_date: testStart,
      test_end_date: testEnd,
      min_sample: minSample,
      status: 'completed',
      summary,
    }),
  });
}

const trainRows = await fetchExamples(trainStart, trainEnd);
const testRows = await fetchExamples(testStart, testEnd);
const candidates = finalize(accumulate(trainRows), accumulate(testRows));
const summary = {
  modelVersion,
  writeMode,
  trainStart,
  trainEnd,
  testStart,
  testEnd,
  minSample,
  trainExamples: trainRows.length,
  testExamples: testRows.length,
  candidates: candidates.length,
  eligibleCandidates: candidates.filter((c) => c.promotion_status === 'eligible').length,
  topCandidates: candidates.slice(0, 20).map((c) => ({
    signal_key: c.signal_key,
    sport: c.sport,
    market_family: c.market_family,
    side: c.side,
    train_sample: c.sample,
    train_win_rate: c.train_win_rate,
    train_roi: c.train_roi,
    test_sample: c.test_sample,
    test_win_rate: c.test_win_rate,
    test_roi: c.test_roi,
    edge_score: c.edge_score,
    confidence_score: c.confidence_score,
    promotion_status: c.promotion_status,
  })),
};

fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
const outPath = path.join(process.cwd(), 'tmp', `goose-learning-shadow-${modelVersion}.json`);
fs.writeFileSync(outPath, JSON.stringify({ summary, candidates }, null, 2));

if (writeMode) await writeResults(candidates, summary);

console.log(JSON.stringify({ ok: true, outPath, ...summary }, null, 2));
