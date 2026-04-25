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

async function fetchExamples() {
  const out = [];
  let offset = 0;
  const pageSize = 1000;
  while (out.length < maxRows) {
    const q = new URLSearchParams({
      select: 'example_id,candidate_id,canonical_game_id,event_id,sport,league,event_date,home_team,away_team,team_name,opponent_name,team_role,market_family,market_type,side,line,odds,sportsbook,result,profit_units',
      event_date: `gte.${start}`,
      order: 'event_date.asc',
      limit: String(Math.min(pageSize, maxRows - out.length)),
      offset: String(offset),
    });
    q.append('event_date', `lte.${end}`);
    const page = await rest(`/rest/v1/goose_training_examples_v1?${q.toString()}`);
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
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
  topMarkets: byMarket.slice(0, top),
  topDuplicateDecisions: byDecision.filter((row) => row.rows > 1).slice(0, top),
};

fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
const outPath = path.join(process.cwd(), 'tmp', `goose-training-anomaly-audit-${start}-to-${end}.json`);
fs.writeFileSync(outPath, JSON.stringify({ summary, issues }, null, 2));

const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
console.log(JSON.stringify({ ok: !failOnCritical || criticalCount === 0, outPath, summary, issues: issues.slice(0, top) }, null, 2));
if (failOnCritical && criticalCount > 0) process.exit(2);
