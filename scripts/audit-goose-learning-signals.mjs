#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    out[key] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

function latestTmpArtifact({ prefix, includes = [], excludes = [] }) {
  const dir = 'tmp';
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .filter((name) => includes.every((part) => name.includes(part)))
    .filter((name) => excludes.every((part) => !name.includes(part)))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.filePath || null;
}

function defaultBacktestPath() {
  return latestTmpArtifact({ prefix: 'goose-learning-shadow-', includes: ['cleaned'] })
    || latestTmpArtifact({ prefix: 'goose-learning-shadow-' })
    || 'tmp/goose-learning-shadow-shadow-2026-04-29-chunked-full.json';
}

function defaultSourcePath() {
  return latestTmpArtifact({ prefix: 'goose-training-examples-chunked-', includes: ['cleaned'] })
    || latestTmpArtifact({ prefix: 'goose-training-examples-chunked-' })
    || 'tmp/goose-training-examples-chunked-2024-01-01-to-2026-04-29.json';
}

const backtestPath = args.backtest || defaultBacktestPath();
const sourcePath = args.source || defaultSourcePath();
const outPath = args.out || 'tmp/goose-learning-signal-audit.json';
const mdPath = args.md || outPath.replace(/\.json$/, '.md');

const backtest = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const rows = Array.isArray(source.rows) ? source.rows : [];
const eligible = (backtest.candidates || []).filter((candidate) => candidate.promotion_status === 'eligible');
const topRejected = (backtest.candidates || [])
  .filter((candidate) => candidate.rejection_reason)
  .sort((a, b) => Math.abs(Number(b.edge_score || 0)) - Math.abs(Number(a.edge_score || 0)))
  .slice(0, 15);

function oddsBucket(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return 'odds_unknown';
  if (n <= -150) return 'odds_favorite';
  if (n < 0) return 'odds_short_favorite';
  if (n <= 150) return 'odds_short_dog';
  return 'odds_long_dog';
}

function lineBucket(line) {
  const n = Number(line);
  if (!Number.isFinite(n)) return 'no_line';
  const abs = Math.abs(n);
  if (abs < 0.5) return 'line_0';
  if (abs <= 2.5) return 'line_0_to_2_5';
  if (abs <= 5.5) return 'line_3_to_5_5';
  if (abs <= 9.5) return 'line_6_to_9_5';
  return 'line_10_plus';
}

function signalsFor(row) {
  const signals = new Set();
  const sport = row.sport || row.league || 'UNKNOWN';
  const market = row.market_family || 'unknown_market';
  const side = row.side || 'unknown_side';
  signals.add(`${sport}:${market}:${side}`);
  signals.add(`${sport}:${market}:${side}:${oddsBucket(row.odds)}`);
  signals.add(`${sport}:${market}:${side}:${lineBucket(row.line)}`);
  signals.add(`${sport}:${market}:${side}:book:${row.sportsbook || 'unknown_book'}`);
  if (row.is_favorite === true) signals.add(`${sport}:${market}:${side}:favorite`);
  if (row.is_underdog === true) signals.add(`${sport}:${market}:${side}:underdog`);
  if (row.is_home_team_bet === true) signals.add(`${sport}:${market}:${side}:home_bet`);
  if (row.is_away_team_bet === true) signals.add(`${sport}:${market}:${side}:away_bet`);
  if (row.team_above_500_pre_game === true && row.opponent_above_500_pre_game === true) signals.add(`${sport}:${market}:${side}:both_teams_above_500`);
  if (row.is_back_to_back === true) signals.add(`${sport}:${market}:${side}:back_to_back`);
  if (row.is_prime_time === true) signals.add(`${sport}:${market}:${side}:prime_time`);
  if (row.is_divisional_game === true) signals.add(`${sport}:${market}:${side}:divisional`);
  return Array.from(signals);
}

function eventKey(row) {
  return row.canonical_game_id || row.event_id || `${row.league || row.sport || 'UNKNOWN'}:${row.event_date || 'unknown'}:${row.away_team || ''}@${row.home_team || ''}`;
}

