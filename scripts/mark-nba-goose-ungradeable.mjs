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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const REASON = 'Marked ungradeable: missing durable event ID and no verified quarter-score source available.';
const SOURCE = 'manual-audit-nba-goose';

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function main() {
  const selectUrl = `${base}/rest/v1/system_qualifiers?select=id,system_id,system_name,game_date,matchup,settlement_status,outcome,grading_notes,provenance&system_id=eq.nba-goose-system&league=eq.NBA&settlement_status=eq.pending&order=game_date.asc`;
  const rows = await fetchJson(selectUrl, { cache: 'no-store' });

  const targets = (rows || []).filter((row) => {
    const p = row.provenance || {};
    const hasDurable = Boolean(p.espnEventId || p.apiSportsGameId || p.sportsDataGameId || p.oddsEventId || p.eventId || p.source_event_id || p.sourceEventId);
    return !hasDurable;
  });

  console.log(JSON.stringify({ pending_nba_goose: rows?.length || 0, targeted_without_durable_id: targets.length, target_ids: targets.map(r => r.id) }, null, 2));

  for (const row of targets) {
    const patchUrl = `${base}/rest/v1/system_qualifiers?id=eq.${encodeURIComponent(row.id)}`;
    await fetchJson(patchUrl, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        outcome: 'ungradeable',
        settlement_status: 'ungradeable',
        net_units: null,
        settled_at: new Date().toISOString(),
        graded_at: new Date().toISOString(),
        grading_source: SOURCE,
        grading_notes: REASON,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  const verifyUrl = `${base}/rest/v1/system_qualifiers?select=id,settlement_status,outcome,grading_source,grading_notes&system_id=eq.nba-goose-system&league=eq.NBA&or=(settlement_status.eq.pending,settlement_status.eq.ungradeable)&order=game_date.asc`;
  const verify = await fetchJson(verifyUrl, { cache: 'no-store' });
  console.log(JSON.stringify({ post_verify: verify }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
