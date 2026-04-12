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
  const ids = [
    'evt:nba:nba:los-angeles-lakers@golden-state-warriors:2026-04-10T02',
    'evt:nba:nba:philadelphia-76ers@houston-rockets:2026-04-10T00',
  ];
  const events = await q(`/goose_market_events?select=event_id,source,source_event_id,odds_api_event_id,event_date,commence_time,away_team,home_team,away_team_id,home_team_id,metadata&event_id=in.(${ids.join(',')})`);
  console.log(JSON.stringify(events, null, 2));
})();
