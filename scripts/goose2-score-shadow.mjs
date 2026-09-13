import fs from 'node:fs';
import path from 'node:path';
import { buildCandidatePagePath, buildLatestCandidateCapturePath, filterRowsBySport, normalizeScoreSport } from './lib/goose2-score-scope.mjs';
import {
  NFL_PLAYER_PROP_MARKETS,
  buildNFLPlayerPropSelectionKey,
  calculateNFLPlayerPropEvidence,
  extractESPNPlayerGameLogCategories,
  isNFLPlayerPropMarket,
  isNFLProductionReadyShadowRow,
  normalizeNFLPlayerName,
  resolveUniqueNFLAthleteId,
} from './lib/nfl-player-prop-evidence.mjs';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const apiBase = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

function parseArgs(argv) {
  const out = { positional: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      out.positional.push(arg);
      continue;
    }
    const [key, raw = 'true'] = arg.slice(2).split('=');
    out[key] = raw;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const MODEL_VERSION_ARG = args.modelVersion || process.env.GOOSE_SHADOW_MODEL_VERSION || '';
const DEFAULT_MODEL_VERSION = 'shadow-2026-05-03-expanded-oos';
const POLICY_VERSION = 'phase2-shadow-selective';
const LEARNING_CONFIDENCE_MIN = Number(args.learningConfidenceMin || process.env.GOOSE_LEARNING_CONFIDENCE_MIN || 0.45);
const MIN_EDGE = 0.035;
const MAX_PLAYS_PER_SPORT = 3;
const NFL_TEAM_PICK_TARGET = 6;
const NFL_PLAYER_PROP_PICK_TARGET = 6;
const SYSTEM_EDGE_MIN_SAMPLE = Number(args.systemEdgeMinSample || 10);
const EXCLUDE_IMPLAUSIBLE_LINES = args.excludeImplausibleLines !== 'false';
const ALLOWED_MARKETS = new Set(['moneyline', 'spread', 'total', 'first_five_total', 'first_five_side', ...NFL_PLAYER_PROP_MARKETS]);
const FORCE_RESCORE = args.force === 'true' || args.force === '1';
const ALLOW_HISTORICAL_SCORING = args.allowHistorical === 'true' || args.allowHistorical === '1' || process.env.GOOSE_SHADOW_ALLOW_HISTORICAL === '1';
const SCORE_PAGE_SIZE = Number(args.scorePageSize || 1000);
const SCORE_MAX_ROWS = Number(args.scoreMaxRows || 10000);
const SCORE_SPORT = normalizeScoreSport(args.sport || process.env.GOOSE_SHADOW_SCORE_SPORT);
const NFL_LIVE_MAX_PRICE_AGE_HOURS = 36;

const trainPath = path.resolve(process.cwd(), args.trainingDataset || process.env.GOOSE_SHADOW_TRAINING_DATASET || path.join('tmp', 'goose2-training-dataset-v1.json'));
if (!fs.existsSync(trainPath)) throw new Error('Missing training dataset. Run npm run goose2:export-training first.');
function normalizeTrainingRow(row) {
  const result = String(row.result || '').toLowerCase();
  const labelWin = row.label_win == null
    ? result === 'win'
      ? 1
      : result === 'loss'
        ? 0
        : null
    : Number(row.label_win);
  return {
    ...row,
    sport: row.sport || row.league,
    market_type: row.market_type || row.market_family,
    book: row.book || row.sportsbook,
    participant_name: row.participant_name || row.team_name,
    side: row.side || row.team_role,
    implied_prob: row.implied_prob ?? impliedProbFromAmericanOdds(row.odds),
    is_best_price: Boolean(row.is_best_price),
    is_opening: Boolean(row.is_opening),
    is_closing: Boolean(row.is_closing),
    label_win: labelWin,
  };
}
const rawTrainRows = JSON.parse(fs.readFileSync(trainPath, 'utf8')).rows.map(normalizeTrainingRow).filter((row) => Number.isFinite(Number(row.label_win)));
if (!Array.isArray(rawTrainRows) || !rawTrainRows.length) throw new Error('Training dataset empty.');

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function variance(values, avg = mean(values)) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
}
function std(values, avg = mean(values)) {
  return Math.sqrt(Math.max(variance(values, avg), 1e-12));
}
function oneHot(value, allowed) {
  return allowed.map((entry) => (value === entry ? 1 : 0));
}
function toNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function impliedProbFromAmericanOdds(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0) return 100 / (n + 100);
  return Math.abs(n) / (Math.abs(n) + 100);
}
function sigmoid(z) {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}
function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'na';
}
function compactToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'na';
}
function signalToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
function nameKey(value) {
  return compactToken(value).replace(/^(the)/, '');
}
function oddsBucket(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return 'odds_unknown';
  if (n <= -200) return 'odds_heavy_favorite';
  if (n < 0) return 'odds_favorite';
  if (n < 150) return 'odds_short_dog';
  if (n < 250) return 'odds_mid_dog';
  return 'odds_long_dog';
}

function impliedBucket(odds) {
  const p = impliedProbFromAmericanOdds(odds);
  if (!Number.isFinite(p)) return 'implied_unknown';
  if (p < 0.35) return 'implied_longshot';
  if (p < 0.45) return 'implied_dog';
  if (p <= 0.55) return 'implied_coinflip';
  if (p <= 0.65) return 'implied_favorite';
  return 'implied_heavy_favorite';
}

function bookTier(book) {
  const normalized = signalToken(book);
  if (['pinnacle', 'circa'].some((needle) => normalized.includes(needle))) return 'book_tier_sharp';
  if (['draftkings', 'fanduel', 'betmgm', 'caesars', 'espnbet'].some((needle) => normalized.includes(needle))) return 'book_tier_major';
  if (normalized.includes('bovada')) return 'book_tier_offshore';
  if (normalized.includes('sportsgameodds')) return 'book_tier_aggregator';
  return 'book_tier_other';
}

