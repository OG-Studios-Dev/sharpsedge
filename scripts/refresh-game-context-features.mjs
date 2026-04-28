import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`RPC ${name} failed ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function count(pathname) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method: 'HEAD',
    headers: headers({ Prefer: 'count=exact,head=true' }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Count failed ${response.status}: ${text.slice(0, 300)}`);
  }
  const range = response.headers.get('content-range');
  return range ? Number(range.split('/')[1] || 0) : 0;
}

async function sample(pathname) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, { headers: headers() });
  const text = await response.text();
  if (!response.ok) throw new Error(`Sample failed ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

function addDays(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a, b) {
  return a <= b ? a : b;
}

async function oneDate(league, dir) {
  const rows = await sample(`ask_goose_query_layer_v1?select=event_date&league=eq.${league}&event_date=not.is.null&order=event_date.${dir}&limit=1`);
  return rows[0]?.event_date ?? null;
}

async function main() {
  const leagues = process.argv.slice(2).map((v) => v.toUpperCase());
  const targets = leagues.length ? leagues : ['NBA', 'NHL', 'MLB', 'NFL'];
  const chunkDays = Number(process.env.GAME_CONTEXT_CHUNK_DAYS || 14);
  const refreshed = {};
  for (const league of targets) {
    const start = await oneDate(league, 'asc');
    const end = await oneDate(league, 'desc');
    refreshed[league] = { start, end, chunks: [] };
    if (!start || !end) continue;
    let cursor = start;
    while (cursor <= end) {
      const chunkEnd = minDate(addDays(cursor, chunkDays - 1), end);
      const rows = await rpc('refresh_game_context_features_v1_range', {
        p_league: league,
        p_start_date: cursor,
        p_end_date: chunkEnd,
      });
      refreshed[league].chunks.push({ start: cursor, end: chunkEnd, rows });
      cursor = addDays(chunkEnd, 1);
    }
  }
  const audit = {};
  for (const league of targets) {
    audit[league] = {
      contextRows: await count(`game_context_features_v1?select=canonical_game_id&league=eq.${league}`),
      askRowsWithPct: await count(`ask_goose_query_layer_v1?select=candidate_id&league=eq.${league}&team_win_pct_pre_game=not.is.null`),
      homeDogAbove500Rows: await count(`ask_goose_query_layer_v1?select=candidate_id&league=eq.${league}&is_home_underdog=eq.true&team_above_500_pre_game=eq.true`),
      sample: await sample(`game_context_features_v1?select=league,event_date,team_name,team_role,team_wins_pre_game,team_losses_pre_game,team_win_pct_pre_game,team_above_500_pre_game,is_underdog,is_home_underdog,team_league_rank_pre_game&league=eq.${league}&team_win_pct_pre_game=not.is.null&order=event_date.desc&limit=3`),
    };
  }
  console.log(JSON.stringify({ ok: true, refreshed, audit }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
