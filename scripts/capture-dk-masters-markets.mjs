#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const URL = process.argv[2] ?? 'https://sportsbook.draftkings.com/leagues/golf/masters-tournament';

function cleanOdds(value) {
  if (!value) return null;
  const parsed = Number.parseInt(String(value).replace(/−/g, '-').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFinishing(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const results = [];
  for (let i = 0; i < lines.length - 6; i++) {
    if (!lines[i + 2]?.includes('Finishing Position')) continue;
    if (lines[i + 3] !== 'Over') continue;
    if (lines[i + 6] !== 'Under') continue;
    const player = lines[i];
    const overLine = Number.parseFloat(lines[i + 4]);
    const overOdds = cleanOdds(lines[i + 5]);
    const underLine = Number.parseFloat(lines[i + 7]);
    const underOdds = cleanOdds(lines[i + 8]);
    if (!player || !Number.isFinite(overLine) || overOdds == null || !Number.isFinite(underLine) || underOdds == null) continue;
    results.push({ player, line: overLine, over_odds: overOdds, under_line: underLine, under_odds: underOdds });
  }
  return results;
}

function parseMatchups(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const results = [];
  for (let i = 0; i < lines.length - 5; i++) {
    if (!lines[i].includes(' v ')) continue;
    if (!/^Tomorrow\s/.test(lines[i + 1] ?? '')) continue;
    const player1 = lines[i + 2];
    const odds1 = cleanOdds(lines[i + 3]);
    const player2 = lines[i + 4];
    const odds2 = cleanOdds(lines[i + 5]);
    if (!player1 || !player2 || odds1 == null || odds2 == null) continue;
    results.push({ matchup: lines[i], player1, odds1, player2, odds2 });
  }
  return results;
}

async function autoScroll(page, steps = 18, distance = 1400) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance);
    await page.waitForTimeout(700);
  }
}

const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1500, height: 1800 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await autoScroll(page);
await page.waitForTimeout(2000);
const text = await page.locator('body').innerText();
const finishing = parseFinishing(text);
const matchups = parseMatchups(text);
const artifact = {
  scrapedAt: new Date().toISOString(),
  url: URL,
  finishingCount: finishing.length,
  matchupCount: matchups.length,
  finishing,
  matchups,
};
writeFileSync(path.join(OUT_DIR, 'dk-masters-capture-text.txt'), text);
writeFileSync(path.join(OUT_DIR, 'dk-masters-capture.json'), JSON.stringify(artifact, null, 2));
await page.screenshot({ path: path.join(OUT_DIR, 'dk-masters-capture.png'), fullPage: true });
console.log(JSON.stringify({ finishingCount: finishing.length, matchupCount: matchups.length, finishingSample: finishing.slice(0, 3), matchupSample: matchups.slice(0, 3) }, null, 2));
await browser.close();
