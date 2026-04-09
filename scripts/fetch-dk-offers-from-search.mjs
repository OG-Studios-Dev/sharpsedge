#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const INPUT = getArg('--input');
if (!INPUT) {
  console.error('Usage: node scripts/fetch-dk-offers-from-search.mjs --input out/dk-derived/dk-search-masters-top-20.json');
  process.exit(1);
}

const payload = JSON.parse(readFileSync(join(ROOT, INPUT), 'utf8'));
const tab = payload?.tabs?.[0];
const ws = tab?.websocketSubscriptionPartials?.outrightMarket?.[0];
if (!ws) {
  throw new Error('No websocketSubscriptionPartials.outrightMarket[0] found');
}

const siteName = ws.siteName ?? 'dkcaon';
const locale = ws.locale ?? 'en-us';
const query = encodeURIComponent(ws.query);
const includeMarkets = encodeURIComponent(ws.includeMarkets);
const projection = encodeURIComponent(ws.projection ?? 'BetOffers');

const url = `https://sportsbook-nash.draftkings.com/api/sportscontent/${siteName}/v1/events?siteName=${siteName}&locale=${locale}&query=${query}&includeMarkets=${includeMarkets}&projection=${projection}`;

const res = await fetch(url, {
  headers: {
    'accept': 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'origin': 'https://sportsbook.draftkings.com',
    'referer': 'https://sportsbook.draftkings.com/',
  },
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}

mkdirSync(join(ROOT, 'out', 'dk-derived'), { recursive: true });
const out = join(ROOT, 'out', 'dk-derived', 'dk-fetched-offers.json');
writeFileSync(out, JSON.stringify({ url, status: res.status, body }, null, 2));
console.log(JSON.stringify({ url, status: res.status, saved: out }, null, 2));
