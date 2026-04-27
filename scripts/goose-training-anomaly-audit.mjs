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

const start = args.start || '2024-01-01';
const end = args.end || '2026-12-31';
const maxRows = Number(args.maxRows || 200000);
const top = Number(args.top || 25);
const failOnCritical = args.failOnCritical === 'true' || args.failOnCritical === '1';
const minDeepDiveRows = Number(args.minDeepDiveRows || 75);
const chunkMode = args.chunk || 'month';

function assertDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
}
assertDate(start, 'start');
assertDate(end, 'end');

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

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function nextMonthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function buildDateChunks(startDate, endDate) {
  if (chunkMode === 'none') return [{ start: startDate, end: endDate }];
  if (chunkMode !== 'month') throw new Error('--chunk must be month or none');

  const chunks = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const final = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= final) {
    const monthEnd = addDays(nextMonthStart(cursor), -1);
    const chunkEnd = monthEnd < final ? monthEnd : final;
    chunks.push({ start: dateOnly(cursor), end: dateOnly(chunkEnd) });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}

async function fetchExamplesForWindow(windowStart, windowEnd, remainingRows) {
  const out = [];
  let offset = 0;
  const pageSize = 1000;
  while (out.length < remainingRows) {
    const q = new URLSearchParams({
      select: 'example_id,candidate_id,canonical_game_id,event_id,sport,league,event_date,home_team,away_team,team_name,opponent_name,team_role,market_family,market_type,side,line,odds,sportsbook,result,profit_units',
      event_date: `gte.${windowStart}`,
      order: 'event_date.asc',
      limit: String(Math.min(pageSize, remainingRows - out.length)),
      offset: String(offset),
    });
    q.append('event_date', `lte.${windowEnd}`);
    const page = await rest(`/rest/v1/goose_training_examples_v1?${q.toString()}`);
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function fetchExamples() {
  const out = [];
  const chunks = buildDateChunks(start, end);
  for (const chunk of chunks) {
    if (out.length >= maxRows) break;
    const remainingRows = maxRows - out.length;
    const page = await fetchExamplesForWindow(chunk.start, chunk.end, remainingRows);
    out.push(...page);
    console.error(JSON.stringify({ progress: 'training_anomaly_fetch', chunk, rows: page.length, totalRows: out.length, maxRows }));
  }
  return out;
}

function pct(n, d) {
  return d ? Number((n / d).toFixed(6)) : 0;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const stat = map.get(key) || { key, rows: 0, wins: 0, losses: 0, pushes: 0, units: 0 };
    stat.rows += 1;
    if (row.result === 'win') stat.wins += 1;
    else if (row.result === 'loss') stat.losses += 1;
    else stat.pushes += 1;
    stat.units += Number(row.profit_units || 0);
    map.set(key, stat);
  }
  return Array.from(map.values()).map((stat) => ({
    ...stat,
    winRate: pct(stat.wins, stat.wins + stat.losses),
    roiPerExample: pct(stat.units, stat.rows),
  }));
}

function groupRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = map.get(key) || [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function normalizeTeam(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function matchupKey(row) {
  return [
    row.sport || row.league || 'UNKNOWN',
    row.event_date || 'unknown_date',
    normalizeTeam(row.away_team),
    normalizeTeam(row.home_team),
  ].join('|');
}

function americanProfit(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

function avg(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function quantile(values, q) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const idx = Math.min(clean.length - 1, Math.max(0, Math.floor((clean.length - 1) * q)));
  return clean[idx];
}

function topCounts(values, limit = 10) {
  const counts = new Map();
  for (const value of values) counts.set(String(value ?? 'null'), (counts.get(String(value ?? 'null')) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count }));
}

function lineHealth(row) {
  const sport = row.sport || row.league || 'UNKNOWN';
  const market = row.market_family || 'unknown_market';
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
      if (line < 3) return 'implausibly_low_full_game_total';
      if (line > 20) return 'implausibly_high_full_game_total';
      return 'plausible_full_game_total';
    }
    if (sport === 'NHL') {
      if (line < 3) return 'implausibly_low_full_game_total';
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

function summarizeRows(bucketRows) {
  const settled = bucketRows.filter((row) => row.result === 'win' || row.result === 'loss');
  const wins = bucketRows.filter((row) => row.result === 'win');
  const losses = bucketRows.filter((row) => row.result === 'loss');
  const units = bucketRows.reduce((sum, row) => sum + Number(row.profit_units || 0), 0);
  const lines = bucketRows.map((row) => row.line).filter((value) => value != null).map(Number).filter(Number.isFinite);
  const healthCounts = topCounts(bucketRows.map(lineHealth), 12);
  const implausibleLineRows = bucketRows.filter((row) => String(lineHealth(row)).startsWith('implausibly_')).length;
  const byEventBook = groupRows(bucketRows, (row) => [eventKeyForRow(row), row.sportsbook || 'unknown_book'].join('|'));
  const uniqueLinesPerEventBook = Array.from(byEventBook.values()).map((rowsForEventBook) => new Set(rowsForEventBook.map((row) => row.line == null ? 'no_line' : Number(row.line).toFixed(2))).size);
  const fragmentedMatchups = Array.from(groupRows(bucketRows, matchupKey).entries()).map(([key, rowsForMatchup]) => {
    const eventIds = new Set(rowsForMatchup.map((row) => row.canonical_game_id || row.event_id).filter(Boolean));
    return { key, rows: rowsForMatchup.length, eventIds: eventIds.size };
  }).filter((row) => row.eventIds > 1).sort((a, b) => b.eventIds - a.eventIds || b.rows - a.rows);
  const sideStats = groupBy(bucketRows, (row) => row.side || 'unknown_side').sort((a, b) => b.rows - a.rows);
  const bookStats = groupBy(bucketRows, (row) => row.sportsbook || 'unknown_book').sort((a, b) => Math.abs(b.roiPerExample) - Math.abs(a.roiPerExample));

  return {
    rows: bucketRows.length,
    wins: wins.length,
    losses: losses.length,
    pushes: bucketRows.length - wins.length - losses.length,
    winRate: pct(wins.length, settled.length),
    units: Number(units.toFixed(6)),
    roiPerExample: pct(units, bucketRows.length),
    avgOdds: avg(bucketRows.map((row) => row.odds)),
    avgWinOdds: avg(wins.map((row) => row.odds)),
    avgLossOdds: avg(losses.map((row) => row.odds)),
    avgWinPayout: avg(wins.map((row) => americanProfit(row.odds))),
    line: {
      min: lines.length ? Math.min(...lines) : null,
      p25: quantile(lines, 0.25),
      median: quantile(lines, 0.5),
      p75: quantile(lines, 0.75),
      max: lines.length ? Math.max(...lines) : null,
      healthCounts,
      implausibleLineRows,
      implausibleLineShare: pct(implausibleLineRows, bucketRows.length),
      topLines: topCounts(lines, 12),
      medianUniqueLinesPerEventBook: quantile(uniqueLinesPerEventBook, 0.5),
      p90UniqueLinesPerEventBook: quantile(uniqueLinesPerEventBook, 0.9),
    },
    eventIdentity: {
      fragmentedMatchupCount: fragmentedMatchups.length,
      topFragmentedMatchups: fragmentedMatchups.slice(0, 8),
    },
    sideStats: sideStats.slice(0, 8),
    bookStats: bookStats.slice(0, 8),
    sampleRows: bucketRows.slice(0, 8).map((row) => ({
      example_id: row.example_id,
      candidate_id: row.candidate_id,
      event: row.canonical_game_id || row.event_id,
      event_date: row.event_date,
      matchup: `${row.away_team || '?'} @ ${row.home_team || '?'}`,
      market_family: row.market_family,
      market_type: row.market_type,
      side: row.side,
      line: row.line,
      odds: row.odds,
      sportsbook: row.sportsbook,
      result: row.result,
      profit_units: row.profit_units,
      line_health: lineHealth(row),
    })),
  };
}

function diagnoseBucket(bucketRows, stat) {
  const diagnostics = summarizeRows(bucketRows);
  const hypotheses = [];
  if (diagnostics.line.implausibleLineShare >= 0.2) {
    hypotheses.push({
      code: 'market_line_contamination',
      confidence: diagnostics.line.implausibleLineShare >= 0.5 ? 'high' : 'medium',
      explanation: 'A large share of rows have lines outside the expected full-game range for this sport/market. This usually means quarter, team-total, period, or alternate markets are being grouped into a broad market bucket.',
      evidence: {
        implausibleLineRows: diagnostics.line.implausibleLineRows,
        implausibleLineShare: diagnostics.line.implausibleLineShare,
        healthCounts: diagnostics.line.healthCounts,
        topLines: diagnostics.line.topLines,
      },
    });
  }
  if ((diagnostics.line.p90UniqueLinesPerEventBook || 0) >= 6) {
    hypotheses.push({
      code: 'alternate_line_ladder_overweight',
      confidence: (diagnostics.line.p90UniqueLinesPerEventBook || 0) >= 10 ? 'high' : 'medium',
      explanation: 'Many different lines exist for the same event/book. Treating every alternate line as an independent training example can make easy alt lines dominate ROI.',
      evidence: {
        medianUniqueLinesPerEventBook: diagnostics.line.medianUniqueLinesPerEventBook,
        p90UniqueLinesPerEventBook: diagnostics.line.p90UniqueLinesPerEventBook,
      },
    });
  }
  if (diagnostics.eventIdentity.fragmentedMatchupCount > 0) {
    hypotheses.push({
      code: 'event_identity_fragmentation',
      confidence: diagnostics.eventIdentity.fragmentedMatchupCount >= 5 ? 'high' : 'medium',
      explanation: 'The same date/team matchup appears under multiple event IDs. That can duplicate one real game into multiple “independent” examples and inflate confidence.',
      evidence: diagnostics.eventIdentity,
    });
  }
  if (diagnostics.avgWinPayout != null && diagnostics.avgWinPayout > 1.2 && diagnostics.winRate < 0.45 && diagnostics.roiPerExample > 0.1) {
    hypotheses.push({
      code: 'longshot_payout_asymmetry',
      confidence: 'medium',
      explanation: 'ROI is being driven by long-shot payouts despite a low hit rate. This can be valid only after source/closing-line/settlement checks; otherwise it is often odds-source or selection bias.',
      evidence: { avgWinOdds: diagnostics.avgWinOdds, avgWinPayout: diagnostics.avgWinPayout, winRate: diagnostics.winRate, roiPerExample: diagnostics.roiPerExample },
    });
  }
  if (Math.abs(stat.roiPerExample || diagnostics.roiPerExample) > 0.18 && diagnostics.winRate > 0.45 && diagnostics.winRate < 0.55 && Math.abs((diagnostics.avgWinPayout || 0.9) - 0.9) > 0.3) {
    hypotheses.push({
      code: 'odds_payout_distribution',
      confidence: 'medium',
      explanation: 'Win rate is near coin-flip but ROI is extreme, so the issue is probably odds/payout distribution rather than directional prediction skill.',
      evidence: { avgOdds: diagnostics.avgOdds, avgWinOdds: diagnostics.avgWinOdds, avgLossOdds: diagnostics.avgLossOdds, avgWinPayout: diagnostics.avgWinPayout },
    });
  }
  if (!hypotheses.length) {
    hypotheses.push({
      code: 'needs_manual_source_review',
      confidence: 'low',
      explanation: 'The bucket is statistically suspicious, but this audit did not find a single dominant mechanical cause. Review source odds, market taxonomy, and settlement joins manually.',
      evidence: { winRate: diagnostics.winRate, roiPerExample: diagnostics.roiPerExample, rows: diagnostics.rows },
    });
  }
  return { ...stat, diagnostics, hypotheses };
}

function decisionKey(row) {
  const eventKey = row.canonical_game_id || row.event_id || `${row.league || row.sport || 'UNKNOWN'}:${row.event_date || 'unknown'}:${row.away_team || ''}@${row.home_team || ''}`;
  return [
    eventKey,
    row.market_family || 'unknown_market',
    row.market_type || '',
    row.side || 'unknown_side',
    row.team_name || '',
    row.opponent_name || '',
    row.team_role || '',
    row.line == null ? 'no_line' : Number(row.line).toFixed(2),
  ].join('|');
}

function eventKeyForRow(row) {
  return row.canonical_game_id || row.event_id || `${row.league || row.sport || 'UNKNOWN'}:${row.event_date || 'unknown'}:${row.away_team || ''}@${row.home_team || ''}`;
}

function addIssue(issues, severity, code, message, evidence = {}) {
  issues.push({ severity, code, message, evidence });
}

const rows = await fetchExamples();
const issues = [];
const byDecision = groupBy(rows, decisionKey).sort((a, b) => b.rows - a.rows);
const duplicateDecisionRows = byDecision.filter((row) => row.rows > 1).reduce((sum, row) => sum + row.rows - 1, 0);
const duplicateDecisionShare = pct(duplicateDecisionRows, rows.length);
if (duplicateDecisionShare > 0.2) {
  addIssue(issues, 'critical', 'duplicate_decision_rows', 'More than 20% of training examples are duplicate event-level betting decisions, likely multi-book/time artifacts.', { duplicateDecisionRows, duplicateDecisionShare, topDuplicateDecisions: byDecision.filter((row) => row.rows > 1).slice(0, 10) });
} else if (duplicateDecisionShare > 0.05) {
  addIssue(issues, 'warning', 'duplicate_decision_rows', 'Training examples include material duplicate event-level betting decisions.', { duplicateDecisionRows, duplicateDecisionShare, topDuplicateDecisions: byDecision.filter((row) => row.rows > 1).slice(0, 10) });
}

const missing = {
  odds: rows.filter((row) => row.odds == null).length,
  line: rows.filter((row) => row.market_family !== 'moneyline' && row.line == null).length,
  eventKey: rows.filter((row) => !row.canonical_game_id && !row.event_id).length,
  sportsbook: rows.filter((row) => !row.sportsbook).length,
};
for (const [field, count] of Object.entries(missing)) {
  if (pct(count, rows.length) > 0.05) addIssue(issues, 'warning', `missing_${field}`, `More than 5% of examples have missing ${field}.`, { count, share: pct(count, rows.length) });
}

const byMarket = groupBy(rows, (row) => `${row.sport || row.league || 'UNKNOWN'}:${row.market_family || 'unknown_market'}`).sort((a, b) => b.rows - a.rows);
for (const stat of byMarket.filter((row) => row.rows >= 200)) {
  if (Math.abs(stat.roiPerExample) > 0.18 || stat.winRate > 0.68 || stat.winRate < 0.32) {
    addIssue(issues, 'critical', 'market_distribution_artifact', 'A broad market bucket has implausible ROI/win-rate and should not be trusted for promotion without source audit.', stat);
  }
}

const byBook = groupBy(rows, (row) => `${row.sport || row.league || 'UNKNOWN'}:${row.market_family || 'unknown_market'}:${row.sportsbook || 'unknown_book'}`).sort((a, b) => Math.abs(b.roiPerExample) - Math.abs(a.roiPerExample));
for (const stat of byBook.filter((row) => row.rows >= 100).slice(0, top)) {
  if (Math.abs(stat.roiPerExample) > 0.25 || stat.winRate > 0.72 || stat.winRate < 0.28) {
    addIssue(issues, 'warning', 'book_specific_artifact', 'A sportsbook-specific bucket looks too good/bad and may be a source or selection artifact.', stat);
  }
}

const deepDiveSpecs = [
  {
    dimension: 'sport_market_side',
    keyFn: (row) => `${row.sport || row.league || 'UNKNOWN'}:${row.market_family || 'unknown_market'}:${row.side || 'unknown_side'}`,
  },
  {
    dimension: 'sport_market_side_book',
    keyFn: (row) => `${row.sport || row.league || 'UNKNOWN'}:${row.market_family || 'unknown_market'}:${row.side || 'unknown_side'}:book:${row.sportsbook || 'unknown_book'}`,
  },
  {
    dimension: 'sport_market_side_line_health',
    keyFn: (row) => `${row.sport || row.league || 'UNKNOWN'}:${row.market_family || 'unknown_market'}:${row.side || 'unknown_side'}:line_health:${lineHealth(row)}`,
  },
];

const deepDives = [];
for (const spec of deepDiveSpecs) {
  const grouped = groupRows(rows, spec.keyFn);
  for (const [key, bucketRows] of grouped.entries()) {
    if (bucketRows.length < minDeepDiveRows) continue;
    const [stat] = groupBy(bucketRows, () => key);
    const suspicious = Math.abs(stat.roiPerExample) > 0.18 || stat.winRate > 0.68 || stat.winRate < 0.32;
    if (!suspicious) continue;
    deepDives.push({
      dimension: spec.dimension,
      ...diagnoseBucket(bucketRows, stat),
      suspicionScore: Number((Math.abs(stat.roiPerExample) + Math.abs(stat.winRate - 0.5)).toFixed(6)),
    });
  }
}

deepDives.sort((a, b) => b.suspicionScore - a.suspicionScore || b.rows - a.rows);

if (deepDives.some((dive) => dive.hypotheses.some((hypothesis) => hypothesis.code === 'market_line_contamination'))) {
  addIssue(
    issues,
    'critical',
    'market_line_contamination',
    'Deep ROI audit found sport/market/side buckets where implausible full-game line ranges explain suspicious ROI. These rows should be excluded or remapped before any signal promotion.',
    { affectedBuckets: deepDives.filter((dive) => dive.hypotheses.some((hypothesis) => hypothesis.code === 'market_line_contamination')).slice(0, top).map((dive) => ({ dimension: dive.dimension, key: dive.key, rows: dive.rows, winRate: dive.winRate, roiPerExample: dive.roiPerExample, topHypotheses: dive.hypotheses.slice(0, 3) })) },
  );
}

if (deepDives.some((dive) => dive.hypotheses.some((hypothesis) => hypothesis.code === 'event_identity_fragmentation'))) {
  addIssue(
    issues,
    'warning',
    'event_identity_fragmentation',
    'Deep ROI audit found same-day matchups split across multiple event IDs. This can inflate apparent independent sample size.',
    { affectedBuckets: deepDives.filter((dive) => dive.hypotheses.some((hypothesis) => hypothesis.code === 'event_identity_fragmentation')).slice(0, top).map((dive) => ({ dimension: dive.dimension, key: dive.key, rows: dive.rows, winRate: dive.winRate, roiPerExample: dive.roiPerExample, eventIdentity: dive.diagnostics.eventIdentity })) },
  );
}

const summary = {
  start,
  end,
  maxRows,
  examples: rows.length,
  uniqueEventLevelDecisions: byDecision.length,
  duplicateDecisionRows,
  duplicateDecisionShare,
  missing,
  issueCounts: issues.reduce((acc, issue) => ({ ...acc, [issue.severity]: (acc[issue.severity] || 0) + 1 }), {}),
  deepDiveDimensions: deepDiveSpecs.map((spec) => spec.dimension),
  suspiciousDeepDiveBuckets: deepDives.length,
  topMarkets: byMarket.slice(0, top),
  topDeepDives: deepDives.slice(0, top).map((dive) => ({
    dimension: dive.dimension,
    key: dive.key,
    rows: dive.rows,
    winRate: dive.winRate,
    roiPerExample: dive.roiPerExample,
    hypotheses: dive.hypotheses.slice(0, 4),
  })),
  topDuplicateDecisions: byDecision.filter((row) => row.rows > 1).slice(0, top),
};

fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
const outPath = path.join(process.cwd(), 'tmp', `goose-training-anomaly-audit-${start}-to-${end}.json`);
fs.writeFileSync(outPath, JSON.stringify({ summary, issues, deepDives: deepDives.slice(0, Math.max(top, 100)) }, null, 2));

const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
console.log(JSON.stringify({ ok: !failOnCritical || criticalCount === 0, outPath, summary, issues: issues.slice(0, top), deepDives: deepDives.slice(0, top) }, null, 2));
if (failOnCritical && criticalCount > 0) process.exit(2);
