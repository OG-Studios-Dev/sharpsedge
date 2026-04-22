#!/usr/bin/env node

/**
 * Safe offline export for the first BigQuery warehouse contract.
 *
 * Purpose:
 * - reads a bounded slice from Supabase serving/warehouse-compatible views
 * - writes newline-delimited JSON for BigQuery load
 * - does NOT mutate Supabase
 * - does NOT touch live product routes
 *
 * This is intentionally export-only so current user experience and picks/results
 * remain untouched while we build the warehouse lane.
 *
 * Example:
 *   node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NHL --limit=5000
 *   node scripts/bigquery-export-historical-market-sides-v1.mjs --league=NBA --start=2025-10-01 --end=2026-04-30 --out=tmp/nba-market-sides.ndjson
 */

import fs from 'node:fs';
import path from 'node:path';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase env. Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

function argValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function requireArg(name) {
  const value = argValue(name);
  if (!value) {
    console.error(`Missing required flag --${name}=...`);
    process.exit(1);
  }
  return value;
}

const league = requireArg('league');
const start = argValue('start');
const end = argValue('end');
const limit = Number(argValue('limit', '5000'));
const outArg = argValue('out');
const dryRun = process.argv.includes('--dry-run');

if (!Number.isFinite(limit) || limit <= 0 || limit > 50000) {
  console.error('--limit must be between 1 and 50000');
  process.exit(1);
}

const outPath = outArg || path.join('tmp', `bigquery-export-${league.toLowerCase()}-historical-market-sides-v1.ndjson`);

function headers() {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: 'application/json',
  };
}

function buildUrl() {
  const params = new URLSearchParams();
  params.set('select', [
    'candidate_id',
    'canonical_game_id',
    'event_id',
    'sport',
    'league',
    'season',
    'event_date',
    'home_team',
    'away_team',
    'team_name',
    'opponent_name',
    'team_role',
    'market_type',
    'submarket_type',
    'market_family',
    'market_scope',
    'side',
    'line',
    'odds',
    'sportsbook',
    'is_home_team_bet',
    'is_away_team_bet',
    'is_total_over_bet',
    'is_total_under_bet',
    'is_favorite',
    'is_underdog',
    'graded',
    'result',
    'integrity_status',
    'profit_units',
    'profit_dollars_10',
    'roi_on_10_flat'
  ].join(','));
  params.set('league', `eq.${league}`);
  if (start) params.set('event_date', `gte.${start}`);
  if (end) params.set(start ? 'and' : 'event_date', start ? `(event_date.lte.${end})` : `lte.${end}`);
  params.set('order', 'event_date.asc');
  params.set('limit', String(limit));
  return `${supabaseUrl}/rest/v1/fact_historical_market_sides_base_v1?${params.toString()}`;
}

async function fetchRows() {
  const url = buildUrl();
  const res = await fetch(url, { headers: headers() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase export failed ${res.status}: ${text}`);
  }
  const parsed = text ? JSON.parse(text) : [];
  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected export payload shape');
  }
  return parsed;
}

function normalizeRow(row) {
  return {
    candidate_id: row.candidate_id ?? null,
    canonical_game_id: row.canonical_game_id ?? null,
    event_id: row.event_id ?? null,
    sport: row.sport ?? null,
    league: row.league ?? null,
    season: row.season ?? null,
    event_date: row.event_date ?? null,
    home_team: row.home_team ?? null,
    away_team: row.away_team ?? null,
    team_name: row.team_name ?? null,
    opponent_name: row.opponent_name ?? null,
    team_role: row.team_role ?? null,
    market_type: row.market_type ?? null,
    submarket_type: row.submarket_type ?? null,
    market_family: row.market_family ?? null,
    market_scope: row.market_scope ?? null,
    side: row.side ?? null,
    line: row.line ?? null,
    odds: row.odds ?? null,
    sportsbook: row.sportsbook ?? null,
    is_home_team_bet: row.is_home_team_bet ?? null,
    is_away_team_bet: row.is_away_team_bet ?? null,
    is_total_over_bet: row.is_total_over_bet ?? null,
    is_total_under_bet: row.is_total_under_bet ?? null,
    is_favorite: row.is_favorite ?? null,
    is_underdog: row.is_underdog ?? null,
    graded: row.graded ?? null,
    result: row.result ?? null,
    integrity_status: row.integrity_status ?? null,
    profit_units: row.profit_units ?? null,
    profit_dollars_10: row.profit_dollars_10 ?? null,
    roi_on_10_flat: row.roi_on_10_flat ?? null,
    source_loaded_at: new Date().toISOString(),
    source_batch_id: `manual_export:${league}:${new Date().toISOString()}`,
  };
}

async function main() {
  const rows = await fetchRows();
  const normalized = rows.map(normalizeRow);

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      mode: 'dry-run',
      league,
      start: start || null,
      end: end || null,
      limit,
      rowCount: normalized.length,
      sample: normalized.slice(0, 3),
      outPath,
      mutatedSupabase: false,
      touchedProductRoutes: false,
    }, null, 2));
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, normalized.map((row) => JSON.stringify(row)).join('\n') + (normalized.length ? '\n' : ''));

  console.log(JSON.stringify({
    ok: true,
    league,
    start: start || null,
    end: end || null,
    limit,
    rowCount: normalized.length,
    outPath,
    mutatedSupabase: false,
    touchedProductRoutes: false,
    nextStep: `bq load --source_format=NEWLINE_DELIMITED_JSON YOUR_PROJECT_ID:goosalytics_warehouse.historical_market_sides_base ${outPath}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
