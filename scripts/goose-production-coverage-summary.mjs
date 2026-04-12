import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || path.join(process.cwd(), 'logs/goose-audits/latest.json');
if (!fs.existsSync(file)) throw new Error(`Audit file not found: ${file}`);

const audit = JSON.parse(fs.readFileSync(file, 'utf8'));
const totals = audit.totals || {};
const last7 = audit.last_7_days || {};
const health = audit.qualifier_health || {};

function topEntries(obj, limit = 5) {
  return Object.entries(obj || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

const lines = [
  'Goose daily coverage audit',
  `Snapshots: ${totals.market_snapshots || 0}, events: ${totals.market_snapshot_events || 0}, prices: ${totals.market_snapshot_prices || 0}`,
  `Candidates: ${totals.goose_market_candidates || 0}, results: ${totals.goose_market_results || 0}, features: ${totals.goose_feature_rows || 0}`,
  `By sport (candidates, 7d): ${topEntries(last7.goose_candidates_by_sport) || 'none'}`,
  `By market (candidates, 7d): ${topEntries(last7.goose_candidates_by_market) || 'none'}`,
  `By book (candidates, 7d): ${topEntries(last7.goose_candidates_by_book) || 'none'}`,
  `Result integrity (7d): ${topEntries(last7.goose_results_by_integrity) || 'none'}`,
  `Qualifier pending: ${health.pending_count || 0}, stale >24h: ${health.pending_older_than_24h_count || 0}`,
];

if (audit.assessment?.stale_pending_problem) {
  lines.push('Status: attention needed, stale pending rows exist.');
} else if (audit.assessment?.healthy_capture_surface && audit.assessment?.has_recent_settlement_flow) {
  lines.push('Status: rails alive, but archive depth still needs to grow.');
} else {
  lines.push('Status: partial, capture or settlement flow needs attention.');
}

console.log(lines.join('\n'));
