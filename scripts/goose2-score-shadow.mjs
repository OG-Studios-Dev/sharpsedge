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
const MODEL_VERSION = args.modelVersion || process.env.GOOSE_SHADOW_MODEL_VERSION || 'shadow-2026-04-25-v2-strict';
const POLICY_VERSION = 'phase2-shadow-selective';
const HIGH_CONFIDENCE_MIN = 0.60;
const MIN_EDGE = 0.035;
const MAX_PLAYS_PER_SPORT = 3;
const EXCLUDE_IMPLAUSIBLE_LINES = args.excludeImplausibleLines !== 'false';
const ALLOWED_MARKETS = new Set(['moneyline', 'spread', 'total', 'first_five_total', 'first_five_side']);

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

const targetDate = args.date || args.positional[0] || new Date().toISOString().slice(0, 10);
const select = [
  'candidate_id,event_id,sport,league,event_date,market_type,participant_name,opponent_name,side,line,odds,book,capture_ts,is_best_price,is_opening,is_closing',
  'goose_feature_rows!inner(feature_row_id,feature_version,feature_payload,system_flags,generated_ts)',
  'goose_market_events!inner(commence_time,status,home_team,away_team)',
  'goose_decision_log!left(decision_id,policy_version,decision_ts)'
].join(',');
const rows = await rest(`/goose_market_candidates?select=${encodeURIComponent(select)}&event_date=eq.${targetDate}&order=capture_ts.desc&limit=5000`);

const latestByCandidate = new Map();
for (const row of rows) {
  const decisions = Array.isArray(row.goose_decision_log) ? row.goose_decision_log : [];
  if (decisions.some((d) => d.policy_version === POLICY_VERSION)) continue;
  const existing = latestByCandidate.get(row.candidate_id);
  if (!existing || String(row.capture_ts) > String(existing.capture_ts)) latestByCandidate.set(row.candidate_id, row);
}

const scored = [];
for (const row of latestByCandidate.values()) {
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
  const edge = calibrated - implied;
  const confidenceBand = calibrated >= 0.67 ? 'A' : calibrated >= 0.60 ? 'B' : calibrated >= 0.55 ? 'C' : 'D';
  const rejectionReasons = [];
  const candidateLineHealth = lineHealth(row);
  if (qualifierCount < 1) rejectionReasons.push('no_linked_system_qualifier');
  if (calibrated < HIGH_CONFIDENCE_MIN) rejectionReasons.push('below_confidence_floor');
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
    qualifier_count: qualifierCount,
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
    min_confidence: HIGH_CONFIDENCE_MIN,
    min_edge: MIN_EDGE,
    qualifier_count: row.qualifier_count,
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
  signal_keys: [
    `${row.sport}:${row.market_type}:${normalizeToken(row.side)}`,
    `${row.sport}:${row.market_type}:book:${normalizeToken(row.book)}`,
  ],
  model_score: Number(row.calibrated_p_true.toFixed(6)),
  confidence_score: Number(Math.max(0, Math.min(1, row.edge / 0.2)).toFixed(6)),
  evidence_snapshot: {
    source: 'goose2-score-shadow',
    policy_version: POLICY_VERSION,
    confidence_band: row.confidence_band,
    edge: Number(row.edge.toFixed(6)),
    p_true: Number(row.p_true.toFixed(6)),
    calibrated_p_true: Number(row.calibrated_p_true.toFixed(6)),
    implied_prob: Number(row.implied_prob.toFixed(6)),
    qualifier_count: row.qualifier_count,
    line_health: row.line_health,
  },
  status: 'recorded',
  result: 'pending',
}));

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
    high_confidence_min: HIGH_CONFIDENCE_MIN,
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
