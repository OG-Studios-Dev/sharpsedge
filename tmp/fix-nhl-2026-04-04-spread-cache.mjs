import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const base = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
async function rest(path, options = {}) {
  const res = await fetch(`${base}${path}`, { headers: { ...headers, ...(options.headers || {}) }, ...options });
  const text = await res.text();
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} ${res.status}: ${text.slice(0,500)}`);
  return text ? JSON.parse(text) : null;
}
function lineFrom(row) {
  const book = row.book || row.sportsbook;
  const rp = row.raw_payload || {};
  const candidates = [rp?.byBookmaker?.[book]?.spread, rp.bookSpread, rp.fairSpread, rp.closeBookSpread, rp.closeFairSpread, rp.openBookSpread, rp.openFairSpread];
  for (const v of candidates) {
    if (v == null) continue;
    const n = Number(String(v).replace(/[^0-9+.-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}
const q = new URLSearchParams({
  select: 'candidate_id,book,sportsbook,raw_payload',
  sport: 'eq.NHL',
  event_date: 'eq.2026-04-04',
  market_type: 'eq.spread',
  submarket_type: 'eq.Spread',
  limit: '1000'
});
const rows = await rest(`/rest/v1/goose_market_candidates?${q}`);
let patched = 0, missing = [];
for (const row of rows) {
  const line = lineFrom(row);
  if (line == null) { missing.push(row.candidate_id); continue; }
  await rest(`/rest/v1/ask_goose_nhl_candidate_cache_v1?candidate_id=eq.${encodeURIComponent(row.candidate_id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ line })
  });
  patched++;
}
console.log(JSON.stringify({sourceRows: rows.length, patched, missing: missing.length}, null, 2));
