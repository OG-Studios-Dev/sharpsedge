#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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

function run(label, command, args, { verbose = false } = {}) {
  const started = Date.now();
  console.error(`[chain] ${label}...`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });
  const record = {
    label,
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    durationMs: Date.now() - started,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
  if (verbose) {
    if (record.stdout) process.stdout.write(record.stdout);
    if (record.stderr) process.stderr.write(record.stderr);
  }
  console.error(`[chain] ${label}: ${record.ok ? 'ok' : 'failed'} (${Math.round(record.durationMs / 1000)}s)`);
  if (!record.ok && !verbose) {
    const combined = [record.stdout, record.stderr].filter(Boolean).join('\n');
    console.error(combined.split('\n').slice(-40).join('\n'));
  }
  return record;
}

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

const args = parseArgs(process.argv.slice(2));
const start = args.start || '2024-01-01';
const end = args.end || new Date().toISOString().slice(0, 10);
const trainEnd = args.trainEnd || '2025-12-31';
const testStart = args.testStart || '2026-01-01';
const sports = args.sports || 'NBA,NHL,MLB';
const modelVersion = args.modelVersion || `shadow-${end}-cleaned`;
const skipExport = args.skipExport === 'true' || args.skipExport === '1';
const verbose = args.verbose === 'true' || args.verbose === '1';

fs.mkdirSync('tmp', { recursive: true });
const exportPath = args.source || path.join('tmp', `goose-training-examples-chunked-${start}-to-${end}.json`);
const backtestPath = path.join('tmp', `goose-learning-shadow-${modelVersion}.json`);
const auditPath = args.audit || path.join('tmp', 'goose-learning-signal-audit.json');
const gatePath = auditPath.replace(/\.json$/, '-promotion-gate.json');
const reportPath = args.report || path.join('tmp', `goose-daily-shadow-report-${new Date().toISOString().slice(0, 10)}.md`);
const chainPath = args.out || path.join('tmp', `goose-learning-readiness-chain-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const steps = [];
if (!skipExport) {
  steps.push(run('export_training_examples', 'npm', [
    'run', 'goose:export-training-chunked', '--',
    `--start=${start}`,
    `--end=${end}`,
    `--sports=${sports}`,
    `--out=${exportPath}`,
  ], { verbose }));
} else if (!fs.existsSync(exportPath)) {
  const latest = latestTmpArtifact({ prefix: 'goose-training-examples-chunked-' });
  if (!latest) throw new Error(`Missing source artifact and no latest export found: ${exportPath}`);
  fs.copyFileSync(latest, exportPath);
}

steps.push(run('shadow_backtest', 'node', [
  'scripts/goose-learning-shadow-backtest.mjs',
  `--modelVersion=${modelVersion}`,
  `--trainStart=${start}`,
  `--trainEnd=${trainEnd}`,
  `--testStart=${testStart}`,
  `--testEnd=${end}`,
  '--minSample=50',
  '--walkForward=true',
  `--sourceFile=${exportPath}`,
], { verbose }));

steps.push(run('signal_audit', 'npm', [
  'run', 'goose:audit-learning-signals', '--',
  `--backtest=${backtestPath}`,
  `--source=${exportPath}`,
  `--out=${auditPath}`,
], { verbose }));

steps.push(run('promotion_gate', 'npm', [
  'run', 'goose:promotion-gate', '--',
  '--failOnBlock=false',
], { verbose }));

steps.push(run('daily_shadow_report', 'node', [
  'scripts/goose-daily-shadow-report.mjs',
  `--audit=${auditPath}`,
  `--backtest=${backtestPath}`,
  `--gate=${gatePath}`,
  `--out=${reportPath}`,
], { verbose }));

const gateJson = fs.existsSync(gatePath) ? JSON.parse(fs.readFileSync(gatePath, 'utf8')) : null;
const failed = steps.filter((step) => !step.ok);
const chain = {
  ok: failed.length === 0,
  generated_at: new Date().toISOString(),
  inputs: { start, end, trainEnd, testStart, sports, modelVersion, skipExport, verbose },
  artifacts: {
    exportPath,
    backtestPath,
    auditPath,
    gatePath,
    reportPath,
  },
  gateSummary: gateJson?.summary || null,
  steps: steps.map((step) => ({
    label: step.label,
    command: step.command,
    ok: step.ok,
    status: step.status,
    durationMs: step.durationMs,
    stdoutTail: step.stdout.split('\n').slice(-30).join('\n'),
    stderrTail: step.stderr.split('\n').slice(-30).join('\n'),
  })),
};

fs.writeFileSync(chainPath, JSON.stringify(chain, null, 2));
console.log(JSON.stringify({
  ok: chain.ok,
  chainPath,
  artifacts: chain.artifacts,
  gateSummary: chain.gateSummary,
  failedSteps: failed.map((step) => step.label),
}, null, 2));

process.exit(chain.ok ? 0 : 1);
