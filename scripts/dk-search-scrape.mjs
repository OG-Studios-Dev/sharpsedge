#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const searchText = process.argv[2] ?? 'masters';
const outDir = process.argv[3] ?? 'out/dk-derived';
mkdirSync(outDir, { recursive: true });

const base = 'https://sportsbook-nash.draftkings.com/api/search/dkcaon/CA-ON-SB/v1/search';
const url = `${base}?searchText=${encodeURIComponent(searchText)}`;

const res = await fetch(url, {
  headers: {
    'user-agent': 'Mozilla/5.0',
    'origin': 'https://sportsbook.draftkings.com',
    'referer': 'https://sportsbook.draftkings.com/sports/golf',
    'accept': 'application/json, text/plain, */*',
  },
});

if (!res.ok) {
  throw new Error(`DraftKings search failed: ${res.status} ${res.statusText}`);
}

const data = await res.json();
writeFileSync(path.join(outDir, `dk-search-${searchText.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`), JSON.stringify(data, null, 2));

function gatherResults() {
  const buckets = [];
  for (const tab of data.tabs ?? []) {
    for (const key of ['eventResults', 'propMarketResults', 'outrightMarketResults']) {
      const results = tab?.[key]?.results ?? [];
      for (const item of results) buckets.push(item);
    }
  }
  return buckets;
}

const items = gatherResults();
const summary = [];
for (const item of items) {
  const markets = item?.markets;
  if (!markets) continue;
  summary.push({
    eventGroupId: markets.eventGroupId,
    displayGroupId: markets.displayGroupId,
    name: markets.name,
    categories: (markets.offerCategories ?? []).map((cat) => ({
      offerCategoryId: cat.offerCategoryId,
      name: cat.name,
      subcategories: (cat.offerSubcategoryDescriptors ?? []).map((sub) => ({
        subcategoryId: sub.subcategoryId,
        name: sub.name,
        offerCount: (sub.offerSubcategory?.offers ?? []).length,
        sampleLabels: (sub.offerSubcategory?.offers ?? []).slice(0, 3).map((offerRow) => offerRow?.[0]?.label).filter(Boolean),
      })),
    })),
  });
}

const dedup = [];
const seen = new Set();
for (const item of summary) {
  const key = JSON.stringify(item);
  if (seen.has(key)) continue;
  seen.add(key);
  dedup.push(item);
}

writeFileSync(path.join(outDir, `dk-search-${searchText.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-summary.json`), JSON.stringify(dedup, null, 2));
console.log(JSON.stringify(dedup, null, 2));