function dayTypeBucket(date) {
  const d = new Date(`${date || ''}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}
function spreadLineBucket(line) {
  if (line == null || !Number.isFinite(Number(line))) return 'no_line';
  const n = Math.abs(Number(line));
  if (n <= 2.5) return 'line_0_to_2_5';
  if (n <= 5.5) return 'line_3_to_5_5';
  if (n <= 8.5) return 'line_6_to_8_5';
  return 'line_9_plus';
}
function totalLineBucket(sport, line, market = 'total') {
  if (line == null || !Number.isFinite(Number(line))) return 'total_no_line';
  const n = Number(line);
  if (sport === 'NFL') return n < 42 ? 'total_low' : n <= 47.5 ? 'total_mid' : 'total_high';
  if (sport === 'NBA') return n < 220 ? 'total_low' : n <= 230 ? 'total_mid' : 'total_high';
  if (sport === 'MLB') {
    if (market === 'first_five_total') return n < 4 ? 'f5_total_low' : n <= 4.5 ? 'f5_total_mid' : 'f5_total_high';
    return n < 8 ? 'total_low' : n <= 9 ? 'total_mid' : 'total_high';
  }
  if (sport === 'NHL') return n < 6 ? 'total_low' : n <= 6.5 ? 'total_mid' : 'total_high';
  return 'total_unknown_range';
}
function sideRole(row, event) {
  const market = String(row.market_type || '').toLowerCase();
  const side = String(row.side || '').toLowerCase();
  if (market.includes('total')) {
    if (side.includes('over')) return 'over';
    if (side.includes('under')) return 'under';
  }
  const raw = nameKey(row.participant_name || row.side);
  const home = nameKey(event?.home_team);
  const away = nameKey(event?.away_team);
  if (raw && home && raw === home) return 'home';
  if (raw && away && raw === away) return 'away';
  return compactToken(row.side || row.participant_name || 'unknown_side');
}
function systemsForFeature(feature) {
  const flags = feature?.system_flags && typeof feature.system_flags === 'object' ? feature.system_flags : {};
  const systems = Array.isArray(flags.systems) ? flags.systems : [];
  const bySlug = new Map();
  for (const system of systems) {
    const slug = signalToken(system.system_slug || system.system_id || system.system_name);
    if (!slug || slug === 'unknown') continue;
    bySlug.set(slug, {
      system_id: system.system_id || slug,
      system_slug: slug,
      system_name: system.system_name || slug,
      action_side: system.action_side || null,
      market_type: system.market_type || null,
      logged_at: system.logged_at || null,
    });
  }
  return Array.from(bySlug.values()).sort((a, b) => a.system_slug.localeCompare(b.system_slug));
}

function latestFeatureRow(rows) {
  const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  return list
    .filter(Boolean)
    .sort((a, b) => String(b.generated_ts || '').localeCompare(String(a.generated_ts || '')))[0] || null;
}

function selectedEntityName(row) {
  return row.participant_name || row.side || row.home_team || null;
}

function opposingEntityName(row) {
  if (row.opponent_name) return row.opponent_name;
  const selected = compactToken(row.participant_name || row.side);
  const home = compactToken(row.home_team);
  const away = compactToken(row.away_team);
  if (selected && home && selected === home) return row.away_team || null;
  if (selected && away && selected === away) return row.home_team || null;
  if (row.market_type === 'total' && row.away_team && row.home_team) return `${row.away_team} @ ${row.home_team}`;
  return row.away_team || row.home_team || null;
}

function systemCountBucket(count) {
  const n = Number(count || 0);
  if (n <= 0) return 'none';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  return 'three_plus';
}

function isSystemSignalKey(signalKey) {
  const key = String(signalKey || '');
  return key.startsWith('SYSTEM:') || key.includes(':system:') || key.includes(':system_');
}

function signalsForCandidate(row, event, feature) {
  const sport = String(row.sport || row.league || 'UNKNOWN').toUpperCase();
  const market = String(row.market_type || 'unknown_market');
  const role = sideRole(row, event);
  const systems = systemsForFeature(feature);
  const implied = impliedBucket(row.odds);
  const tier = bookTier(row.book);
  const dayType = dayTypeBucket(row.event_date);
  const signals = new Set();
  signals.add(`${sport}:${market}:${role}`);
  signals.add(`${sport}:${market}:${role}:${oddsBucket(row.odds)}`);
  if (market === 'spread') signals.add(`${sport}:${market}:${role}:${spreadLineBucket(row.line)}`);
  if (market === 'total' || market === 'first_five_total') signals.add(`${sport}:${market}:${role}:${totalLineBucket(sport, row.line, market)}`);
  signals.add(`${sport}:${market}:${role}:book:${compactToken(row.book)}`);
  signals.add(`${sport}:${market}:${role}:${implied}`);
  signals.add(`${sport}:${market}:${role}:${tier}`);
  signals.add(`${sport}:${market}:${role}:${tier}:${implied}`);
  signals.add(`${sport}:${market}:${role}:${oddsBucket(row.odds)}:${tier}`);
  if (dayType) signals.add(`${sport}:${market}:${role}:${dayType}`);
  if (market === 'spread') signals.add(`${sport}:${market}:${role}:${spreadLineBucket(row.line)}:${tier}`);
  if (market === 'total' || market === 'first_five_total') signals.add(`${sport}:${market}:${role}:${totalLineBucket(sport, row.line, market)}:${tier}`);
  signals.add(`ALL:${market}:${role}:${implied}`);
  signals.add(`ALL:${market}:${role}:${tier}`);
  if (systems.length) {
    const countBucket = systemCountBucket(systems.length);
    signals.add(`${sport}:${market}:system_qualified`);
    signals.add(`${sport}:${market}:${role}:system_qualified`);
    signals.add(`${sport}:${market}:system_count:${countBucket}`);
    for (const system of systems) {
      signals.add(`SYSTEM:${system.system_slug}`);
      signals.add(`${sport}:system:${system.system_slug}`);
      signals.add(`${sport}:${market}:system:${system.system_slug}`);
      signals.add(`${sport}:${market}:${role}:system:${system.system_slug}`);
      if (system.action_side) signals.add(`${sport}:${market}:system:${system.system_slug}:action:${signalToken(system.action_side)}`);
      if (system.market_type) signals.add(`${sport}:system:${system.system_slug}:market:${signalToken(system.market_type)}`);
    }
    if (systems.length >= 2) signals.add(`${sport}:${market}:system_stack:${systems.slice(0, 3).map((system) => system.system_slug).join('+')}`);
  }
  if (market !== 'total') {
    if (Number(row.odds) < 0) signals.add(`${sport}:${market}:${role}:favorite`);
    if (Number(row.odds) > 0) signals.add(`${sport}:${market}:${role}:underdog`);
    if (Number(row.odds) < 0) signals.add(`${sport}:${market}:${role}:favorite:${implied}`);
    if (Number(row.odds) > 0) signals.add(`${sport}:${market}:${role}:underdog:${implied}`);
    if (role === 'home') signals.add(`${sport}:${market}:${role}:home_bet`);
    if (role === 'away') signals.add(`${sport}:${market}:${role}:away_bet`);
  }
  return Array.from(signals);
}
function minuteBucket(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  return d.toISOString().slice(0, 16);
}
function buildDecisionId(candidateId, modelVersion, policyVersion) {
  // Stable per candidate/model/policy: idempotent daily reruns update instead of
  // appending duplicate decision rows, while still allowing a newer model to
  // score the same candidate independently.
  return `dec:${candidateId}:${normalizeToken(modelVersion)}:${normalizeToken(policyVersion)}`;
}

function lineHealth(row) {
  const sport = String(row.sport || row.league || 'UNKNOWN').toUpperCase();
  const market = row.market_type || row.market_family || 'unknown_market';
  const line = Number(row.line);
  if (market === 'moneyline') return 'no_line_expected';
  if (!Number.isFinite(line)) return 'missing_line';
  const abs = Math.abs(line);

  if (market === 'total') {
    if (sport === 'NBA') {
      if (line < 150) return 'implausibly_low_full_game_total';
      if (line > 290) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
    if (sport === 'NFL') {
      if (line < 25) return 'implausibly_low_full_game_total';
      if (line > 75) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
    if (sport === 'MLB') {
      if (line < 6) return 'implausibly_low_full_game_total';
      if (line > 20) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
    if (sport === 'NHL') {
      if (line < 4.5) return 'implausibly_low_full_game_total';
      if (line > 10) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
  }

  if (market === 'spread') {
    if ((sport === 'NBA' || sport === 'NFL') && abs > 35) return 'implausibly_wide_spread';
    if ((sport === 'MLB' || sport === 'NHL') && abs > 5) return 'implausibly_wide_spread';
    return 'plausible_spread';
  }

  return 'unchecked_line_range';
}

function isImplausibleLine(row) {
  return String(lineHealth(row)).startsWith('implausibly_');
}

function countLineHealth(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(lineHealth(row), (counts.get(lineHealth(row)) || 0) + 1);
  return Object.fromEntries(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]));
}

const excludedTrainingRows = EXCLUDE_IMPLAUSIBLE_LINES ? rawTrainRows.filter(isImplausibleLine) : [];
const trainRows = EXCLUDE_IMPLAUSIBLE_LINES ? rawTrainRows.filter((row) => !isImplausibleLine(row)) : rawTrainRows;
if (!trainRows.length) throw new Error('Training dataset empty after line-health filtering.');

const sports = [...new Set(trainRows.map((row) => row.sport))].sort();
const markets = [...new Set(trainRows.map((row) => row.market_type))].sort();
const books = [...new Set(trainRows.map((row) => row.book))].sort();

function featureVector(row) {
  return [
    toNumber(row.implied_prob, impliedProbFromAmericanOdds(row.odds) ?? 0.5),
    toNumber(row.line, 0),
    toNumber(row.odds, 0) / 100,
    row.is_best_price ? 1 : 0,
    row.is_opening ? 1 : 0,
    row.is_closing ? 1 : 0,
    Math.min(toNumber(row.qualifier_count, 0), 10) / 10,
    ...oneHot(row.sport, sports),
    ...oneHot(row.market_type, markets),
    ...oneHot(row.book, books),
  ];
}

const X = trainRows.map(featureVector);
const y = trainRows.map((row) => Number(row.label_win));
const means = [];
const stds = [];
for (let j = 0; j < X[0].length; j++) {
  const col = X.map((row) => row[j]);
  const m = mean(col);
  means.push(m);
  stds.push(std(col, m) || 1);
}
const normX = X.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));
const weights = new Array(normX[0].length).fill(0);
let bias = 0;
const learningRate = 0.08;
const epochs = 1200;
const l2 = 0.002;
for (let epoch = 0; epoch < epochs; epoch++) {
  const gradW = new Array(weights.length).fill(0);
  let gradB = 0;
  for (let i = 0; i < normX.length; i++) {
    const pred = sigmoid(dot(weights, normX[i]) + bias);
    const error = pred - y[i];
    for (let j = 0; j < weights.length; j++) gradW[j] += error * normX[i][j];
    gradB += error;
  }
  for (let j = 0; j < weights.length; j++) {
    gradW[j] = (gradW[j] / normX.length) + (l2 * weights[j]);
    weights[j] -= learningRate * gradW[j];
  }
  bias -= learningRate * (gradB / normX.length);
}

async function rest(pathname, options = {}) {
  const res = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`REST ${res.status} ${pathname}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

async function resolveModelVersion() {
  if (MODEL_VERSION_ARG && MODEL_VERSION_ARG !== 'active') return MODEL_VERSION_ARG;
  try {
    const rows = await rest('/goose_learning_lab_spaces?slug=eq.goose-shadow-lab&select=active_model_version&limit=1');
    const active = rows?.[0]?.active_model_version;
    if (active) return active;
  } catch (err) {
    console.warn(`[goose2-score-shadow] Could not resolve active learning model, using ${DEFAULT_MODEL_VERSION}: ${err instanceof Error ? err.message : err}`);
  }
  return DEFAULT_MODEL_VERSION;
}

const MODEL_VERSION = await resolveModelVersion();

async function loadLearningSignals(modelVersion) {
  try {
    const rows = await rest(`/goose_signal_candidates_v1?select=signal_key,train_sample,train_wins,train_losses,train_pushes,train_roi,test_sample,test_wins,test_losses,test_pushes,test_roi,edge_score,confidence_score,promotion_status,rejection_reason&model_version=eq.${encodeURIComponent(modelVersion)}&promotion_status=in.(eligible,shadow_daily_candidate,keep_shadow_only)&order=edge_score.desc&limit=1000`);
    return new Map((rows || [])
      .filter((row) => Number(row.test_sample || 0) >= 50)
      .map((row) => {
        // Apply confidence discount for shadow-only signals (cautionary flags present but signal directionally valid)
        if (row.promotion_status === 'keep_shadow_only') {
          row.confidence_score = Number((Number(row.confidence_score || 0) * 0.85).toFixed(6));
        }
        return [row.signal_key, row];
      }));
  } catch (err) {
    console.warn(`[goose2-score-shadow] Could not load learning signals for ${modelVersion}: ${err instanceof Error ? err.message : err}`);
    return new Map();
  }
}

function buildSystemSignalRows(qualifierRows) {
  const buckets = new Map();
  function add(key, qualifier) {
    if (!key || key.includes('unknown')) return;
    const stat = buckets.get(key) || {
      signal_key: key,
      signal_layer: 'system_edge',
      train_sample: 0,
      train_wins: 0,
      train_losses: 0,
      train_pushes: 0,
      train_roi: 0,
      test_sample: 0,
      test_wins: 0,
      test_losses: 0,
      test_pushes: 0,
      test_roi: 0,
      edge_score: 0,
      confidence_score: 0,
      promotion_status: 'eligible',
      rejection_reason: null,
      system_slug: signalToken(qualifier.system_slug || qualifier.system_id || qualifier.system_name),
    };
    const outcome = String(qualifier.outcome || '').toLowerCase();
    const units = Number(qualifier.net_units || 0);
    stat.test_sample += 1;
    stat.train_sample += 1;
    if (outcome === 'win') {
      stat.test_wins += 1;
      stat.train_wins += 1;
    } else if (outcome === 'loss') {
      stat.test_losses += 1;
      stat.train_losses += 1;
    } else {
      stat.test_pushes += 1;
      stat.train_pushes += 1;
    }
    stat.test_roi += units;
    stat.train_roi += units;
    buckets.set(key, stat);
  }

  for (const qualifier of qualifierRows) {
    const slug = signalToken(qualifier.system_slug || qualifier.system_id || qualifier.system_name);
    const sport = String(qualifier.league || '').toUpperCase() || 'UNKNOWN';
    const market = signalToken(qualifier.market_type || 'unknown_market');
    const action = signalToken(qualifier.action_side || qualifier.qualified_team || 'unknown');
    add(`SYSTEM:${slug}`, qualifier);
    add(`${sport}:system:${slug}`, qualifier);
    add(`${sport}:${market}:system:${slug}`, qualifier);
    if (action !== 'unknown') add(`${sport}:${market}:system:${slug}:action:${action}`, qualifier);
  }

  return Array.from(buckets.values()).map((stat) => {
    const decisions = stat.test_wins + stat.test_losses;
    const roi = stat.test_sample ? stat.test_roi / stat.test_sample : 0;
    const winRate = decisions ? stat.test_wins / decisions : 0;
    stat.test_roi = Number(roi.toFixed(6));
    stat.train_roi = stat.test_roi;
    stat.edge_score = Number(Math.max(0, Math.min(0.25, (roi * 0.65) + ((winRate - 0.5) * 0.2))).toFixed(6));
    // System-edge rows are deliberately gated by SYSTEM_EDGE_MIN_SAMPLE. Scale confidence
    // from that floor instead of a hard-coded 50 rows, otherwise the default min sample
    // (10) can never pass the global 0.45 confidence threshold.
    const sampleConfidence = stat.test_sample / Math.max(SYSTEM_EDGE_MIN_SAMPLE * 1.5, SYSTEM_EDGE_MIN_SAMPLE);
    stat.confidence_score = Number(Math.min(1, sampleConfidence * Math.max(0.45, Math.min(1, roi / 0.08))).toFixed(6));
    return stat;
  }).filter((stat) => stat.test_sample >= SYSTEM_EDGE_MIN_SAMPLE && stat.test_roi > 0 && stat.edge_score >= MIN_EDGE && stat.confidence_score >= LEARNING_CONFIDENCE_MIN);
}

async function loadSystemEdgeSignals() {
  try {
    const rows = await rest('/system_qualifiers?select=system_id,system_slug,system_name,league,market_type,action_side,qualified_team,outcome,net_units,settlement_status&settlement_status=eq.settled&order=game_date.desc&limit=5000');
    return new Map(buildSystemSignalRows(rows || []).map((row) => [row.signal_key, row]));
  } catch (err) {
    console.warn(`[goose2-score-shadow] Could not load system edge signals: ${err instanceof Error ? err.message : err}`);
    return new Map();
  }
}

const learningSignals = await loadLearningSignals(MODEL_VERSION);
const systemEdgeSignals = await loadSystemEdgeSignals();
for (const [key, value] of systemEdgeSignals.entries()) {
  if (!learningSignals.has(key) || Number(value.edge_score || 0) > Number(learningSignals.get(key)?.edge_score || 0)) learningSignals.set(key, value);
}

const targetDate = args.date || args.positional[0] || new Date().toISOString().slice(0, 10);
function quoteInValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function chunk(values, size = 150) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
async function fetchPagedCandidates(date) {
  const out = [];
  const select = 'candidate_id,event_id,sport,league,event_date,market_type,participant_name,opponent_name,side,line,odds,book,capture_ts,is_best_price,is_opening,is_closing';
  const capturedAfter = SCORE_SPORT === 'NFL' && !ALLOW_HISTORICAL_SCORING
    ? new Date(Date.now() - (NFL_LIVE_MAX_PRICE_AGE_HOURS * 60 * 60 * 1000)).toISOString()
    : null;
  const latestCaptureRows = capturedAfter
    ? await rest(buildLatestCandidateCapturePath({ date, sport: SCORE_SPORT, capturedAfter }))
    : null;
  const latestCaptureTs = latestCaptureRows?.[0]?.capture_ts || null;
  if (capturedAfter && !latestCaptureTs) return out;
  for (let offset = 0; offset < SCORE_MAX_ROWS; offset += SCORE_PAGE_SIZE) {
    const page = await rest(buildCandidatePagePath({
      date,
      sport: SCORE_SPORT,
      capturedAt: latestCaptureTs,
      select,
      limit: SCORE_PAGE_SIZE,
      offset,
    }));
    out.push(...(page || []));
    if (!page || page.length < SCORE_PAGE_SIZE) break;
  }
  if (out.length >= SCORE_MAX_ROWS) {
    const overflow = await rest(buildCandidatePagePath({
      date,
      sport: SCORE_SPORT,
      capturedAt: latestCaptureTs,
      select: 'candidate_id',
      limit: 1,
      offset: SCORE_MAX_ROWS,
    }));
    if (overflow?.length) {
      throw new Error(`candidate query reached the configured cap of ${SCORE_MAX_ROWS} rows`);
    }
  }
  return out;
}
async function fetchByIds(table, idColumn, ids, select, chunkSize = 25) {
  const byId = new Map();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (const group of chunk(unique, chunkSize)) {
    const params = new URLSearchParams({ select, limit: '5000' });
    params.append(idColumn, `in.(${group.map(quoteInValue).join(',')})`);
    const rows = await rest(`/${table}?${params.toString()}`);
    for (const row of rows || []) {
      const key = row[idColumn];
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(row);
    }
  }
  return byId;
}

const candidateRows = filterRowsBySport(await fetchPagedCandidates(targetDate), SCORE_SPORT);
const featureRowsByCandidate = await fetchByIds('goose_feature_rows', 'candidate_id', candidateRows.map((row) => row.candidate_id), 'candidate_id,feature_row_id,feature_version,feature_payload,system_flags,generated_ts');
const eventRowsByEvent = await fetchByIds('goose_market_events', 'event_id', candidateRows.map((row) => row.event_id), 'event_id,commence_time,status,home_team,away_team');
const decisionRowsByCandidate = FORCE_RESCORE
  ? new Map()
  : await fetchByIds('goose_decision_log', 'candidate_id', candidateRows.map((row) => row.candidate_id), 'candidate_id,decision_id,policy_version,model_version,decision_ts');
const rows = candidateRows
  .map((row) => ({
    ...row,
    goose_feature_rows: featureRowsByCandidate.get(row.candidate_id) || [],
    goose_market_events: eventRowsByEvent.get(row.event_id) || [],
    goose_decision_log: decisionRowsByCandidate.get(row.candidate_id) || [],
  }))
  .filter((row) => row.goose_feature_rows.length && row.goose_market_events.length);

async function loadNFLPlayerPropEvidence(candidateRowsForDate) {
  if (SCORE_SPORT !== 'NFL') return new Map();
  const playerNames = Array.from(new Set(candidateRowsForDate
    .filter((row) => isNFLPlayerPropMarket(row.market_type))
    .map((row) => String(row.participant_name || '').trim())
    .filter(Boolean)));
  if (!playerNames.length) return new Map();

  const athletesResponse = await fetch('https://partners.api.espn.com/v2/sports/football/nfl/athletes?limit=7000', {
    signal: AbortSignal.timeout(30_000),
  });
  if (!athletesResponse.ok) throw new Error(`ESPN NFL athletes HTTP ${athletesResponse.status}`);
  const athletesPayload = await athletesResponse.json();
  const athletes = Array.isArray(athletesPayload?.athletes) ? athletesPayload.athletes : [];

  const targetSeason = Number(String(targetDate).slice(0, 4));
  const seasons = [targetSeason, targetSeason - 1];
  const categoriesByPlayer = new Map();
  for (let index = 0; index < playerNames.length; index += 12) {
    const batch = playerNames.slice(index, index + 12);
    await Promise.all(batch.map(async (playerName) => {
      const playerKey = normalizeNFLPlayerName(playerName);
      const eventTeams = candidateRowsForDate
        .filter((row) => normalizeNFLPlayerName(row.participant_name) === playerKey)
        .flatMap((row) => {
          const event = Array.isArray(row.goose_market_events) ? row.goose_market_events[0] : row.goose_market_events;
          return [event?.home_team, event?.away_team].filter(Boolean);
        });
      const athleteId = resolveUniqueNFLAthleteId(athletes, playerName, eventTeams);
      if (!athleteId) return;
      const payloads = await Promise.all(seasons.map(async (season) => {
        const response = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${encodeURIComponent(athleteId)}/gamelog?season=${season}`,
          { signal: AbortSignal.timeout(20_000) }).catch(() => null);
        if (!response?.ok) return null;
        return response.json().catch(() => null);
      }));
      const categories = payloads.flatMap((payload) => extractESPNPlayerGameLogCategories(payload));
      if (categories.length) categoriesByPlayer.set(normalizeNFLPlayerName(playerName), categories);
    }));
  }

  const evidenceByCandidate = new Map();
  for (const row of candidateRowsForDate) {
    if (!isNFLPlayerPropMarket(row.market_type)) continue;
    const evidence = calculateNFLPlayerPropEvidence({
      marketType: row.market_type,
      side: row.side,
      line: row.line,
      categories: categoriesByPlayer.get(normalizeNFLPlayerName(row.participant_name)) || [],
    });
    if (evidence) evidenceByCandidate.set(row.candidate_id, evidence);
  }
  return evidenceByCandidate;
}

const latestByEventMarketSide = new Map();
for (const row of rows) {
  const decisions = Array.isArray(row.goose_decision_log) ? row.goose_decision_log : [];
  if (!FORCE_RESCORE && decisions.some((d) => d.policy_version === POLICY_VERSION && String(d.model_version || '') === MODEL_VERSION)) continue;
  const event = Array.isArray(row.goose_market_events) ? row.goose_market_events[0] : row.goose_market_events;
  const gameKey = event?.home_team && event?.away_team
    ? `${normalizeToken(event.away_team)}@${normalizeToken(event.home_team)}:${row.event_date}`
    : row.event_id;
  const participantKey = isNFLPlayerPropMarket(row.market_type)
    ? `${normalizeNFLPlayerName(row.participant_name)}:${normalizeToken(row.side)}:${row.line ?? ''}`
    : sideRole(row, event);
  const dedupeKey = [gameKey, row.market_type, participantKey, row.book || 'unknown'].join('|');
  const existing = latestByEventMarketSide.get(dedupeKey);
  if (!existing || String(row.capture_ts) > String(existing.capture_ts)) latestByEventMarketSide.set(dedupeKey, row);
}

const nflPlayerPropEvidence = await loadNFLPlayerPropEvidence(Array.from(latestByEventMarketSide.values()));
const scored = [];
for (const row of latestByEventMarketSide.values()) {
  if (!ALLOWED_MARKETS.has(row.market_type)) continue;
  const feature = latestFeatureRow(row.goose_feature_rows);
  const event = Array.isArray(row.goose_market_events) ? row.goose_market_events[0] : row.goose_market_events;
  const implied = impliedProbFromAmericanOdds(row.odds) ?? 0.5;
  const systems = systemsForFeature(feature);
  const qualifierCount = Number(feature?.system_flags?.qualifier_count ?? systems.length ?? 0);
  const vector = featureVector({
    ...row,
    implied_prob: implied,
    qualifier_count: qualifierCount,
  }).map((v, j) => (v - means[j]) / stds[j]);
  const playerPropEvidence = isNFLPlayerPropMarket(row.market_type)
    ? nflPlayerPropEvidence.get(row.candidate_id) || null
    : null;
  const modelPTrue = sigmoid(dot(weights, vector) + bias);
  const pTrue = playerPropEvidence?.hitRate ?? modelPTrue;
  const calibrated = pTrue;
  const modelEdge = calibrated - implied;
  const signalKeys = signalsForCandidate(row, event, feature);
  const empiricalPlayerSignal = playerPropEvidence ? {
    signal_key: `NFL:${row.market_type}:player:${normalizeNFLPlayerName(row.participant_name)}:espn_game_log`,
    promotion_status: playerPropEvidence.sample >= 10 ? 'eligible' : 'observed',
    test_sample: playerPropEvidence.sample,
    test_wins: playerPropEvidence.wins,
    test_losses: playerPropEvidence.losses,
    test_pushes: playerPropEvidence.pushes,
    test_roi: 0,
    edge_score: modelEdge,
    confidence_score: Math.min(0.95, playerPropEvidence.sample / 16),
  } : null;
  const matchedSignals = empiricalPlayerSignal
    ? [empiricalPlayerSignal]
    : signalKeys.map((key) => learningSignals.get(key)).filter(Boolean);
  matchedSignals.sort((a, b) => Number(b.edge_score || 0) - Number(a.edge_score || 0));
  const matchedSystemSignals = matchedSignals.filter((signal) => isSystemSignalKey(signal.signal_key));
  const matchedMarketSignals = matchedSignals.filter((signal) => !isSystemSignalKey(signal.signal_key));
  const primarySystemSignal = matchedSystemSignals[0] || null;
  const primaryMarketSignal = matchedMarketSignals[0] || null;
  const primarySignal = primarySystemSignal || primaryMarketSignal || matchedSignals[0] || null;
  const systemEdge = Number(primarySystemSignal?.edge_score ?? Number.NaN);
  const marketEdge = Number(primaryMarketSignal?.edge_score ?? Number.NaN);
  const systemConfidence = Number(primarySystemSignal?.confidence_score ?? Number.NaN);
  const marketConfidence = Number(primaryMarketSignal?.confidence_score ?? Number.NaN);
  const learnedEdge = Number.isFinite(systemEdge) && Number.isFinite(marketEdge)
    ? Math.max(systemEdge, (systemEdge * 0.7) + (marketEdge * 0.3))
    : Number(primarySignal?.edge_score ?? Number.NaN);
  const learnedConfidence = Number.isFinite(systemConfidence) && Number.isFinite(marketConfidence)
    ? Math.max(systemConfidence, (systemConfidence * 0.7) + (marketConfidence * 0.3))
    : Number(primarySignal?.confidence_score ?? Number.NaN);
  const edge = Number.isFinite(learnedEdge) ? learnedEdge : modelEdge;
  const confidenceScore = Number.isFinite(learnedConfidence) ? learnedConfidence : Math.max(0, Math.min(1, modelEdge / 0.2));
  const confidenceBand = confidenceScore >= 0.85 ? 'A' : confidenceScore >= 0.65 ? 'B' : confidenceScore >= 0.45 ? 'C' : 'D';
  const rejectionReasons = [];
  const candidateLineHealth = lineHealth(row);
  if (!matchedSignals.length) rejectionReasons.push('no_matched_learning_signal');
  if (isNFLPlayerPropMarket(row.market_type) && (!playerPropEvidence || playerPropEvidence.sample < 10)) rejectionReasons.push('insufficient_player_game_log_sample');
  if (confidenceScore < LEARNING_CONFIDENCE_MIN) rejectionReasons.push('below_learning_confidence_floor');
  if (edge < MIN_EDGE) rejectionReasons.push('edge_below_floor');
  if (EXCLUDE_IMPLAUSIBLE_LINES && isImplausibleLine(row)) rejectionReasons.push(`implausible_line:${candidateLineHealth}`);
  if (!ALLOW_HISTORICAL_SCORING && !['scheduled', 'unknown'].includes(String(event?.status ?? 'unknown'))) rejectionReasons.push('event_not_pregame');

  scored.push({
    candidate_id: row.candidate_id,
    event_id: row.event_id,
    league: row.league,
    feature_row_id: feature?.feature_row_id ?? null,
    sport: row.sport,
    market_type: row.market_type,
    participant_name: row.participant_name,
    opponent_name: row.opponent_name,
    side: row.side,
    line: row.line,
    odds: row.odds,
    book: row.book,
    implied_prob: implied,
    p_true: pTrue,
    calibrated_p_true: calibrated,
    edge,
    model_edge: modelEdge,
    confidence_score: confidenceScore,
    qualifier_count: qualifierCount,
    system_qualifiers: systems,
    system_qualifier_slugs: systems.map((system) => system.system_slug),
    system_edge_score: Number.isFinite(systemEdge) ? systemEdge : null,
    system_confidence_score: Number.isFinite(systemConfidence) ? systemConfidence : null,
    market_edge_score: Number.isFinite(marketEdge) ? marketEdge : null,
    market_confidence_score: Number.isFinite(marketConfidence) ? marketConfidence : null,
    signal_keys: signalKeys,
    matched_signal_keys: matchedSignals.map((signal) => signal.signal_key),
    matched_system_signal_keys: matchedSystemSignals.map((signal) => signal.signal_key),
    matched_market_signal_keys: matchedMarketSignals.map((signal) => signal.signal_key),
    primary_signal: primarySignal,
    primary_system_signal: primarySystemSignal,
    primary_market_signal: primaryMarketSignal,
    capture_ts: row.capture_ts,
    confidence_band: confidenceBand,
    rejection_reasons: rejectionReasons,
    event_status: event?.status ?? null,
    line_health: candidateLineHealth,
    home_team: event?.home_team ?? null,
    away_team: event?.away_team ?? null,
  });
}

scored.sort((a, b) => {
  if (SCORE_SPORT === 'NFL') {
    const productionDelta = Number(isNFLProductionReadyShadowRow(b)) - Number(isNFLProductionReadyShadowRow(a));
    if (productionDelta !== 0) return productionDelta;
  }
  const scoreDelta = (b.edge + (b.matched_system_signal_keys.length ? 0.005 : 0)) - (a.edge + (a.matched_system_signal_keys.length ? 0.005 : 0));
  if (scoreDelta !== 0) return scoreDelta;
  const freshnessDelta = new Date(b.capture_ts).getTime() - new Date(a.capture_ts).getTime();
  if (freshnessDelta !== 0) return freshnessDelta;
  if (a.market_type === 'total' && b.market_type === 'total' && a.side === b.side) {
    const lineDelta = String(a.side).toLowerCase().includes('under')
      ? Number(b.line) - Number(a.line)
      : Number(a.line) - Number(b.line);
    if (lineDelta !== 0) return lineDelta;
  }
  if (a.market_type === 'spread' && b.market_type === 'spread') {
    const lineDelta = Number(b.line) - Number(a.line);
    if (lineDelta !== 0) return lineDelta;
  }
  return Number(b.odds || -100000) - Number(a.odds || -100000);
});
const picks = [];
const countsByBucket = new Map();
const approvedGameMarkets = new Set();
for (const row of scored) {
  const isNFLProp = row.sport === 'NFL' && isNFLPlayerPropMarket(row.market_type);
  const bucket = row.sport === 'NFL' ? (isNFLProp ? 'NFL:player-props' : 'NFL:team-markets') : row.sport;
  const selectionTier = row.sport === 'NFL'
    ? (isNFLProductionReadyShadowRow(row) ? 'production' : 'learning')
    : 'selection';
  const counterBucket = `${bucket}:${selectionTier}`;
  const current = countsByBucket.get(counterBucket) ?? 0;
  const categoryLimit = row.sport === 'NFL'
    ? (isNFLPlayerPropMarket(row.market_type) ? NFL_PLAYER_PROP_PICK_TARGET : NFL_TEAM_PICK_TARGET)
    : MAX_PLAYS_PER_SPORT;
  const gameMarketKey = isNFLProp
    ? buildNFLPlayerPropSelectionKey({
        eventId: row.event_id,
        marketType: row.market_type,
        participantName: row.participant_name,
      })
    : [
        row.sport,
        row.home_team && row.away_team ? `${normalizeToken(row.away_team)}@${normalizeToken(row.home_team)}` : row.event_id,
        row.market_type,
      ].join('|');
  const approved = row.rejection_reasons.length === 0
    && current < categoryLimit
    && !approvedGameMarkets.has(gameMarketKey);
  if (approved) {
    countsByBucket.set(counterBucket, current + 1);
    approvedGameMarkets.add(gameMarketKey);
    picks.push(row.candidate_id);
  }
  row.bet_decision = approved;
  row.recommended_tier = approved ? (row.calibrated_p_true >= 0.67 ? 'A' : 'B') : 'shadow';
  row.reason_rejected = approved ? null : (row.rejection_reasons[0] ?? 'shadow_only');
}

const decisionTs = new Date().toISOString();
const decisionRows = scored.map((row) => ({
  decision_id: buildDecisionId(row.candidate_id, MODEL_VERSION, POLICY_VERSION, decisionTs),
  candidate_id: row.candidate_id,
  event_id: row.event_id,
  feature_row_id: row.feature_row_id,
  upstream_goose_model_pick_id: null,
  decision_ts: decisionTs,
  model_version: MODEL_VERSION,
  policy_version: POLICY_VERSION,
  bet_decision: row.bet_decision,
  recommended_tier: row.recommended_tier,
  stake_suggestion: row.bet_decision ? (row.recommended_tier === 'A' ? 1 : 0.5) : null,
  edge: Number(row.edge.toFixed(6)),
  p_true: Number(row.p_true.toFixed(6)),
  calibrated_p_true: Number(row.calibrated_p_true.toFixed(6)),
  confidence_band: row.confidence_band,
  reason_rejected: row.reason_rejected,
  rejection_reasons: row.rejection_reasons,
  explanation: {
    mode: 'shadow_selective',
    philosophy: 'low_volume_high_confidence',
    max_plays_per_sport: MAX_PLAYS_PER_SPORT,
    min_learning_confidence: LEARNING_CONFIDENCE_MIN,
    min_edge: MIN_EDGE,
    qualifier_count: row.qualifier_count,
    system_qualifier_slugs: row.system_qualifier_slugs,
    matched_learning_signals: row.matched_signal_keys,
    matched_system_edge_signals: row.matched_system_signal_keys,
    matched_market_feature_signals: row.matched_market_signal_keys,
    primary_learning_signal: row.primary_signal?.signal_key ?? null,
    primary_system_edge_signal: row.primary_system_signal?.signal_key ?? null,
    implied_prob: row.implied_prob,
    market_type: row.market_type,
    participant_name: row.participant_name,
    book: row.book,
  },
  source: 'goose2',
}));

if (decisionRows.length) {
  for (const group of chunk(decisionRows, 250)) {
    await rest('/goose_decision_log?on_conflict=decision_id', {
      method: 'POST',
      body: JSON.stringify(group),
    });
  }
}

const shadowPickRows = scored.filter((row) => row.bet_decision).map((row) => ({
  lab_slug: 'goose-shadow-lab',
  model_version: MODEL_VERSION,
  pick_date: targetDate,
  sport: row.sport,
  league: row.league,
  candidate_id: row.candidate_id,
  canonical_game_id: row.event_id,
  event_id: row.event_id,
  pick_label: [row.sport, row.market_type, row.participant_name || row.side, row.line ?? '', row.book || ''].filter(Boolean).join(' '),
  market_family: row.market_type,
  market_type: row.market_type,
  side: row.side,
  line: row.line,
  odds: row.odds,
  sportsbook: row.book,
  team_name: selectedEntityName(row),
  opponent_name: opposingEntityName(row),
  signal_keys: row.matched_signal_keys,
  model_score: Number(row.calibrated_p_true.toFixed(6)),
  confidence_score: Number(row.confidence_score.toFixed(6)),
  evidence_snapshot: {
    source: 'goose2-score-shadow',
    policy_version: POLICY_VERSION,
    confidence_band: row.confidence_band,
    edge: Number(row.edge.toFixed(6)),
    model_edge: Number(row.model_edge.toFixed(6)),
    p_true: Number(row.p_true.toFixed(6)),
    calibrated_p_true: Number(row.calibrated_p_true.toFixed(6)),
    implied_prob: Number(row.implied_prob.toFixed(6)),
    qualifier_count: row.qualifier_count,
    system_qualifier_slugs: row.system_qualifier_slugs,
    matched_learning_signals: row.matched_signal_keys,
    matched_system_edge_signals: row.matched_system_signal_keys,
    matched_market_feature_signals: row.matched_market_signal_keys,
    primary_learning_signal: row.primary_signal ? {
      signal_key: row.primary_signal.signal_key,
      promotion_status: row.primary_signal.promotion_status,
      test_sample: Number(row.primary_signal.test_sample || 0),
      test_wins: Number(row.primary_signal.test_wins || 0),
      test_losses: Number(row.primary_signal.test_losses || 0),
      test_pushes: Number(row.primary_signal.test_pushes || 0),
      test_roi: Number(row.primary_signal.test_roi || 0),
      edge_score: Number(row.primary_signal.edge_score || 0),
      confidence_score: Number(row.primary_signal.confidence_score || 0),
    } : null,
    primary_system_edge_signal: row.primary_system_signal ? {
      signal_key: row.primary_system_signal.signal_key,
      promotion_status: row.primary_system_signal.promotion_status,
      test_sample: Number(row.primary_system_signal.test_sample || 0),
      test_wins: Number(row.primary_system_signal.test_wins || 0),
      test_losses: Number(row.primary_system_signal.test_losses || 0),
      test_pushes: Number(row.primary_system_signal.test_pushes || 0),
      test_roi: Number(row.primary_system_signal.test_roi || 0),
      edge_score: Number(row.primary_system_signal.edge_score || 0),
      confidence_score: Number(row.primary_system_signal.confidence_score || 0),
    } : null,
    capture_ts: row.capture_ts,
    home_team: row.home_team,
    away_team: row.away_team,
    line_health: row.line_health,
  },
  status: 'recorded',
  result: 'pending',
}));

if (FORCE_RESCORE) {
  await rest(`/goose_learning_shadow_picks?lab_slug=eq.goose-shadow-lab&model_version=eq.${encodeURIComponent(MODEL_VERSION)}&pick_date=eq.${encodeURIComponent(targetDate)}`, {
    method: 'DELETE',
  });
}

if (shadowPickRows.length) {
  for (const group of chunk(shadowPickRows, 250)) {
    await rest('/goose_learning_shadow_picks?on_conflict=lab_slug,model_version,candidate_id', {
      method: 'POST',
      body: JSON.stringify(group),
    });
  }
}

const report = {
  generated_at: decisionTs,
  target_date: targetDate,
  score_sport: SCORE_SPORT || 'ALL',
  model_version: MODEL_VERSION,
  policy_version: POLICY_VERSION,
  philosophy: 'low_volume_high_confidence',
  thresholds: {
    min_learning_confidence: LEARNING_CONFIDENCE_MIN,
    min_edge: MIN_EDGE,
    max_plays_per_sport: MAX_PLAYS_PER_SPORT,
    system_edge_min_sample: SYSTEM_EDGE_MIN_SAMPLE,
    exclude_implausible_lines: EXCLUDE_IMPLAUSIBLE_LINES,
  },
  training_filter: {
    training_dataset: trainPath,
    raw_training_rows: rawTrainRows.length,
    training_rows_used: trainRows.length,
    excluded_implausible_training_lines: excludedTrainingRows.length,
    excluded_training_line_health: countLineHealth(excludedTrainingRows),
    learning_confidence_min: LEARNING_CONFIDENCE_MIN,
    allow_historical_scoring: ALLOW_HISTORICAL_SCORING,
  },
  counts: {
    candidates_considered: scored.length,
    decisions_written: decisionRows.length,
    approved_picks: decisionRows.filter((row) => row.bet_decision).length,
    shadow_picks_upserted: shadowPickRows.length,
    rejected: decisionRows.filter((row) => !row.bet_decision).length,
    rejected_implausible_line: decisionRows.filter((row) => Array.isArray(row.rejection_reasons) && row.rejection_reasons.some((reason) => String(reason).startsWith('implausible_line:'))).length,
    system_edge_signals_loaded: systemEdgeSignals.size,
    system_qualified_candidates: scored.filter((row) => row.system_qualifier_slugs.length > 0).length,
    candidates_with_system_edge_signal: scored.filter((row) => row.matched_system_signal_keys.length > 0).length,
    approved_with_system_edge_signal: scored.filter((row) => row.bet_decision && row.matched_system_signal_keys.length > 0).length,
  },
  approved_by_bucket: Object.fromEntries([...countsByBucket.entries()]),
  top_approved: scored.filter((row) => row.bet_decision).slice(0, 10),
  top_rejections: scored.filter((row) => !row.bet_decision).slice(0, 10),
};

fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-shadow-score-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
