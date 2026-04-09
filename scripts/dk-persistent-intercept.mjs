#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out', 'dk-persistent');
const PROFILE_DIR = path.join(ROOT, '.playwright-dk-profile');
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE_DIR, { recursive: true });

const START_URL = process.argv[2] ?? 'https://sportsbook.draftkings.com/leagues/golf/masters-tournament';
const holdMs = Number(process.argv[3] ?? 90000);

const captures = [];

function isInteresting(url) {
  const value = url.toLowerCase();
  return [
    'draftkings.com',
    'sportsbook-nash',
    'eventgroups',
    'sportscontent',
    'navigation',
    'markets',
    'leagues/golf',
    'masters',
    'subcategory',
    'categories',
  ].some((needle) => value.includes(needle));
}

function safeFileName(index, ext) {
  return `capture-${String(index).padStart(3, '0')}.${ext}`;
}

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  args: ['--no-sandbox'],
  viewport: { width: 1500, height: 1800 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});

const page = context.pages()[0] ?? await context.newPage();

page.on('response', async (response) => {
  const responseUrl = response.url();
  if (!isInteresting(responseUrl)) return;

  const contentType = response.headers()['content-type'] ?? '';
  const entry = {
    url: responseUrl,
    status: response.status(),
    method: response.request().method(),
    resourceType: response.request().resourceType(),
    contentType,
  };

  try {
    const index = captures.length + 1;
    if (contentType.includes('application/json')) {
      const json = await response.json();
      entry.topLevelKeys = Object.keys(json || {}).slice(0, 30);
      entry.eventCount = json?.events?.length ?? json?.eventGroup?.events?.length ?? null;
      entry.marketCount = json?.markets?.length ?? json?.eventGroup?.offerCategories?.length ?? null;
      entry.selectionCount = json?.selections?.length ?? null;
      const file = safeFileName(index, 'json');
      writeFileSync(path.join(OUT_DIR, file), JSON.stringify({ url: responseUrl, json }, null, 2));
      entry.saved = file;
    } else {
      const text = await response.text().catch(() => '');
      const file = safeFileName(index, 'txt');
      writeFileSync(path.join(OUT_DIR, file), text.slice(0, 300000));
      entry.saved = file;
      entry.preview = text.slice(0, 300);
    }
  } catch (error) {
    entry.error = error.message;
  }

  captures.push(entry);
  console.log(JSON.stringify(entry));
});

await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

console.log(JSON.stringify({
  message: 'Persistent DraftKings session running',
  profileDir: PROFILE_DIR,
  outDir: OUT_DIR,
  holdMs,
  profileExists: existsSync(PROFILE_DIR),
}, null, 2));

for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, 1300);
  await page.waitForTimeout(1000);
}

await page.waitForTimeout(holdMs);
await page.screenshot({ path: path.join(OUT_DIR, 'final-page.png'), fullPage: true });
writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(captures, null, 2));
await context.close();
