#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const start = process.argv[2];
const end = process.argv[3];
const league = (process.argv[4] || 'NHL').toUpperCase();

if (!start || !end) throw new Error('Usage: node scripts/enrich-historical-league-ids.mjs <YYYY-MM-DD> <YYYY-MM-DD> <LEAGUE>');
if (league !== 'NHL') throw new Error('Only NHL wired so far');

function* datesBetween(startDate, endDate) {
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= last) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

const results = [];
for (const date of datesBetween(start, end)) {
  const raw = execFileSync(process.execPath, ['scripts/backfill-goose2-nhl-game-ids.mjs', date], { encoding: 'utf8' });
  results.push(JSON.parse(raw));
}

console.log(JSON.stringify({ ok: true, league, start, end, updated: results.reduce((sum, row) => sum + (row.updated || 0), 0), days: results }, null, 2));
