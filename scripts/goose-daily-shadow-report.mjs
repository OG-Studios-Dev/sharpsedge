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
function pct(n) { return Number.isFinite(Number(n)) ? `${(Number(n) * 100).toFixed(2)}%` : 'n/a'; }

const args = parseArgs(process.argv.slice(2));
const auditPath = args.audit || 'tmp/goose-learning-signal-audit.json';
const backtestPath = args.backtest || 'tmp/goose-learning-shadow-shadow-2026-04-29-cleaned.json';
const gatePath = args.gate || auditPath.replace(/\.json$/, '-promotion-gate.json');
const outPath = args.out || `tmp/goose-daily-shadow-report-${new Date().toISOString().slice(0, 10)}.md`;

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const backtest = fs.existsSync(backtestPath) ? JSON.parse(fs.readFileSync(backtestPath, 'utf8')) : null;
const gate = fs.existsSync(gatePath) ? JSON.parse(fs.readFileSync(gatePath, 'utf8')) : null;
const eligible = Array.isArray(audit.eligible) ? audit.eligible : [];
const keep = eligible.filter((s) => s.recommendation === 'keep_shadow_only');
const rejected = eligible.filter((s) => s.recommendation === 'reject_until_data_repaired');
const daily = eligible.filter((s) => s.recommendation === 'shadow_daily_candidate');

const lines = [];
lines.push('# Goose Daily Shadow Report');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Readiness');
lines.push(`- Production promotion allowed: ${gate?.summary?.productionPromotionAllowed ? 'YES' : 'NO'}`);
lines.push(`- Shadow-daily candidates: ${daily.length}`);
lines.push(`- Keep shadow-only: ${keep.length}`);
lines.push(`- Rejected until data repair: ${rejected.length}`);
if (backtest?.summary) {
  lines.push(`- Training rows used: ${backtest.summary.trainExamples?.toLocaleString?.() ?? backtest.summary.trainExamples}`);
  lines.push(`- Test rows used: ${backtest.summary.testExamples?.toLocaleString?.() ?? backtest.summary.testExamples}`);
  lines.push(`- Excluded implausible train lines: ${backtest.summary.excludedImplausibleTrainLines?.toLocaleString?.() ?? backtest.summary.excludedImplausibleTrainLines}`);
  lines.push(`- Excluded implausible test lines: ${backtest.summary.excludedImplausibleTestLines?.toLocaleString?.() ?? backtest.summary.excludedImplausibleTestLines}`);
}
lines.push('');
lines.push('## Shadow-only watchlist');
for (const s of keep.slice(0, 10)) {
  lines.push(`- ${s.signal_key}: test ROI ${pct(s.test_roi)}, WR ${pct(s.test_win_rate)}, events ${s.test_events}; blockers: ${s.flags?.join(', ') || 'none'}`);
}
if (!keep.length) lines.push('- None.');
lines.push('');
lines.push('## Data repair rejects');
for (const s of rejected.slice(0, 10)) {
  lines.push(`- ${s.signal_key}: test ROI ${pct(s.test_roi)}, WR ${pct(s.test_win_rate)}, flags: ${s.flags?.join(', ') || 'none'}`);
}
if (!rejected.length) lines.push('- None.');
lines.push('');
lines.push('## Rule');
lines.push('No production picks are promoted from this report. Promotion requires a clean gate artifact with zero blockers and explicit manual approval.');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(JSON.stringify({ ok: true, outPath, shadowDaily: daily.length, keepShadowOnly: keep.length, rejectedUntilRepair: rejected.length, promotionAllowed: Boolean(gate?.summary?.productionPromotionAllowed) }, null, 2));
