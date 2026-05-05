import fs from 'fs';
import path from 'path';

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
const LEARNING_CONFIDENCE_MIN = 0.45;
const MIN_EDGE = 0.035;
const MAX_PLAYS_PER_SPORT = 3;
const EXCLUDE_IMPLAUSIBLE_LINES = args.excludeImplausibleLines !== 'false';
const ALLOWED_MARKETS = new Set(['moneyline', 'spread', 'total', 'first_five_total', 'first_five_side']);
const FORCE_RESCORE = args.force === 'true' || args.force === '1';

const trainPath = path.join(process.cwd(), 'tmp', 'goose2-training-dataset-v1.json');
if (!fs.existsSync(trainPath)) throw new Error('Missing training dataset. Run npm run goose2:export-training first.');
const rawTrainRows = JSON.parse(fs.readFileSync(trainPath, 'utf8')).rows;
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
function spreadLineBucket(line) {
  if (line == null || !Number.isFinite(Number(line))) return 'no_line';
  const n = Math.abs(Number(line));
  if (n <= 2.5) return 'line_0_to_2_5';
  if (n <= 5.5) return 'line_3_to_5_5';
  if (n <= 8.5) return 'line_6_to_8_5';
  return 'line_9_plus';
}
function totalLineBucket(sport, line) {
  if (line == null || !Number.isFinite(Number(line))) return 'total_no_line';
  const n = Number(line);
  if (sport === 'NFL') return n < 42 ? 'total_low' : n <= 47.5 ? 'total_mid' : 'total_high';
  if (sport === 'NBA') return n < 220 ? 'total_low' : n <= 230 ? 'total_mid' : 'total_high';
  if (sport === 'MLB') return n < 8 ? 'total_low' : n <= 9 ? 'total_mid' : 'total_high';
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
function signalsForCandidate(row, event) {
  const sport = String(row.sport || row.league || 'UNKNOWN').toUpperCase();
  const market = String(row.market_type || 'unknown_market');
  const role = sideRole(row, event);
  const signals = new Set();
  signals.add(`${sport}:${market}:${role}`);
  signals.add(`${sport}:${market}:${role}:${oddsBucket(row.odds)}`);
  if (market === 'spread') signals.add(`${sport}:${market}:${role}:${spreadLineBucket(row.line)}`);
  if (market === 'total') signals.add(`${sport}:${market}:${role}:${totalLineBucket(sport, row.line)}`);
  signals.add(`${sport}:${market}:${role}:book:${compactToken(row.book)}`);
  if (market !== 'total') {
    if (Number(row.odds) < 0) signals.add(`${sport}:${market}:${role}:favorite`);
    if (Number(row.odds) > 0) signals.add(`${sport}:${market}:${role}:underdog`);
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
function buildDecisionId(candidateId, policyVersion, ts) {
  return `dec:${candidateId}:${normalizeToken(policyVersion)}:${minuteBucket(ts)}`;
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
    const rows = await rest(`/goose_signal_candidates_v1?select=signal_key,train_sample,train_wins,train_losses,train_pushes,train_roi,test_sample,test_wins,test_losses,test_pushes,test_roi,edge_score,confidence_score,promotion_status,rejection_reason&model_version=eq.${encodeURIComponent(modelVersion)}&promotion_status=eq.eligible&order=edge_score.desc&limit=1000`);
    return new Map((rows || [])
      .filter((row) => Number(row.test_sample || 0) >= 50)
      .map((row) => [row.signal_key, row]));
  } catch (err) {
    console.warn(`[goose2-score-shadow] Could not load learning signals for ${modelVersion}: ${err instanceof Error ? err.message : err}`);
    return new Map();
  }
}

const learningSignals = await loadLearningSignals(MODEL_VERSION);

const targetDate = args.date || args.positional[0] || new Date().toISOString().slice(0, 10);
const select = [
  'candidate_id,event_id,sport,league,event_date,market_type,participant_name,opponent_name,side,line,odds,book,capture_ts,is_best_price,is_opening,is_closing',
  'goose_feature_rows!inner(feature_row_id,feature_version,feature_payload,system_flags,generated_ts)',
  'goose_market_events!inner(commence_time,status,home_team,away_team)',
  'goose_decision_log!left(decision_id,policy_version,decision_ts)'
].join(',');
const rows = await rest(`/goose_market_candidates?select=${encodeURIComponent(select)}&event_date=eq.${targetDate}&order=capture_ts.desc&limit=5000`);

const latestByEventMarketSide = new Map();
for (const row of rows) {
  const decisions = Array.isArray(row.goose_decision_log) ? row.goose_decision_log : [];
  if (!FORCE_RESCORE && decisions.some((d) => d.policy_version === POLICY_VERSION)) continue;
  const event = Array.isArray(row.goose_market_events) ? row.goose_market_events[0] : row.goose_market_events;
  const dedupeKey = [row.event_id, row.market_type, sideRole(row, event)].join('|');
  const existing = latestByEventMarketSide.get(dedupeKey);
  if (!existing || String(row.capture_ts) > String(existing.capture_ts)) latestByEventMarketSide.set(dedupeKey, row);
}

const scored = [];
for (const row of latestByEventMarketSide.values()) {
  if (!ALLOWED_MARKETS.has(row.market_type)) continue;
  const feature = Array.isArray(row.goose_feature_rows) ? row.goose_feature_rows[0] : row.goose_feature_rows;
  const event = Array.isArray(row.goose_market_events) ? row.goose_market_events[0] : row.goose_market_events;
  const implied = impliedProbFromAmericanOdds(row.odds) ?? 0.5;
  const qualifierCount = Number(feature?.system_flags?.qualifier_count ?? 0);
  const vector = featureVector({
    ...row,
    implied_prob: implied,
    qualifier_count: qualifierCount,
  }).map((v, j) => (v - means[j]) / stds[j]);
  const pTrue = sigmoid(dot(weights, vector) + bias);
  const calibrated = pTrue;
  const modelEdge = calibrated - implied;
  const signalKeys = signalsForCandidate(row, event);
  const matchedSignals = signalKeys.map((key) => learningSignals.get(key)).filter(Boolean);
  matchedSignals.sort((a, b) => Number(b.edge_score || 0) - Number(a.edge_score || 0));
  const primarySignal = matchedSignals[0] || null;
  const learnedEdge = Number(primarySignal?.edge_score ?? Number.NaN);
  const learnedConfidence = Number(primarySignal?.confidence_score ?? Number.NaN);
  const edge = Number.isFinite(learnedEdge) ? learnedEdge : modelEdge;
  const confidenceScore = Number.isFinite(learnedConfidence) ? learnedConfidence : Math.max(0, Math.min(1, modelEdge / 0.2));
  const confidenceBand = confidenceScore >= 0.85 ? 'A' : confidenceScore >= 0.65 ? 'B' : confidenceScore >= 0.45 ? 'C' : 'D';
  const rejectionReasons = [];
  const candidateLineHealth = lineHealth(row);
  if (!matchedSignals.length) rejectionReasons.push('no_matched_learning_signal');
  if (confidenceScore < LEARNING_CONFIDENCE_MIN) rejectionReasons.push('below_learning_confidence_floor');
  if (edge < MIN_EDGE) rejectionReasons.push('edge_below_floor');
  if (EXCLUDE_IMPLAUSIBLE_LINES && isImplausibleLine(row)) rejectionReasons.push(`implausible_line:${candidateLineHealth}`);
  if (!['scheduled', 'unknown'].includes(String(event?.status ?? 'unknown'))) rejectionReasons.push('event_not_pregame');

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
    signal_keys: signalKeys,
    matched_signal_keys: matchedSignals.map((signal) => signal.signal_key),
    primary_signal: primarySignal,
    capture_ts: row.capture_ts,
    confidence_band: confidenceBand,
    rejection_reasons: rejectionReasons,
    event_status: event?.status ?? null,
    line_health: candidateLineHealth,
    home_team: event?.home_team ?? null,
    away_team: event?.away_team ?? null,
  });
}

