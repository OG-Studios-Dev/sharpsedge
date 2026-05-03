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

function latestAuditPath() {
  const dir = 'tmp';
  if (!fs.existsSync(dir)) return 'tmp/goose-learning-signal-audit.json';
  const files = fs.readdirSync(dir)
    .filter((name) => name.startsWith('goose-learning-signal-audit') && name.endsWith('.json'))
    .filter((name) => !name.includes('promotion-gate'))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return {
        filePath,
        mtimeMs: stat.mtimeMs,
        cleanedRank: name.includes('cleaned') ? 1 : 0,
      };
    })
    .sort((a, b) => (b.cleanedRank - a.cleanedRank) || (b.mtimeMs - a.mtimeMs));
  return files[0]?.filePath || 'tmp/goose-learning-signal-audit.json';
}

const auditPath = args.audit || latestAuditPath();
const outPath = args.out || auditPath.replace(/\.json$/, '-promotion-gate.json');
const failOnBlock = args.failOnBlock === 'true' || args.failOnBlock === '1';
const allowProduction = args.allowProduction === 'true' || args.allowProduction === '1';
const maxDuplicateRatio = Number(args.maxDuplicateRatio ?? 0.35);
const maxBookShare = Number(args.maxBookShare ?? 0.7);
const maxTeamShare = Number(args.maxTeamShare ?? 0.15);

if (!fs.existsSync(auditPath)) {
  const artifact = {
    ok: false,
    generated_at: new Date().toISOString(),
    auditPath,
    summary: {
      candidates: 0,
      approved: 0,
      blocked: 0,
      productionPromotionAllowed: false,
      promotionMode: 'none',
    },
    blocker: `Missing learning signal audit artifact: ${auditPath}`,
    next_action: 'Run `npm run goose:audit-learning-signals` after generating/exporting the required shadow backtest and training-example artifacts.',
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ ok: false, outPath, summary: artifact.summary, blocker: artifact.blocker, next_action: artifact.next_action }, null, 2));
  if (failOnBlock) process.exit(1);
  process.exit(0);
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const candidates = Array.isArray(audit.eligible) ? audit.eligible : [];
const hardBlockFlags = new Set([
  'odds_quality_issue',
  'implausible_roi',
  'decision_duplication_over_35pct',
  'book_concentration_over_70pct',
  'team_concentration_over_15pct',
  'weak_monthly_consistency',
  'not_enough_active_months',
  'train_roi_under_1pct',
  'test_roi_under_1pct',
]);

function gateCandidate(candidate) {
  const flags = Array.isArray(candidate.flags) ? candidate.flags : [];
  const blockers = [];
  if (candidate.recommendation !== 'shadow_daily_candidate') blockers.push(`recommendation=${candidate.recommendation}`);
  if (Number(candidate.train_roi) < 0.01) blockers.push('train ROI below 1%');
  if (Number(candidate.test_roi) < 0.01) blockers.push('test ROI below 1%');
  if (Number(candidate.train_win_rate) < 0.52) blockers.push('train win rate below 52%');
  if (Number(candidate.test_win_rate) < 0.52) blockers.push('test win rate below 52%');
  if (Number(candidate.test_events) < 75) blockers.push('fewer than 75 independent test events');
  if (Number(candidate.active_months) < 4) blockers.push('fewer than 4 active months');
  if (Number(candidate.active_months) && Number(candidate.positive_months) / Number(candidate.active_months) < 0.55) blockers.push('weak month consistency');
  if (Number(candidate.duplicate_ratio) > maxDuplicateRatio) blockers.push(`duplicate ratio over ${(maxDuplicateRatio * 100).toFixed(0)}%`);
  if (Number(candidate.max_book_share) > maxBookShare) blockers.push(`book concentration over ${(maxBookShare * 100).toFixed(0)}%`);
  if (Number(candidate.max_team_share) > maxTeamShare) blockers.push(`team concentration over ${(maxTeamShare * 100).toFixed(0)}%`);
  for (const flag of flags) if (hardBlockFlags.has(flag)) blockers.push(`flag:${flag}`);
  return {
    signal_key: candidate.signal_key,
    approved: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    metrics: {
      train_roi: candidate.train_roi,
      test_roi: candidate.test_roi,
      train_win_rate: candidate.train_win_rate,
      test_win_rate: candidate.test_win_rate,
      test_events: candidate.test_events,
      active_months: candidate.active_months,
      positive_months: candidate.positive_months,
      duplicate_ratio: candidate.duplicate_ratio,
      max_book_share: candidate.max_book_share,
      max_team_share: candidate.max_team_share,
    },
  };
}

const gated = candidates.map(gateCandidate);
const approved = gated.filter((row) => row.approved);
const blocked = gated.filter((row) => !row.approved);
const artifact = {
  ok: approved.length > 0,
  generated_at: new Date().toISOString(),
  auditPath,
  summary: {
    candidates: gated.length,
    approved: approved.length,
    blocked: blocked.length,
    technicalGateApproved: approved.length > 0,
    manualApprovalRequired: approved.length > 0,
    productionPromotionAllowed: approved.length > 0 && allowProduction,
    promotionMode: approved.length > 0 ? 'approved_subset_only' : 'none',
  },
  approved,
  blocked,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ ok: artifact.ok, outPath, summary: artifact.summary }, null, 2));
if (!artifact.ok && failOnBlock) process.exit(1);
