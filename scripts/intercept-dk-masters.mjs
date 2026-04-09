#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out', 'dk-intercept');
mkdirSync(OUT_DIR, { recursive: true });

const url = process.argv[2] ?? 'https://sportsbook.draftkings.com/leagues/golf/masters-tournament';
const waitMs = Number(process.argv[3] ?? 20000);

const captures = [];

function interesting(url) {
  return [
    'sportsbook-nash.draftkings.com',
    'eventgroups/v1',
    'sportscontent',
    'leagues/golf',
    'masters',
    'market',
    'subcategory',
    'navigation',
  ].some((needle) => url.toLowerCase().includes(needle));
}

const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1500, height: 1800 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
});
const page = await context.newPage();

page.on('response', async (response) => {
  const responseUrl = response.url();
  if (!interesting(responseUrl)) return;
  const contentType = response.headers()['content-type'] ?? '';
  const record = {
    url: responseUrl,
    status: response.status(),
    contentType,
    method: response.request().method(),
  };
  try {
    if (contentType.includes('application/json')) {
      const json = await response.json();
      record.jsonKeys = Object.keys(json || {}).slice(0, 30);
      record.eventCount = json?.events?.length ?? null;
      record.marketCount = json?.markets?.length ?? null;
      record.selectionCount = json?.selections?.length ?? null;
      const safeName = `capture-${captures.length + 1}.json`;
      writeFileSync(path.join(OUT_DIR, safeName), JSON.stringify({ url: responseUrl, json }, null, 2));
      record.saved = safeName;
    } else {
      const text = await response.text();
      const safeName = `capture-${captures.length + 1}.txt`;
      writeFileSync(path.join(OUT_DIR, safeName), text.slice(0, 200000));
      record.saved = safeName;
      record.preview = text.slice(0, 300);
    }
  } catch (error) {
    record.error = error.message;
  }
  captures.push(record);
  console.log(JSON.stringify(record));
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(waitMs);
await page.screenshot({ path: path.join(OUT_DIR, 'final-page.png'), fullPage: true });
writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(captures, null, 2));
console.log(JSON.stringify({ done: true, captureCount: captures.length }, null, 2));
await browser.close();