function monthKey(date) { return String(date || '').slice(0, 7) || 'unknown'; }
function pct(n, d) { return d ? n / d : 0; }
function round(n, places = 4) { return Number.isFinite(Number(n)) ? Number(Number(n).toFixed(places)) : null; }

function summarizeSignal(candidate) {
  const matched = rows.filter((row) => signalsFor(row).includes(candidate.signal_key));
  const testRows = matched.filter((row) => String(row.event_date || '') >= String(backtest.summary?.testStart || '9999-12-31'));
  const trainRows = matched.filter((row) => String(row.event_date || '') <= String(backtest.summary?.trainEnd || '0000-01-01'));
  const byMonth = new Map();
  const byBook = new Map();
  const byTeam = new Map();
  const odds = [];
  let missingOdds = 0;
  let weirdOdds = 0;
  for (const row of testRows) {
    const month = monthKey(row.event_date);
    const m = byMonth.get(month) || { rows: 0, wins: 0, losses: 0, pushes: 0, units: 0 };
    m.rows += 1;
    if (row.result === 'win') m.wins += 1;
    else if (row.result === 'loss') m.losses += 1;
    else m.pushes += 1;
    m.units += Number(row.profit_units || 0);
    byMonth.set(month, m);
    const book = row.sportsbook || 'unknown_book';
    byBook.set(book, (byBook.get(book) || 0) + 1);
    const team = row.team_name || 'unknown_team';
    byTeam.set(team, (byTeam.get(team) || 0) + 1);
    const odd = Number(row.odds);
    if (!Number.isFinite(odd)) missingOdds += 1;
    else {
      odds.push(odd);
      if (Math.abs(odd) > 2000 || odd === 0) weirdOdds += 1;
    }
  }
  const months = Array.from(byMonth.entries()).map(([month, stat]) => ({
    month,
    rows: stat.rows,
    winRate: round(pct(stat.wins, stat.wins + stat.losses)),
    roi: round(pct(stat.units, stat.rows)),
    units: round(stat.units),
  })).sort((a, b) => a.month.localeCompare(b.month));
  const positiveMonths = months.filter((m) => Number(m.roi) > 0).length;
  const activeMonths = months.filter((m) => m.rows >= 10).length;
  const bookEntries = Array.from(byBook.entries()).sort((a, b) => b[1] - a[1]);
  const teamEntries = Array.from(byTeam.entries()).sort((a, b) => b[1] - a[1]);
  const testEvents = new Set(testRows.map(eventKey));
  const trainEvents = new Set(trainRows.map(eventKey));
  const duplicateRatio = 1 - pct(testEvents.size, testRows.length);
  const maxBookShare = pct(bookEntries[0]?.[1] || 0, testRows.length);
  const maxTeamShare = pct(teamEntries[0]?.[1] || 0, testRows.length);
  const flags = [];
  if (candidate.test_roi < 0.01) flags.push('test_roi_under_1pct');
  if (candidate.train_roi < 0.01) flags.push('train_roi_under_1pct');
  if (activeMonths < 4) flags.push('not_enough_active_months');
  if (activeMonths && positiveMonths / activeMonths < 0.55) flags.push('weak_monthly_consistency');
  if (maxBookShare > 0.7) flags.push('book_concentration_over_70pct');
  if (maxTeamShare > 0.15) flags.push('team_concentration_over_15pct');
  if (duplicateRatio > 0.35) flags.push('decision_duplication_over_35pct');
  if (missingOdds > 0 || weirdOdds > 0) flags.push('odds_quality_issue');
  if (Math.abs(candidate.test_roi) > 0.18 || Math.abs(candidate.train_roi) > 0.18) flags.push('implausible_roi');
  const recommendation = flags.length === 0 ? 'shadow_daily_candidate' : flags.includes('implausible_roi') || flags.includes('odds_quality_issue') ? 'reject_until_data_repaired' : 'keep_shadow_only';
  return {
    signal_key: candidate.signal_key,
    sport: candidate.sport,
    market_family: candidate.market_family,
    side: candidate.side,
    train_sample: candidate.sample,
    test_sample: candidate.test_sample,
    train_roi: round(candidate.train_roi),
    test_roi: round(candidate.test_roi),
    train_win_rate: round(candidate.train_win_rate),
    test_win_rate: round(candidate.test_win_rate),
    test_events: testEvents.size,
    active_months: activeMonths,
    positive_months: positiveMonths,
    max_book_share: round(maxBookShare),
    top_books: bookEntries.slice(0, 5).map(([book, count]) => ({ book, count })),
    max_team_share: round(maxTeamShare),
    top_teams: teamEntries.slice(0, 5).map(([team, count]) => ({ team, count })),
    duplicate_ratio: round(duplicateRatio),
    odds: {
      rows: odds.length,
      missingOdds,
      weirdOdds,
      min: odds.length ? Math.min(...odds) : null,
      max: odds.length ? Math.max(...odds) : null,
    },
    months,
    flags,
    recommendation,
  };
}

