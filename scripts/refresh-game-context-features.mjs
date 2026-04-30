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

function monthEnd(dateKey) {
  const d = new Date(`${dateKey.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function minDate(a, b) {
  return a <= b ? a : b;
}

function maxDate(a, b) {
  return a >= b ? a : b;
}

function sourceRows() {
  const defaultPath = path.join(process.cwd(), 'tmp', 'goose-training-examples-chunked-2024-01-01-to-2026-04-29.json');
  const sourcePath = process.env.GOOSE_CONTEXT_SOURCE_FILE || defaultPath;
  if (!fs.existsSync(sourcePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

async function dateWindowForLeague(league, localRows) {
  const dates = localRows
    .filter((row) => String(row.league || row.sport || '').toUpperCase() === league && row.event_date)
    .map((row) => String(row.event_date));
  if (dates.length) {
    return {
      start: dates.reduce((a, b) => minDate(a, b)),
      end: dates.reduce((a, b) => maxDate(a, b)),
      source: 'local_export',
    };
  }
  const [first, last] = await Promise.all([
    sample(`ask_goose_query_layer_v1?select=event_date&league=eq.${league}&event_date=not.is.null&order=event_date.asc&limit=1`),
    sample(`ask_goose_query_layer_v1?select=event_date&league=eq.${league}&event_date=not.is.null&order=event_date.desc&limit=1`),
  ]);
  return {
    start: first[0]?.event_date ?? null,
    end: last[0]?.event_date ?? null,
    source: 'remote_sample',
  };
}

function monthWindows(start, end) {
  const windows = [];
  let cursor = `${start.slice(0, 7)}-01`;
  while (cursor <= end) {
    windows.push({ start: maxDate(cursor, start), end: minDate(monthEnd(cursor), end) });
    cursor = addDays(monthEnd(cursor), 1);
  }
  return windows;
}

function weekWindows(start, end) {
  const windows = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = minDate(addDays(cursor, 6), end);
    windows.push({ start: cursor, end: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return windows;
}

async function refreshRangeWithFallback(league, window) {
  try {
    const rows = await rpc('refresh_game_context_features_v1_range', {
      p_league: league,
      p_start_date: window.start,
      p_end_date: window.end,
    });
    return [{ ...window, rows, ok: true, mode: 'month' }];
  } catch (error) {
    const chunks = [];
    for (const week of weekWindows(window.start, window.end)) {
      try {
        const rows = await rpc('refresh_game_context_features_v1_range', {
          p_league: league,
          p_start_date: week.start,
          p_end_date: week.end,
        });
        chunks.push({ ...week, rows, ok: true, mode: 'week_retry' });
      } catch (retryError) {
        chunks.push({
          ...week,
          rows: 0,
          ok: false,
          mode: 'week_retry',
          error: retryError instanceof Error ? retryError.message : String(retryError),
        });
      }
    }
    return chunks;
  }
}

async function main() {
  const leagues = process.argv.slice(2).map((v) => v.toUpperCase());
  const targets = leagues.length ? leagues : ['NBA', 'NHL', 'MLB', 'NFL'];
  const localRows = sourceRows();
  const refreshed = {};
  for (const league of targets) {
    const dateWindow = await dateWindowForLeague(league, localRows);
    refreshed[league] = { ...dateWindow, chunks: [] };
    if (!dateWindow.start || !dateWindow.end) continue;
    for (const window of monthWindows(dateWindow.start, dateWindow.end)) {
      refreshed[league].chunks.push(...await refreshRangeWithFallback(league, window));
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
