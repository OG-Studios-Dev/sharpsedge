#!/usr/bin/env node
/**
 * capture-dk-odds.mjs
 *
 * Browser-assisted Playwright script to capture DraftKings golf finish-market
 * odds (Top 5 / Top 10 / Top 20) and write them to:
 *   data/manual-dk-seeds/{tournament-slug}.json
 *
 * Optionally also POSTs the snapshot to the running app via
 *   POST /api/golf/finish-market-odds
 *
 * Because DraftKings is a public-facing SPA, a real Chromium browser can read
 * the rendered odds without logging in.  The script uses headed mode by default
 * so you can watch it work (and manually solve any CAPTCHA if one appears).
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   # Standard capture (opens browser, saves to data/manual-dk-seeds/)
 *   node scripts/capture-dk-odds.mjs --tournament valero-texas-open
 *
 *   # Named tournament label (shown in UI)
 *   node scripts/capture-dk-odds.mjs \
 *     --tournament the-masters-2026 \
 *     --tournament-name "The Masters 2026"
 *
 *   # Dry-run: print to console, don't write/post
 *   node scripts/capture-dk-odds.mjs --tournament valero-texas-open --dry-run
 *
 *   # Also POST captured data to local running dev server
 *   node scripts/capture-dk-odds.mjs --tournament valero-texas-open --post
 *   node scripts/capture-dk-odds.mjs --tournament valero-texas-open --post --url http://localhost:3000
 *
 *   # Headless mode (no browser window — useful on CI / if bot-check is not triggered)
 *   node scripts/capture-dk-odds.mjs --tournament valero-texas-open --headless
 *
 * ─── HOW IT WORKS ─────────────────────────────────────────────────────────────
 *
 *  1. Navigate to https://sportsbook.draftkings.com/sports/golf
 *  2. Find the tournament card matching --tournament-name (or --tournament slug)
 *  3. Click into it and locate each market tab: "Top 5", "Top 10", "Top 20"
 *     (also attempts "H2H" / "Matchups" if present)
 *  4. Extract player rows: name + YES/NO or binary odds line
 *  5. Convert to FinishOddsSnapshot and write to data/manual-dk-seeds/{slug}.json
 *  6. (Optional) POST snapshot to /api/golf/finish-market-odds
 *
 * ─── OUTPUT FORMAT ─────────────────────────────────────────────────────────────
 *
 *  Compatible with the FinishOddsSnapshot type in
 *  src/lib/golf/oddschecker-scraper.ts.
 *
 *  This file is Priority 1 in GET /api/golf/finish-market-odds — any manual-dk
 *  seed in data/manual-dk-seeds/ will override Bovada, provisional, and
 *  oddschecker fallbacks.
 *
 * ─── NOTES ────────────────────────────────────────────────────────────────────
 *
 *  DraftKings golf finish markets use a binary YES/NO structure:
 *    "Ludvig Åberg  To Finish Top 5"   YES +350  NO -450
 *  Only the YES odds are captured (the primary betting side for finish props).
 *
 *  If DK shows the market in a different layout (e.g. player prop table with
 *  a single line per player), the extractor adapts via multiple selector passes.
 *
 *  DK URL patterns are not stable between events; the script always starts from
 *  the golf landing page and follows DOM links rather than hardcoding event IDs.
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── CLI args ─────────────────────────────────────────────────────────────────

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const TOURNAMENT_SLUG =
  getArg("--tournament") ??
  (() => { console.error("❌ --tournament is required (e.g. --tournament valero-texas-open)"); process.exit(1); })();

const TOURNAMENT_NAME =
  getArg("--tournament-name") ??
  TOURNAMENT_SLUG
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const DRY_RUN = hasFlag("--dry-run");
const DO_POST = hasFlag("--post");
const HEADLESS = hasFlag("--headless");
const APP_URL =
  getArg("--url") ??
  (DO_POST ? "http://localhost:3000" : null);

const DK_GOLF_URL = "https://sportsbook.draftkings.com/sports/golf";

// Finish market display names as DK shows them in the UI
const FINISH_MARKET_LABELS = {
  top5: ["top 5", "top-5", "to finish top 5", "finish top 5", "top 5 finish"],
  top10: ["top 10", "top-10", "to finish top 10", "finish top 10", "top 10 finish"],
  top20: ["top 20", "top-20", "to finish top 20", "finish top 20", "top 20 finish"],
  h2h: ["head to head", "h2h", "matchup", "matchups", "head-to-head"],
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function americanToImplied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function slugMatchesTournament(text, slug, name) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  const s = slug.toLowerCase().replace(/-/g, " ");
  const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  // Direct match
  if (t.includes(n) || t.includes(s)) return true;
  // Word overlap (2+ words in common)
  const nameWords = n.split(" ").filter((w) => w.length > 2);
  const overlap = nameWords.filter((w) => t.includes(w));
  return overlap.length >= Math.min(2, nameWords.length);
}

function makeFinishLine(player, odds, market, tournamentDisplay, capturedAt) {
  return {
    player,
    market,
    odds,
    impliedProb: americanToImplied(odds),
    source: "draftkings-manual",
    source_label: `DraftKings (browser capture, ${capturedAt.slice(0, 10)})`,
    captured_at: capturedAt,
    tournament: TOURNAMENT_SLUG,
    book: "DraftKings",
  };
}

// ─── DK-specific extractors ──────────────────────────────────────────────────

/**
 * On a DraftKings market page, extract player odds rows.
 * DK renders golf finish props as a list of player rows, each with a YES/NO
 * binary bet or a single-side player-prop line.
 *
 * Returns array of { player, yesOdds, noOdds? }
 */
