import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Missing Supabase env');

async function fetchJson(path) {
  const res = await fetch(`${base}/rest/v1${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const k = row[key] ?? 'UNKNOWN';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

(async () => {
  const rows = await fetchJson('/goose_market_results?select=candidate_id,result,integrity_status,settlement_ts,grade_source,grading_notes,event_id,goose_market_candidates!inner(sport,market_type,book,event_date)&integrity_status=eq.manual_review&order=settlement_ts.desc&limit=5000');

  const expanded = (rows || []).map((row) => {
    const cand = Array.isArray(row.goose_market_candidates) ? row.goose_market_candidates[0] : row.goose_market_candidates;
    return {
      candidate_id: row.candidate_id,
      result: row.result,
      integrity_status: row.integrity_status,
      settlement_ts: row.settlement_ts,
      grade_source: row.grade_source,
      grading_notes: row.grading_notes,
      event_id: row.event_id,
      sport: cand?.sport || 'UNKNOWN',
      market_type: cand?.market_type || 'UNKNOWN',
      book: cand?.book || 'UNKNOWN',
      event_date: cand?.event_date || null,
    };
  });

  const report = {
    generated_at: new Date().toISOString(),
    total_manual_review_rows: expanded.length,
    by_sport: countBy(expanded, 'sport'),
    by_market_type: countBy(expanded, 'market_type'),
    by_book: countBy(expanded, 'book'),
    by_grade_source: countBy(expanded, 'grade_source'),
    recent_examples: expanded.slice(0, 25),
  };

  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
