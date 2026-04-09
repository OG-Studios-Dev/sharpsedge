#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

const TOURNAMENT_SLUG = getArg('--tournament') ?? 'masters';
const TOURNAMENT_NAME = getArg('--tournament-name') ?? 'The Masters';
const INPUT_DIR = getArg('--input-dir') ?? 'out/dk-derived';
const DRY_RUN = hasFlag('--dry-run');

function americanToImplied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function loadJson(name) {
  const p = join(ROOT, INPUT_DIR, name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function gatherOffers(payload) {
  const tabs = payload?.tabs ?? [];
  const results = [];
  for (const tab of tabs) {
    for (const bucketName of ['eventResults', 'propMarketResults', 'outrightMarketResults']) {
      const bucket = tab?.[bucketName]?.results ?? [];
      for (const item of bucket) {
        const cats = item?.markets?.offerCategories ?? [];
        for (const cat of cats) {
          const subs = cat?.offerSubcategoryDescriptors ?? [];
          for (const sub of subs) {
            const offers = sub?.offerSubcategory?.offers ?? [];
            for (const row of offers) {
              for (const offer of row) results.push(offer);
            }
          }
        }
      }
    }
  }
  return results;
}

function parseAmerican(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/[^0-9+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function buildTopFinishLines(payload, market) {
  const offers = gatherOffers(payload);
  const lines = [];
  const seen = new Set();

  for (const offer of offers) {
    const outcomes = offer?.outcomes ?? [];
    for (const outcome of outcomes) {
      const player = outcome?.participant ?? outcome?.label;
      const odds = parseAmerican(outcome?.oddsAmerican);
      if (!player || odds === null) continue;
      const key = `${market}:${player.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({
        player,
        market,
        odds,
        impliedProb: americanToImplied(odds),
        source: 'draftkings-manual',
        source_label: `DraftKings (search payload capture, ${new Date().toISOString().slice(0, 10)})`,
        captured_at: new Date().toISOString(),
        tournament: TOURNAMENT_SLUG,
        book: 'DraftKings',
      });
    }
  }

  return lines;
}

function buildFinishingPositions(payload) {
  const offers = gatherOffers(payload);
  const rows = [];
  const seen = new Set();
  for (const offer of offers) {
    const player = offer?.outcomes?.[0]?.participant ?? offer?.label?.replace(/\s+Finishing Position$/i, '');
    const outcomes = offer?.outcomes ?? [];
    const over = outcomes.find((o) => String(o?.label).toLowerCase() === 'over');
    const under = outcomes.find((o) => String(o?.label).toLowerCase() === 'under');
    const line = over?.line ?? under?.line;
    const overOdds = parseAmerican(over?.oddsAmerican);
    const underOdds = parseAmerican(under?.oddsAmerican);
    if (!player || typeof line !== 'number' || overOdds === null || underOdds === null) continue;
    const key = `${player.toLowerCase()}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ player, line, over_odds: overOdds, under_line: line, under_odds: underOdds });
  }
  return rows;
}

function buildMatchups(payload) {
  const offers = gatherOffers(payload);
  const rows = [];
  const seen = new Set();
  for (const offer of offers) {
    const outcomes = offer?.outcomes ?? [];
    if (outcomes.length < 2) continue;
    const a = outcomes[0];
    const b = outcomes[1];
    const player1 = a?.participant ?? a?.label;
    const player2 = b?.participant ?? b?.label;
    const odds1 = parseAmerican(a?.oddsAmerican);
    const odds2 = parseAmerican(b?.oddsAmerican);
    if (!player1 || !player2 || odds1 === null || odds2 === null) continue;
    const key = `${player1.toLowerCase()}::${player2.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ matchup: `${player2} v ${player1}`, player1, odds1, player2, odds2 });
  }
  return rows;
}

const top20Payload = loadJson('dk-search-masters-top-20.json');
const finishingPayload = loadJson('dk-search-masters-finishing-position.json');
const matchupPayload = loadJson('dk-search-masters-matchup.json');

const top20 = buildTopFinishLines(top20Payload, 'top20');
const parsedFinishingPosition = buildFinishingPositions(finishingPayload);
const parsedTournamentMatchups = buildMatchups(matchupPayload);

const seedPath = join(ROOT, 'data', 'manual-dk-seeds', `${TOURNAMENT_SLUG}.json`);
let existing = {
  tournament: TOURNAMENT_SLUG,
  generatedAt: new Date().toISOString(),
  source: 'draftkings-manual',
  source_label: `DraftKings (search payload capture, ${new Date().toISOString().slice(0, 10)})`,
  limitation: null,
  _capture_note: `DraftKings search payload capture for ${TOURNAMENT_NAME}.`,
  top5: [],
  top10: [],
  top20: [],
  finishing_position: [],
  tournament_matchups: [],
};

if (existsSync(seedPath)) {
  existing = { ...existing, ...JSON.parse(readFileSync(seedPath, 'utf8')) };
}

const merged = {
  ...existing,
  generatedAt: new Date().toISOString(),
  source_label: `DraftKings (search payload capture, ${new Date().toISOString().slice(0, 10)})`,
  _capture_note: `DraftKings search payload capture for ${TOURNAMENT_NAME}. Parsed from cached search JSON.`,
  top20,
  finishing_position: (existing.finishing_position?.length ?? 0) > parsedFinishingPosition.length
    ? existing.finishing_position
    : parsedFinishingPosition,
  tournament_matchups: (existing.tournament_matchups?.length ?? 0) > parsedTournamentMatchups.length
    ? existing.tournament_matchups
    : parsedTournamentMatchups,
};

if (DRY_RUN) {
  console.log(JSON.stringify({ top20: top20.length, finishing_position: parsedFinishingPosition.length, tournament_matchups: parsedTournamentMatchups.length, sampleTop20: top20.slice(0,5) }, null, 2));
  process.exit(0);
}

mkdirSync(join(ROOT, 'data', 'manual-dk-seeds'), { recursive: true });
writeFileSync(seedPath, JSON.stringify(merged, null, 2));
console.log(JSON.stringify({
  saved: seedPath,
  counts: {
    top5: merged.top5.length,
    top10: merged.top10.length,
    top20: merged.top20.length,
    finishing_position: merged.finishing_position.length,
    tournament_matchups: merged.tournament_matchups.length,
  },
}, null, 2));