async function extractFinishMarketRows(page) {
  return page.evaluate(() => {
    const results = [];

    // ── Strategy 1: "Offer" rows in the outcomes list ─────────────────────
    // DK layout: .sportsbook-offer-category-attribute__content rows
    // Each row: player name + two outcome buttons (YES / NO) with odds
    const offerRows = document.querySelectorAll(
      "[class*='parlay-card-10-v2__row'], [class*='outcomes-list__item'], [class*='sportsbook-event-outcome'], [class*='offer-row']"
    );

    for (const row of offerRows) {
      // Try to get player name
      const nameEl = row.querySelector(
        "[class*='participant-name'], [class*='player-name'], [class*='event-outcome__name'], [class*='label'], h4, span:first-child"
      );
      const player = nameEl?.textContent?.trim();
      if (!player || player.length < 3) continue;

      // Get odds buttons / cells
      const oddsCells = row.querySelectorAll(
        "[class*='outcome__odds'], [class*='odds-cell'], [class*='sportsbook-odds'], [aria-label*='odds'], button[data-testid]"
      );

      let yesOdds = null;
      let noOdds = null;
      let idx = 0;

      for (const cell of oddsCells) {
        const text = cell.textContent?.trim().replace(/\s+/g, "");
        if (!text) continue;

        // Match American odds: +350, -450, 350, -110, etc.
        const match = text.match(/^([+-]?\d{2,4})$/);
        if (!match) continue;
        const val = parseInt(match[1]);
        if (Math.abs(val) < 100 || Math.abs(val) > 100000) continue;

        if (idx === 0) yesOdds = val;
        else if (idx === 1) noOdds = val;
        idx++;
      }

      if (yesOdds !== null && player) {
        results.push({ player, yesOdds, noOdds });
      }
    }

    if (results.length > 0) return results;

    // ── Strategy 2: Generic table rows ───────────────────────────────────
    // Some DK pages use a different layout with a table-like grid
    const tableRows = document.querySelectorAll("tr, [role='row']");
    for (const row of tableRows) {
      const cells = Array.from(row.querySelectorAll("td, [role='cell'], [role='gridcell']"));
      if (cells.length < 2) continue;

      const player = cells[0]?.textContent?.trim();
      if (!player || player.length < 3) continue;

      // Walk remaining cells for odds values
      let yesOdds = null;
      let noOdds = null;
      let idx = 0;

      for (let i = 1; i < cells.length; i++) {
        const text = cells[i]?.textContent?.trim().replace(/\s+/g, "");
        const match = text?.match(/^([+-]?\d{2,4})$/);
        if (!match) continue;
        const val = parseInt(match[1]);
        if (Math.abs(val) < 100 || Math.abs(val) > 100000) continue;
        if (idx === 0) yesOdds = val;
        else if (idx === 1) noOdds = val;
        idx++;
      }

      if (yesOdds !== null && player) {
        results.push({ player, yesOdds, noOdds });
      }
    }

    if (results.length > 0) return results;

    // ── Strategy 3: Any element with odds-like text next to a name ─────────
    // Last resort: walk the whole page DOM looking for patterns
    const allText = document.querySelectorAll(
      "[class*='outcome'], [class*='prop'], [class*='player'], [class*='market']"
    );

    for (const el of allText) {
      const text = el.textContent ?? "";
      // Look for "Name ... +350" or "Name ... -120" pattern
      const match = text.match(/^(.{3,40}?)\s+([+-]\d{2,4})(?:\s+[+-]\d{2,4})?$/);
      if (!match) continue;
      const player = match[1].trim();
      const yesOdds = parseInt(match[2]);
      if (player && !isNaN(yesOdds)) {
        results.push({ player, yesOdds });
      }
    }

    return results;
  });
}

