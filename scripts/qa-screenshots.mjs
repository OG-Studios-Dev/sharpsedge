#!/usr/bin/env node
/**
 * QA Mobile Screenshot Tool
 * Takes mobile-viewport screenshots of key Goosalytics pages.
 * Usage: node scripts/qa-screenshots.mjs [--output <dir>] [--base <url>]
 * 
 * Default: saves to /tmp/qa-screenshots/ with iPhone 14 Pro viewport
 */

import { chromium, devices } from "playwright";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const BASE_URL = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "https://goosalytics.vercel.app";

const OUTPUT_DIR = process.argv.includes("--output")
  ? process.argv[process.argv.indexOf("--output") + 1]
  : "/tmp/qa-screenshots";

const PAGES = [
  { name: "home", path: "/" },
  { name: "picks", path: "/picks" },
  { name: "schedule", path: "/schedule" },
  { name: "trends", path: "/trends" },
  { name: "props", path: "/props" },
  { name: "nba-picks", path: "/picks?league=NBA" },
  { name: "pga", path: "/picks?league=PGA" },
  { name: "epl", path: "/leagues/epl" },
  { name: "login", path: "/login" },
  { name: "signup", path: "/signup" },
];

const device = devices["iPhone 14 Pro"];

async function run() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  const results = [];

  for (const { name, path } of PAGES) {
    const url = `${BASE_URL}${path}`;
    const filename = `${timestamp}_${name}.png`;
    const filepath = join(OUTPUT_DIR, filename);

    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      const status = response?.status() ?? 0;

      // Wait for content to render
      await page.waitForTimeout(1500);

      // Full page screenshot
      await page.screenshot({ path: filepath, fullPage: true });

      // Check for errors
      const hasError = await page.evaluate(() => {
        const body = document.body.innerText || "";
        return body.includes("500") || body.includes("Application error") || body.includes("Internal Server Error");
      });

      results.push({
        page: name,
        url,
        status,
        hasError,
        screenshot: filepath,
        ok: status === 200 && !hasError,
      });

      console.log(`${hasError ? "⚠️" : "✅"} ${name} (${status}) → ${filepath}`);
    } catch (err) {
      results.push({
        page: name,
        url,
        status: 0,
        hasError: true,
        screenshot: null,
        ok: false,
        error: err.message,
      });
      console.log(`❌ ${name} — ${err.message}`);
    }
  }

  await browser.close();

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n📱 QA Screenshots: ${passed}/${results.length} OK, ${failed} issues`);
  console.log(`📁 Saved to: ${OUTPUT_DIR}`);

  // Output JSON for programmatic use
  const summaryPath = join(OUTPUT_DIR, `${timestamp}_summary.json`);
  const { writeFileSync } = await import("fs");
  writeFileSync(summaryPath, JSON.stringify({ timestamp, results }, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
