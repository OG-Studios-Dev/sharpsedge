import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    }),
);

for (const [k, v] of Object.entries(env)) {
  if (!(k in process.env)) process.env[k] = v.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

const [{ getDateKey, MLB_TIME_ZONE }, { getStoredPickSlate }, { getMLBDashboardData }, { selectMLBTopPicks }] = await Promise.all([
  import('../src/lib/date-utils.ts'),
  import('../src/lib/pick-history-store.ts'),
  import('../src/lib/mlb-live-data.ts'),
  import('../src/lib/picks-engine.ts'),
]);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');

const date = getDateKey(new Date(), MLB_TIME_ZONE);
const locked = await getStoredPickSlate(date, 'MLB');
const data = await getMLBDashboardData();

const todayIds = new Set(
  (data.schedule || [])
    .filter((game) => String((game.date || '').slice(0, 10)) === date && game.status !== 'Final')
    .map((game) => String(game.id)),
);

const props = todayIds.size > 0
  ? (data.props || []).filter((prop) => !prop.gameId || todayIds.has(String(prop.gameId)))
  : (data.props || []);
const teamTrends = todayIds.size > 0
  ? (data.teamTrends || []).filter((trend) => !trend.gameId || todayIds.has(String(trend.gameId)))
  : (data.teamTrends || []);

const fresh = selectMLBTopPicks(props, teamTrends, date).map((pick) => ({ ...pick, league: pick.league ?? 'MLB' }));

console.log(JSON.stringify({
  date,
  lockedCount: locked.picks.length,
  freshCount: fresh.length,
  locked: locked.picks.map((pick) => ({ id: pick.id, label: pick.pickLabel, hitRate: pick.hitRate, edge: pick.edge, gameId: pick.gameId })),
  fresh: fresh.map((pick) => ({ id: pick.id, label: pick.pickLabel, hitRate: pick.hitRate, edge: pick.edge, gameId: pick.gameId })),
}, null, 2));

const freshIds = new Set(fresh.map((pick) => pick.id));
const staleRows = locked.records.filter((row) => !freshIds.has(row.id));

if (locked.records.length === 0) {
  console.log('No locked MLB rows found for today. Nothing to repair.');
  process.exit(0);
}

if (staleRows.length === 0 && fresh.length === locked.records.length) {
  console.log('Stored MLB slate already matches tightened gate.');
  process.exit(0);
}

async function pg(path, init = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

if (staleRows.length > 0) {
  const ids = staleRows.map((row) => row.id);
  const filters = ids.map((id) => `id.eq.${encodeURIComponent(id)}`).join(',');
  await pg(`/pick_history?or=(${filters})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

await pg(`/pick_slates?date=eq.${encodeURIComponent(date)}&league=eq.MLB`, {
  method: 'PATCH',
  body: JSON.stringify({
    pick_count: fresh.length,
    status: fresh.length > 0 ? 'locked' : 'incomplete',
    provenance: 'manual_repair',
    provenance_note: 'Re-filtered before first pitch after Marco raised MLB production gate to 72% hit rate and 12% edge on 2026-04-03.',
    status_note: fresh.length > 0
      ? `Manual repair: removed ${staleRows.length} MLB pick(s) that failed tightened 72%/12% production gate.`
      : 'Manual repair: all prior MLB picks removed after tightened 72%/12% production gate left no qualifying plays.',
    updated_at: new Date().toISOString(),
  }),
});

console.log(JSON.stringify({ removed: staleRows.length, remaining: fresh.length }, null, 2));