const auditedEligible = eligible.map(summarizeSignal);
const auditedRejected = topRejected.map((candidate) => ({
  signal_key: candidate.signal_key,
  sport: candidate.sport,
  market_family: candidate.market_family,
  side: candidate.side,
  train_sample: candidate.sample,
  test_sample: candidate.test_sample,
  train_roi: round(candidate.train_roi),
  test_roi: round(candidate.test_roi),
  train_win_rate: round(candidate.train_win_rate),
  test_win_rate: round(candidate.test_win_rate),
  rejection_reason: candidate.rejection_reason,
}));

const artifact = {
  ok: true,
  generated_at: new Date().toISOString(),
  backtestPath,
  sourcePath,
  summary: {
    total_candidates: (backtest.candidates || []).length,
    eligible_candidates: eligible.length,
    eligible_shadow_daily_candidates: auditedEligible.filter((s) => s.recommendation === 'shadow_daily_candidate').length,
    eligible_keep_shadow_only: auditedEligible.filter((s) => s.recommendation === 'keep_shadow_only').length,
    eligible_reject_until_data_repaired: auditedEligible.filter((s) => s.recommendation === 'reject_until_data_repaired').length,
  },
  eligible: auditedEligible,
  rejected_high_risk_top: auditedRejected,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));

const lines = [];
lines.push(`# Goose Learning Signal Audit`);
lines.push('');
lines.push(`Generated: ${artifact.generated_at}`);
lines.push('');
lines.push(`- Candidates audited: ${artifact.summary.total_candidates}`);
lines.push(`- Eligible from model: ${artifact.summary.eligible_candidates}`);
lines.push(`- Shadow-daily candidates after QA: ${artifact.summary.eligible_shadow_daily_candidates}`);
lines.push(`- Keep shadow-only: ${artifact.summary.eligible_keep_shadow_only}`);
lines.push(`- Reject until data repaired: ${artifact.summary.eligible_reject_until_data_repaired}`);
lines.push('');
lines.push(`## Eligible signal QA`);
for (const s of auditedEligible) {
  lines.push(`- ${s.signal_key}: ${s.recommendation}; test ROI ${(s.test_roi * 100).toFixed(2)}%, WR ${(s.test_win_rate * 100).toFixed(2)}%, events ${s.test_events}, active months ${s.active_months}, flags ${s.flags.length ? s.flags.join(', ') : 'none'}`);
}
lines.push('');
lines.push(`## High-risk rejected signals`);
for (const s of auditedRejected.slice(0, 10)) {
  lines.push(`- ${s.signal_key}: rejected; test ROI ${(s.test_roi * 100).toFixed(2)}%, reason: ${s.rejection_reason}`);
}
fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);

console.log(JSON.stringify({ ok: true, outPath, mdPath, summary: artifact.summary }, null, 2));
