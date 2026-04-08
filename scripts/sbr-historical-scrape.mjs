/**
 * sbr-historical-scrape.mjs
 *
 * One-time data pipeline: pull SportsbookReview (SBR) historical game + odds data
 * for NBA, NHL, MLB, NFL from a pre-scraped GitHub archive and seed into Supabase.
 *
 * Safe to re-run: uses upsert with UNIQUE constraint (sport, season, game_date, home_team, away_team).
 * No data is overwritten on re-run.
 *
 * Usage:
 *   node scripts/sbr-historical-scrape.mjs           # live upsert
 *   node scripts/sbr-historical-scrape.mjs --dry-run # preview only
 *
 * Requires:
 *   - historical_game_odds table in Supabase (see SQL migration below)
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * ─── SQL MIGRATION ──────────────────────────────────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS historical_game_odds (
 *   id                  SERIAL PRIMARY KEY,
 *   sport               TEXT NOT NULL,
 *   season              INTEGER NOT NULL,
 *   game_date           TEXT NOT NULL,
 *   home_team           TEXT NOT NULL,
 *   away_team           TEXT NOT NULL,
 *   home_final          INTEGER,
 *   away_final          INTEGER,
 *   period_scores       JSONB DEFAULT '{}'::jsonb,
 *   home_close_ml       INTEGER,
 *   away_close_ml       INTEGER,
 *   home_open_spread    DOUBLE PRECISION,
 *   home_close_spread   DOUBLE PRECISION,
 *   open_over_under     DOUBLE PRECISION,
 *   close_over_under    DOUBLE PRECISION,
 *   source              TEXT NOT NULL DEFAULT 'sbr-archive',
 *   created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   UNIQUE (sport, season, game_date, home_team, away_team)
 * );
 *
 * CREATE INDEX IF NOT EXISTS idx_hgo_sport_date ON historical_game_odds (sport, game_date);
 * CREATE INDEX IF NOT EXISTS idx_hgo_teams ON historical_game_odds (home_team, away_team);
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

// ─── Load env ─────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local');
  if (!existsSync(envPath)) {
    console.error('❌ .env.local not found at', envPath);
    process.exit(1);
  }

  const lines = readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Fix literal \n sequences
    val = val.replace(/\\n/g, '\n');
    env[key] = val;
  }
  return env;
}

// ─── Data sources ─────────────────────────────────────────────────────────────

const SOURCES = [
  {
    sport: 'NBA',
    url: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/nba_archive_10Y.json',
    periodKey: 'quarter',
  },
  {
    sport: 'NHL',
    url: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/nhl_archive_10Y.json',
    periodKey: 'period',
  },
  {
    sport: 'MLB',
    url: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/mlb_archive_10Y.json',
    periodKey: 'inning',
  },
  {
    sport: 'NFL',
    url: 'https://raw.githubusercontent.com/flancast90/sportsbookreview-scraper/main/data/nfl_archive_10Y.json',
    periodKey: 'quarter',
  },
];

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeDate(raw) {
  // Convert float like 20111225.0 or int 20111225 → string "20111225"
  if (raw == null) return '';
  return String(Math.round(Number(raw)));
}

function safeInt(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

function safeFloat(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

/**
 * Build period_scores JSONB object from raw row.
 * NBA/NFL: Q1-Q4; NHL: P1-P3; MLB: empty (innings not in raw data)
 */
