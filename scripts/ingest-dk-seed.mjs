#!/usr/bin/env node
/**
 * ingest-dk-seed.mjs
 *
 * Convert a raw DraftKings odds JSON into the proper FinishOddsSnapshot format
 * and write it to data/manual-dk-seeds/{tournament-slug}.json.
 *
 * Use this when you have captured DK finish-market lines manually (e.g., by
 * typing them in from a screenshot) rather than via the full Playwright capture.
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   # Write a fully formatted seed for a specific tournament
 *   node scripts/ingest-dk-seed.mjs \
 *     --tournament the-masters-2026 \
 *     --tournament-name "The Masters 2026" \
 *     --top5 "Scottie Scheffler:260,Rory McIlroy:320,Xander Schauffele:380" \
 *     --top10 "Scottie Scheffler:-130,Rory McIlroy:100,Xander Schauffele:140" \
 *     --top20 "Scottie Scheffler:-400,Rory McIlroy:-250"
 *
 *   # Load odds from a raw JSON file and reformat it
 *   node scripts/ingest-dk-seed.mjs \
 *     --tournament the-masters-2026 \
 *     --from-file /path/to/raw-odds.json
 *
 *   # Dry run (print without writing)
 *   node scripts/ingest-dk-seed.mjs --tournament valero-texas-open --dry-run \
 *     --top5 "Ludvig Aberg:260,Jordan Spieth:290"
 *
 * ─── RAW JSON FORMAT (--from-file) ────────────────────────────────────────────
 *
 *   {
 *     "top5":  [{ "player": "Name", "odds": 260 }, ...],
 *     "top10": [{ "player": "Name", "odds": -120 }, ...],
 *     "top20": [{ "player": "Name", "odds": -300 }, ...]
 *   }
 *
 *   OR the existing seed format (FinishOddsSnapshot) — will be re-timestamped.
 *
 * ─── INLINE FORMAT (--top5, --top10, --top20) ─────────────────────────────────
 *
 *   Comma-separated "Player Name:AmericanOdds" pairs, e.g.:
 *     "Scottie Scheffler:260,Rory McIlroy:320,Xander Schauffele:380"
 *
 * ─── OUTPUT ────────────────────────────────────────────────────────────────────
 *
 *   Writes to data/manual-dk-seeds/{tournament-slug}.json
 *   This file is Priority 1 in GET /api/golf/finish-market-odds
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const TOURNAMENT_SLUG = getArg("--tournament");
if (!TOURNAMENT_SLUG) {
  console.error("❌ --tournament is required (e.g. --tournament valero-texas-open)");
  process.exit(1);
}

const TOURNAMENT_NAME =
  getArg("--tournament-name") ??
  TOURNAMENT_SLUG.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const DRY_RUN = hasFlag("--dry-run");
const FROM_FILE = getArg("--from-file");

function americanToImplied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * Parse inline "Player Name:odds,Player Name:odds" format.
 */
function parseInlineOdds(str) {
  if (!str) return [];
  return str.split(",").map((part) => {
    const colonIdx = part.lastIndexOf(":");
    if (colonIdx === -1) throw new Error(`Invalid format in "${part}" — expected "Name:odds"`);
    const player = part.slice(0, colonIdx).trim();
    const odds = parseInt(part.slice(colonIdx + 1).trim(), 10);
    if (!player || isNaN(odds)) throw new Error(`Could not parse "${part}"`);
    return { player, odds };
  });
}

function buildLines(rawArr, marketKey, now) {
  return rawArr.map((e) => ({
    player: e.player,
    market: marketKey,
    odds: e.odds,
    impliedProb: americanToImplied(e.odds),
    source: "draftkings-manual",
    source_label: `DraftKings (manual capture, ${now.slice(0, 10)})`,
    captured_at: now,
    tournament: TOURNAMENT_SLUG,
    book: "DraftKings",
  }));
}

const now = new Date().toISOString();
let rawTop5 = [], rawTop10 = [], rawTop20 = [];

if (FROM_FILE) {
  // Load from file
  const raw = JSON.parse(readFileSync(FROM_FILE, "utf-8"));

  // Support both FinishOddsSnapshot format (with .top5[].odds) and simple {top5:[{player,odds}]}
  const extractRaw = (arr) => {
    if (!arr || !arr.length) return [];
    return arr.map((e) => ({ player: e.player, odds: e.odds }));
  };

  rawTop5 = extractRaw(raw.top5);
  rawTop10 = extractRaw(raw.top10);
  rawTop20 = extractRaw(raw.top20);
  console.log(`📁 Loaded from ${FROM_FILE}: top5=${rawTop5.length}, top10=${rawTop10.length}, top20=${rawTop20.length}`);
} else {
  // Parse inline args
  try {
    rawTop5 = parseInlineOdds(getArg("--top5") ?? "");
    rawTop10 = parseInlineOdds(getArg("--top10") ?? "");
    rawTop20 = parseInlineOdds(getArg("--top20") ?? "");
  } catch (err) {
    console.error(`❌ Parse error: ${err.message}`);
    process.exit(1);
  }
}

if (!rawTop5.length && !rawTop10.length && !rawTop20.length) {
  console.error("❌ No odds provided. Use --top5/--top10/--top20 inline or --from-file.");
  console.error("   Example: --top5 \"Scottie Scheffler:260,Rory McIlroy:320\"");
  process.exit(1);
}

const snapshot = {
  tournament: TOURNAMENT_SLUG,
  generatedAt: now,
  source: "draftkings-manual",
  source_label: `DraftKings (manual capture, ${now.slice(0, 10)})`,
  limitation: null,
  _capture_note: `Lines manually captured from DraftKings sportsbook for ${TOURNAMENT_NAME}. Ingested via ingest-dk-seed.mjs.`,
  top5: buildLines(rawTop5, "top5", now),
  top10: buildLines(rawTop10, "top10", now),
  top20: buildLines(rawTop20, "top20", now),
};

console.log(`\n📊 Ingestion summary for ${TOURNAMENT_SLUG}:`);
console.log(`   top5:  ${snapshot.top5.length} players`);
console.log(`   top10: ${snapshot.top10.length} players`);
console.log(`   top20: ${snapshot.top20.length} players`);

if (DRY_RUN) {
  console.log("\n--- DRY RUN OUTPUT ---");
  console.log(JSON.stringify(snapshot, null, 2));
  process.exit(0);
}

const seedDir = join(ROOT, "data", "manual-dk-seeds");
if (!existsSync(seedDir)) mkdirSync(seedDir, { recursive: true });

const outputPath = join(seedDir, `${TOURNAMENT_SLUG}.json`);
writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));
console.log(`\n✅ Written to ${outputPath}`);
console.log(`   → Priority 1 source for GET /api/golf/finish-market-odds?tournament=${TOURNAMENT_SLUG}`);