scored.sort((a, b) => b.edge - a.edge);
const picks = [];
const countsBySport = new Map();
for (const row of scored) {
  const current = countsBySport.get(row.sport) ?? 0;
  const approved = row.rejection_reasons.length === 0 && current < MAX_PLAYS_PER_SPORT;
  if (approved) {
    countsBySport.set(row.sport, current + 1);
    picks.push(row.candidate_id);
  }
  row.bet_decision = approved;
  row.recommended_tier = approved ? (row.calibrated_p_true >= 0.67 ? 'A' : 'B') : 'shadow';
  row.reason_rejected = approved ? null : (row.rejection_reasons[0] ?? 'shadow_only');
}

const decisionTs = new Date().toISOString();
const decisionRows = scored.map((row) => ({
  decision_id: buildDecisionId(row.candidate_id, POLICY_VERSION, decisionTs),
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
    matched_learning_signals: row.matched_signal_keys,
    primary_learning_signal: row.primary_signal?.signal_key ?? null,
    implied_prob: row.implied_prob,
    market_type: row.market_type,
    participant_name: row.participant_name,
    book: row.book,
  },
  source: 'goose2',
}));

if (decisionRows.length) {
  await rest('/goose_decision_log?on_conflict=decision_id', {
    method: 'POST',
    body: JSON.stringify(decisionRows),
  });
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
  team_name: row.participant_name || row.home_team || null,
  opponent_name: row.opponent_name || row.away_team || null,
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
    matched_learning_signals: row.matched_signal_keys,
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
  await rest('/goose_learning_shadow_picks?on_conflict=lab_slug,model_version,candidate_id', {
    method: 'POST',
    body: JSON.stringify(shadowPickRows),
  });
}

const report = {
  generated_at: decisionTs,
  target_date: targetDate,
  model_version: MODEL_VERSION,
  policy_version: POLICY_VERSION,
  philosophy: 'low_volume_high_confidence',
  thresholds: {
    min_learning_confidence: LEARNING_CONFIDENCE_MIN,
    min_edge: MIN_EDGE,
    max_plays_per_sport: MAX_PLAYS_PER_SPORT,
    exclude_implausible_lines: EXCLUDE_IMPLAUSIBLE_LINES,
  },
  training_filter: {
    raw_training_rows: rawTrainRows.length,
    training_rows_used: trainRows.length,
    excluded_implausible_training_lines: excludedTrainingRows.length,
    excluded_training_line_health: countLineHealth(excludedTrainingRows),
  },
  counts: {
    candidates_considered: scored.length,
    decisions_written: decisionRows.length,
    approved_picks: decisionRows.filter((row) => row.bet_decision).length,
    shadow_picks_upserted: shadowPickRows.length,
    rejected: decisionRows.filter((row) => !row.bet_decision).length,
    rejected_implausible_line: decisionRows.filter((row) => Array.isArray(row.rejection_reasons) && row.rejection_reasons.some((reason) => String(reason).startsWith('implausible_line:'))).length,
  },
  approved_by_sport: Object.fromEntries([...countsBySport.entries()]),
  top_approved: scored.filter((row) => row.bet_decision).slice(0, 10),
  top_rejections: scored.filter((row) => !row.bet_decision).slice(0, 10),
};

fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-shadow-score-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