function buildPeriodScores(row, sport) {
  if (sport === 'NBA' || sport === 'NFL') {
    const obj = {};
    for (const suffix of ['1stQtr', '2ndQtr', '3rdQtr', '4thQtr']) {
      const hKey = `home_${suffix}`;
      const aKey = `away_${suffix}`;
      const label = suffix.replace('Qtr', '').replace('st', '1').replace('nd', '2').replace('rd', '3').replace('th', '4');
      if (row[hKey] != null) obj[`home_q${label.replace('1', '1').replace('2', '2').replace('3', '3').replace('4', '4')}`] = safeInt(row[hKey]);
      if (row[aKey] != null) obj[`away_q${label.replace('1', '1').replace('2', '2').replace('3', '3').replace('4', '4')}`] = safeInt(row[aKey]);
    }
    // Simpler approach: explicit mapping
    return {
      home_q1: safeInt(row['home_1stQtr']),
      home_q2: safeInt(row['home_2ndQtr']),
      home_q3: safeInt(row['home_3rdQtr']),
      home_q4: safeInt(row['home_4thQtr']),
      away_q1: safeInt(row['away_1stQtr']),
      away_q2: safeInt(row['away_2ndQtr']),
      away_q3: safeInt(row['away_3rdQtr']),
      away_q4: safeInt(row['away_4thQtr']),
    };
  }

  if (sport === 'NHL') {
    return {
      home_p1: safeInt(row['home_1stPeriod'] ?? row['home_period_1'] ?? null),
      home_p2: safeInt(row['home_2ndPeriod'] ?? row['home_period_2'] ?? null),
      home_p3: safeInt(row['home_3rdPeriod'] ?? row['home_period_3'] ?? null),
      away_p1: safeInt(row['away_1stPeriod'] ?? row['away_period_1'] ?? null),
      away_p2: safeInt(row['away_2ndPeriod'] ?? row['away_period_2'] ?? null),
      away_p3: safeInt(row['away_3rdPeriod'] ?? row['away_period_3'] ?? null),
    };
  }

  // MLB: innings not in standard SBR archive shape
  return {};
}

function normalizeRow(row, sport) {
  return {
    sport,
    season: safeInt(row.season) ?? 0,
    game_date: normalizeDate(row.date),
    home_team: String(row.home_team ?? '').trim(),
    away_team: String(row.away_team ?? '').trim(),
    home_final: safeInt(row.home_final),
    away_final: safeInt(row.away_final),
    period_scores: buildPeriodScores(row, sport),
    home_close_ml: safeInt(row.home_close_ml),
    away_close_ml: safeInt(row.away_close_ml),
    home_open_spread: safeFloat(row.home_open_spread),
    home_close_spread: safeFloat(row.home_close_spread),
    open_over_under: safeFloat(row.open_over_under),
    close_over_under: safeFloat(row.close_over_under),
    source: 'sbr-archive',
  };
}

// ─── Supabase upsert (raw REST, no SDK) ──────────────────────────────────────

async function upsertBatch(supabaseUrl, serviceKey, rows) {
  const endpoint = `${supabaseUrl}/rest/v1/historical_game_odds`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upsert failed: ${res.status} ${body}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const env = loadEnv();
  const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'] ?? env['SUPABASE_URL'];
  const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE — no data will be written to Supabase\n');
  }

  let grandTotal = 0;

  for (const source of SOURCES) {
    console.log(`\n📥 Fetching ${source.sport} archive from GitHub...`);

    let raw;
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'Goosalytics-SBR-Pipeline/1.0' },
      });
      if (!res.ok) {
        console.error(`  ❌ HTTP ${res.status} — skipping ${source.sport}`);
        continue;
      }
      raw = await res.json();
    } catch (err) {
      console.error(`  ❌ Fetch failed for ${source.sport}:`, err.message);
      continue;
    }

    if (!Array.isArray(raw)) {
      console.error(`  ❌ Expected array, got ${typeof raw} — skipping ${source.sport}`);
      continue;
    }

    console.log(`  ✅ ${raw.length} records fetched`);

    // Normalize all rows
    const normalized = raw
      .map((row) => normalizeRow(row, source.sport))
      .filter((r) => r.home_team && r.away_team && r.game_date);

    console.log(`  ✅ ${normalized.length} records after normalization`);

    if (DRY_RUN) {
      console.log(`  📋 Sample record:`, JSON.stringify(normalized[0], null, 2));
      console.log(`  📋 Would upsert ${normalized.length} rows in ${Math.ceil(normalized.length / BATCH_SIZE)} batches`);
      grandTotal += normalized.length;
      continue;
    }

    // Upsert in batches
    let upserted = 0;
    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
      const batch = normalized.slice(i, i + BATCH_SIZE);
      try {
        await upsertBatch(SUPABASE_URL, SERVICE_KEY, batch);
        upserted += batch.length;
        process.stdout.write(`\r  ⬆️  ${upserted}/${normalized.length} rows upserted...`);
      } catch (err) {
        console.error(`\n  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
      }
    }
    console.log(`\n  ✅ ${source.sport} done: ${upserted} rows upserted`);
    grandTotal += upserted;
  }

  console.log(`\n🏁 Done. Total rows processed: ${grandTotal}`);
  if (DRY_RUN) {
    console.log('   (dry run — nothing written)');
    console.log('\n   To run for real: node scripts/sbr-historical-scrape.mjs');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
