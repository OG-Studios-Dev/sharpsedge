#!/usr/bin/env node

const DK_SPORTSBOOK_NASH_BASE =
  "https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1";

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? null : process.argv[idx + 1] ?? null;
}

function buildUrl(leagueId, categoryId, subcategoryId) {
  const base = `${DK_SPORTSBOOK_NASH_BASE}/leagues/${leagueId}/categories/${categoryId}`;
  return subcategoryId == null ? base : `${base}/subcategories/${subcategoryId}`;
}

function normalizeAmericanOdds(value) {
  if (!value) return null;
  const parsed = Number.parseInt(String(value).replace(/−/g, '-').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function indexById(items) {
  const map = new Map();
  for (const item of items ?? []) {
    if (item?.id == null) continue;
    map.set(String(item.id), item);
  }
  return map;
}

const leagueId = getArg("--league") ?? "84240";
const categoryId = Number(getArg("--category") ?? "493");
const subcategoryArg = getArg("--subcategory");
const subcategoryId = subcategoryArg == null ? undefined : Number(subcategoryArg);

const url = buildUrl(leagueId, categoryId, subcategoryId);
const res = await fetch(url, {
  headers: {
    "user-agent": "Mozilla/5.0",
    accept: "application/json,text/plain,*/*",
  },
});
if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
const payload = await res.json();

const eventsById = indexById(payload.events);
const selectionsByMarket = new Map();
for (const selection of payload.selections ?? []) {
  if (!selection?.marketId) continue;
  const key = String(selection.marketId);
  const existing = selectionsByMarket.get(key);
  if (existing) existing.push(selection);
  else selectionsByMarket.set(key, [selection]);
}

const offers = (payload.markets ?? []).map((market) => {
  const event = eventsById.get(String(market.eventId));
  const homeTeam = event?.participants?.find((p) => p?.venueRole === 'Home')?.name ?? null;
  const awayTeam = event?.participants?.find((p) => p?.venueRole === 'Away')?.name ?? null;
  return {
    event: event?.name ?? null,
    status: event?.status ?? null,
    market: market.name,
    subcategoryId: market.subcategoryId ?? null,
    homeTeam,
    awayTeam,
    selections: (selectionsByMarket.get(String(market.id)) ?? []).map((selection) => ({
      label: selection.label ?? null,
      participant: selection.participants?.[0]?.name ?? null,
      points: typeof selection.points === 'number' ? selection.points : null,
      oddsAmerican: normalizeAmericanOdds(selection.displayOdds?.american),
    })),
  };
});

console.log(JSON.stringify({
  url,
  eventCount: payload.events?.length ?? 0,
  marketCount: payload.markets?.length ?? 0,
  selectionCount: payload.selections?.length ?? 0,
  sample: offers.slice(0, 5),
}, null, 2));