/**
 * Navigate DraftKings golf page to find the tournament, then scrape
 * the specified finish market (top5, top10, top20).
 *
 * DK URL patterns observed:
 *   /sports/golf  →  tournament listing
 *   /event/{id}   →  tournament page with market tabs
 *
 * The script follows links and clicks tabs; it does not rely on hardcoded IDs.
 */
async function scrapeMarket(page, browser, marketKey) {
  const labels = FINISH_MARKET_LABELS[marketKey];
  console.log(`\n  📋 Capturing market: ${marketKey.toUpperCase()} (${labels[0]})`);

  // ── 1. Start from golf landing page ──────────────────────────────────
  console.log(`     → Navigating to ${DK_GOLF_URL}`);
  await page.goto(DK_GOLF_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000); // let SPA hydrate

  // ── 2. Find tournament card ───────────────────────────────────────────
  // DK shows golf tournaments as clickable event tiles / links
  const tournamentLink = await page.evaluate(
    ({ slug, name }) => {
      // Look for anchor tags with tournament name in text or href
      const anchors = Array.from(document.querySelectorAll("a[href*='golf'], a[href*='event'], [class*='event'] a, [class*='tile'] a"));

      function matches(text) {
        const t = (text || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
        const s = slug.toLowerCase().replace(/-/g, " ");
        const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
        if (t.includes(n) || t.includes(s)) return true;
        const nameWords = n.split(" ").filter((w) => w.length > 2);
        const overlap = nameWords.filter((w) => t.includes(w));
        return overlap.length >= Math.min(2, nameWords.length);
      }

      for (const a of anchors) {
        const href = a.href || "";
        const text = a.textContent || "";
        if (matches(text) || matches(href)) {
          return a.href;
        }
      }

      // Also try headings / tiles that are not direct links
      const tiles = Array.from(document.querySelectorAll("[class*='event-cell'], [class*='league-card'], [class*='game-summary']"));
      for (const tile of tiles) {
        const text = tile.textContent || "";
        if (matches(text)) {
          const inner = tile.querySelector("a");
          if (inner) return inner.href;
        }
      }

      return null;
    },
    { slug: TOURNAMENT_SLUG, name: TOURNAMENT_NAME }
  );

  if (!tournamentLink) {
    // Fallback: search for any golf event link and let the user disambiguate visually
    console.warn(`  ⚠️  Could not auto-locate tournament "${TOURNAMENT_NAME}" on the golf page.`);
    console.warn(`     Make sure the browser window is visible. Pausing 15s for manual navigation...`);
    console.warn(`     Navigate to the tournament's player-props page and the script will continue.`);
    await page.waitForTimeout(15000);
  } else {
    console.log(`     → Tournament link: ${tournamentLink}`);
    await page.goto(tournamentLink, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3000);
  }

  // ── 3. Find market tab / sub-category ─────────────────────────────────
  // DK typically shows "Player Props" tab, then within it market categories
  // Try clicking "Player Props" or "Props" tab first
  const propsClicked = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll("[class*='tab'], [role='tab'], [class*='category'], nav a, [class*='market-nav'] a"));
    for (const tab of tabs) {
      const text = (tab.textContent ?? "").toLowerCase();
      if (text.includes("player prop") || text.includes("props")) {
        tab.click();
        return true;
      }
    }
    return false;
  });
  if (propsClicked) {
    console.log("     → Clicked 'Player Props' tab");
    await page.waitForTimeout(2000);
  }

  // Now look for the specific market category (Top 5 / Top 10 / Top 20)
  const marketClicked = await page.evaluate((labels) => {
    const allEls = Array.from(document.querySelectorAll(
      "[class*='tab'], [role='tab'], [class*='category'], [class*='sub-nav'] a, [class*='filter'] a, [class*='accordion'] button, [class*='section-header'], button"
    ));

    for (const el of allEls) {
      const text = (el.textContent ?? "").toLowerCase().trim();
      for (const label of labels) {
        if (text === label || text.includes(label)) {
          el.click();
          return text;
        }
      }
    }
    return null;
  }, labels);

  if (marketClicked) {
    console.log(`     → Clicked market tab: "${marketClicked}"`);
    await page.waitForTimeout(2500);
  } else {
    console.warn(`  ⚠️  Could not find market tab for "${labels[0]}" — will try to extract from current view`);
  }

  // ── 4. Wait for odds content to load ──────────────────────────────────
  try {
    await page.waitForSelector(
      "[class*='outcome'], [class*='odds'], [class*='participant'], [class*='prop-row']",
      { timeout: 10000 }
    );
  } catch {
    console.warn("     ⚠️  Odds selectors not found within timeout — proceeding anyway");
  }

  // ── 5. Extract rows ────────────────────────────────────────────────────
  const rows = await extractFinishMarketRows(page);
  console.log(`     ✓ ${rows.length} player rows extracted for ${marketKey}`);

  if (rows.length === 0) {
    // Take a screenshot for debugging
    const screenshotPath = join(ROOT, `out/dk-capture-debug-${marketKey}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.warn(`     📸 Debug screenshot saved to ${screenshotPath}`);
    } catch {}
  }

  return rows;
}

// ─── H2H scraper (optional, best-effort) ─────────────────────────────────────

async function scrapeH2H(page) {
  const labels = FINISH_MARKET_LABELS.h2h;
  console.log(`\n  📋 Attempting H2H / Matchups capture (best-effort)`);

  // Navigate back to golf page and tournament
  try {
    await page.goto(DK_GOLF_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const clicked = await page.evaluate((labels) => {
      const allEls = Array.from(document.querySelectorAll("[class*='tab'], [role='tab'], button, a"));
      for (const el of allEls) {
        const text = (el.textContent ?? "").toLowerCase().trim();
        for (const label of labels) {
          if (text.includes(label)) {
            el.click();
            return text;
          }
        }
      }
      return null;
    }, labels);

    if (!clicked) {
      console.log("     ℹ️  No H2H tab found — skipping");
      return [];
    }

    await page.waitForTimeout(2000);

    // Extract H2H matchups: pairs of player names + odds
    const h2hRows = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll("[class*='event-row'], [class*='matchup-row'], [class*='parlay-card-10-v2__row']");

      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("[class*='participant'], [class*='player'], [class*='outcome']"));
        if (cells.length < 2) continue;

        const playerA = cells[0]?.textContent?.trim();
        const playerB = cells[1]?.textContent?.trim();
        const oddsEls = Array.from(row.querySelectorAll("[class*='odds'], button"));
        const odds = oddsEls
          .map((el) => el.textContent?.trim().replace(/\s+/g, ""))
          .filter((t) => t?.match(/^[+-]?\d{2,4}$/))
          .map(Number)
          .filter((v) => Math.abs(v) >= 100);

        if (playerA && playerB && odds.length >= 2) {
          results.push({ playerA, playerB, playerAOdds: odds[0], playerBOdds: odds[1] });
        }
      }
      return results;
    });

    console.log(`     ✓ ${h2hRows.length} H2H matchup rows extracted`);
    return h2hRows;
  } catch (err) {
    console.warn(`     ⚠️  H2H capture failed: ${err.message}`);
    return [];
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏌️  DraftKings Golf Finish-Market Capture");
  console.log(`   Tournament slug: ${TOURNAMENT_SLUG}`);
  console.log(`   Tournament name: ${TOURNAMENT_NAME}`);
  console.log(`   Dry run:         ${DRY_RUN}`);
  console.log(`   Post to app:     ${DO_POST}`);
  console.log(`   App URL:         ${APP_URL ?? "(not posting)"}`);
  console.log(`   Headed:          ${!HEADLESS}`);
  console.log();

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    // Spoof as a real browser
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Mode": "navigate",
    },
  });

  // Remove automation flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const page = await context.newPage();

  const markets = { top5: [], top10: [], top20: [] };

  try {
    for (const marketKey of ["top5", "top10", "top20"]) {
      const rows = await scrapeMarket(page, browser, marketKey);
      markets[marketKey] = rows;
    }

    // H2H is optional / best-effort
    const h2hRows = await scrapeH2H(page).catch(() => []);
    if (h2hRows.length > 0) {
      markets.h2h = h2hRows;
    }
  } finally {
    await browser.close();
  }

  // Validate we got something
  const totalLines = markets.top5.length + markets.top10.length + markets.top20.length;
  console.log(`\n📊 Capture summary:`);
  console.log(`   top5:  ${markets.top5.length} players`);
  console.log(`   top10: ${markets.top10.length} players`);
  console.log(`   top20: ${markets.top20.length} players`);
  if (markets.h2h) console.log(`   h2h:   ${markets.h2h.length} matchups`);

  if (totalLines === 0) {
    console.error("\n❌ No odds captured.");
    console.error("   DraftKings may have changed its page structure, or bot protection was triggered.");
    console.error("   Tips:");
    console.error("   1. Run without --headless to see the browser");
    console.error("   2. Check the debug screenshots in out/dk-capture-debug-*.png");
    console.error("   3. Manually navigate to the tournament finish-market page and re-run");
    process.exit(1);
  }

  // ── Build FinishOddsSnapshot ──────────────────────────────────────────
  const now = new Date().toISOString();

  function buildLines(rows, marketKey) {
    return rows.map((row) => ({
      player: row.player,
      market: marketKey,
      odds: row.yesOdds,
      impliedProb: americanToImplied(row.yesOdds),
      source: "draftkings-manual",
      source_label: `DraftKings (browser capture, ${now.slice(0, 10)})`,
      captured_at: now,
      tournament: TOURNAMENT_SLUG,
      book: "DraftKings",
    }));
  }

  const snapshot = {
    tournament: TOURNAMENT_SLUG,
    generatedAt: now,
    source: "draftkings-manual",
    source_label: `DraftKings (browser capture, ${now.slice(0, 10)})`,
    limitation: null,
    _capture_note: `Lines captured from DraftKings public sportsbook finish markets for ${TOURNAMENT_NAME}. Browser-captured via capture-dk-odds.mjs.`,
    top5: buildLines(markets.top5, "top5"),
    top10: buildLines(markets.top10, "top10"),
    top20: buildLines(markets.top20, "top20"),
    ...(markets.h2h?.length > 0 && { h2h: markets.h2h }),
  };

  if (DRY_RUN) {
    console.log("\n--- DRY RUN OUTPUT ---");
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  // ── Write to data/manual-dk-seeds/{slug}.json ─────────────────────────
  const seedDir = join(ROOT, "data", "manual-dk-seeds");
  if (!existsSync(seedDir)) mkdirSync(seedDir, { recursive: true });

  const outputPath = join(seedDir, `${TOURNAMENT_SLUG}.json`);
  writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
  console.log(`\n✅ Saved to ${outputPath}`);
  console.log(`   → This file is Priority 1 in GET /api/golf/finish-market-odds`);

  // ── Optional: POST to app ─────────────────────────────────────────────
  if (DO_POST && APP_URL) {
    const endpoint = `${APP_URL}/api/golf/finish-market-odds`;
    console.log(`\n📤 Posting to ${endpoint}...`);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "draftkings-manual",
          tournament: TOURNAMENT_SLUG,
          book: "DraftKings",
          markets: {
            top5: markets.top5.map((r) => ({ player: r.player, odds: r.yesOdds })),
            top10: markets.top10.map((r) => ({ player: r.player, odds: r.yesOdds })),
            top20: markets.top20.map((r) => ({ player: r.player, odds: r.yesOdds })),
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`❌ POST failed: ${res.status}`, text);
      } else {
        const result = await res.json();
        console.log("✅ API response:", JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error(`❌ POST error: ${err.message}`);
    }
  }

  console.log("\n🏌️  Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
