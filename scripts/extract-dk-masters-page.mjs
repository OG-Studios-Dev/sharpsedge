#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const url = process.argv[2] ?? 'https://sportsbook.draftkings.com/leagues/golf/masters-tournament?category=tournament-matchup&subcategory=tournament-matchup';

const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1800 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(OUT_DIR, 'dk-masters-page.png'), fullPage: true });
const text = await page.locator('body').innerText();
writeFileSync(path.join(OUT_DIR, 'dk-masters-page-text.txt'), text);
console.log(text.slice(0, 3000));
await page.waitForTimeout(2000);
await browser.close();
