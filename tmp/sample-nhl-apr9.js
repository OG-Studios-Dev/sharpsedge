const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function q(path) {
  const r = await fetch(base + `/rest/v1${path}`, { headers });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return JSON.parse(t);
}

(async () => {
  const rows = await q(`/goose_market_results?select=event_id,grading_notes,source_payload,goose_market_candidates!inner(market_type,book,event_date)&integrity_status=eq.manual_review&goose_market_candidates.event_date=eq.2026-04-09&limit=40`);
  const ids = [...new Set(rows.map((r) => r.event_id))].slice(0, 12);
  const events = await q(`/goose_market_events?select=event_id,source,source_event_id,odds_api_event_id,event_date,commence_time,away_team,home_team,away_team_id,home_team_id,metadata&event_id=in.(${ids.join(',')})`);
  console.log(JSON.stringify({ sampleEventIds: ids, events }, null, 2));
})();
