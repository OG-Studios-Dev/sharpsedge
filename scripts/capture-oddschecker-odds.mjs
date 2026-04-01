#!/usr/bin/env node
/**
 * capture-oddschecker-odds.mjs
 *
 * Local Playwright script to capture Oddschecker Top 5/10/20 finish-market
 * odds for the Masters and POST them to /api/golf/finish-market-odds.
 *
 * Requires: playwright, a real browser, and local dev server running.
 *
 * Usage:
 *   node scripts/capture-oddschecker-odds.mjs
 *   node scripts/capture-oddschecker-odds.mjs --dry-run     # print without POST
 *   node scripts/capture-oddschecker-odds.mjs --url http://localhost:3000
 *
 * Why a local script?
 *   Oddschecker uses Cloudflare protection that blocks server-side fetches.
 *   Playwright with a real browser can bypass this by loading the page
 *   normally in a headed or headless Chromium instance.
 *
 * Limitations:
 *   - Oddschecker may require manual login or cookie consent
 *   - Results depend on Oddschecker's current page structure
 *   - Run within a VPN/residential IP if bot detection persists
 *   - This script is NOT run by the Vercel deployment — run manually or
 *     on a local cron job (e.g. via ~/crontab before each tournament)
 */

import { chromium } from "playwright";

const ODDSCHECKER_MARKETS = {
  top5: "https://www.oddschecker.com/golf/us-masters/top-5-finish",
  top10: "https://www.oddschecker.com/golf/us-masters/top-10-finish",
  top20: "https://www.oddschecker.com/golf/us-masters/top-20-finish",
};

const TOURNAMENT = "The Masters 2026";
const APP_URL = process.argv.find((a) => a.startsWith("--url="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--url") + 1]
  ?? "http://localhost:3000";
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Parse a single Oddschecker market page.
 * Returns array of { player, odds } where odds is American format.
 */
async function parseMarketPage(page, url, marketName) {
  console.log(`  Fetching ${marketName}: ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  // Check for Cloudflare block
  const title = await page.title();
  if (title.toLowerCase().includes("blocked") || title.toLowerCase().includes("attention required")) {
    console.warn(`  ⚠️  Cloudflare blocked on ${marketName}. Try with --headed or a residential IP.`);
    return [];
  }

  // Wait for odds table to appear
  try {
    await page.waitForSelector('[data-test="betting-table"], .betting-table, .odds-table, [class*="odds"]', {
      timeout: 10000,
    });
  } catch {
    console.warn(`  ⚠️  Odds table not found for ${marketName}`);
  }

  // Extract player rows — Oddschecker uses various table formats
  const lines = await page.evaluate(() => {
    const results = [];

    // Try multiple selectors that Oddschecker has used historically
    const selectors = [
      'tr[data-bk-name]',
      '.bet-types tr',
      '[data-test="participant-row"]',
      '.diff-row',
    ];

    for (const sel of selectors) {
      const rows = document.querySelectorAll(sel);
      if (rows.length === 0) continue;

      for (const row of rows) {
        const playerEl = row.querySelector(
          '[data-test="participant-name"], .selec, .bet-name, td:first-child',
        );
        const player = playerEl?.textContent?.trim();
        if (!player) continue;

        // Get best odds from the row (highest decimal or American)
        const oddsEls = row.querySelectorAll('[data-test="odds-cell"], .bc, td[data-bk]');
        let bestOdds = null;
        let bestAmerican = null;

        for (const el of oddsEls) {
          const text = el.textContent?.trim();
          if (!text || text === "" || text === "-" || text === "SP") continue;

          // Try fractional (e.g. "9/2", "7/4") → convert to American
          const fracMatch = text.match(/^(\d+)\/(\d+)$/);
          if (fracMatch) {
            const decimal = parseInt(fracMatch[1]) / parseInt(fracMatch[2]) + 1;
            const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
            if (bestAmerican === null || american > bestAmerican) {
              bestAmerican = american;
            }
            continue;
          }

          // Try American directly (e.g. "+350", "-110")
          const americanMatch = text.match(/^([+-]?\d+)$/);
          if (americanMatch) {
            const val = parseInt(americanMatch[1]);
            if (bestAmerican === null || val > bestAmerican) {
              bestAmerican = val;
            }
            continue;
          }

          // Try decimal (e.g. "4.50", "2.10")
          const decMatch = text.match(/^(\d+\.\d+)$/);
          if (decMatch) {
            const decimal = parseFloat(decMatch[1]);
            if (decimal <= 1.0) continue;
            const american = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
            if (bestAmerican === null || american > bestAmerican) {
              bestAmerican = american;
            }
          }
        }

        if (bestAmerican !== null && player) {
          results.push({ player, odds: bestAmerican });
        }
      }

      if (results.length > 0) break;
    }

    return results;
  });

  console.log(`  ✓ ${lines.length} players found for ${marketName}`);
  return lines;
}

async function main() {
  console.log("🎰 Oddschecker Masters Finish-Market Capture");
  console.log(`   Tournament: ${TOURNAMENT}`);
  console.log(`   App URL: ${APP_URL}`);
  console.log(`   Dry run: ${DRY_RUN}`);
  console.log();

  const browser = await chromium.launch({
    headless: false, // headed helps avoid Cloudflare detection
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const markets = {};

  try {
    for (const [marketKey, url] of Object.entries(ODDSCHECKER_MARKETS)) {
      markets[marketKey] = await parseMarketPage(page, url, marketKey);
    }
  } finally {
    await browser.close();
  }

  const totalLines = Object.values(markets).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`\nTotal lines captured: ${totalLines}`);
  if (totalLines === 0) {
    console.error("❌ No odds captured. Oddschecker may be blocking. Try with a residential VPN.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN OUTPUT ---");
    console.log(JSON.stringify({ tournament: TOURNAMENT, markets }, null, 2));
    return;
  }

  // POST to app
  const endpoint = `${APP_URL}/api/golf/finish-market-odds`;
  console.log(`\nPOSTing to ${endpoint}...`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "oddschecker-manual",
      tournament: TOURNAMENT,
      markets,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ POST failed: ${res.status}`, text);
    process.exit(1);
  }

  const result = await res.json();
  console.log("✅ Stored:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
