#!/usr/bin/env node

const apiKey = process.argv[2] || process.env.ODDS_API_IO_KEY;
const sport = process.argv[3] || 'golf';
const limit = Number(process.argv[4] || 5);

if (!apiKey) {
  console.error('Usage: node scripts/odds-api-probe.mjs <apiKey> [sport] [limit]');
  process.exit(1);
}

const base = 'https://api.odds-api.io/v3';

async function getJson(path, params = {}) {
  const url = new URL(base + path);
  url.searchParams.set('apiKey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, url: url.toString() };
}

const eventsResp = await getJson('/events', { sport, limit });
if (eventsResp.status !== 200 || !Array.isArray(eventsResp.data)) {
  console.error(JSON.stringify(eventsResp, null, 2));
  process.exit(1);
}

const rows = [];
for (const ev of eventsResp.data.slice(0, limit)) {
  const oddsResp = await getJson('/odds', {
    eventId: ev.id,
    bookmakers: 'DraftKings,Bet365',
  });
  const books = oddsResp.data?.bookmakers || {};
  rows.push({
    eventId: ev.id,
    home: ev.home,
    away: ev.away,
    league: ev.league?.name,
    bookmakers: Object.keys(books),
    marketCounts: Object.fromEntries(
      Object.entries(books).map(([name, markets]) => [name, Array.isArray(markets) ? markets.length : null])
    ),
    oddsUrl: oddsResp.url,
  });
}

console.log(JSON.stringify({ sport, rows }, null, 2));
