import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing Supabase env vars');

const apiBase = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

function normalizeTeam(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function teamNameVariants(value) {
  const raw = String(value ?? '').trim();
  const normalized = normalizeTeam(raw);
  const compact = normalized.replace(/ /g, '');
  const parts = normalized.split(/\s+/).filter(Boolean);
  const variants = new Set();
  if (raw) variants.add(raw.toLowerCase());
  if (normalized) variants.add(normalized);
  if (compact) variants.add(compact);
  if (parts.length) {
    variants.add(parts[0]);
    variants.add(parts[parts.length - 1]);
    variants.add(parts.slice(-2).join(' '));
    variants.add(parts.slice(-2).join(''));
  }
  return Array.from(variants).filter(Boolean);
}
function marketCompatible(qualifierMarket, candidateMarket) {
  const qm = String(qualifierMarket ?? '').toLowerCase();
  const cm = String(candidateMarket ?? '').toLowerCase();
  return !qm || qm === cm || (qm === 'moneyline' && cm === 'moneyline') || (qm === 'total' && cm.includes('total'));
}
function matches(qualifier, candidate) {
  if (qualifier.league && qualifier.league.toUpperCase() !== String(candidate.league).toUpperCase()) return false;
  if (!marketCompatible(qualifier.market_type, candidate.market_type)) return false;

  const participant = new Set(teamNameVariants(candidate.participant_name || candidate.side));
  const opponent = new Set(teamNameVariants(candidate.opponent_name));
  const qualified = teamNameVariants(qualifier.qualified_team || qualifier.action_side);
  const opp = teamNameVariants(qualifier.opponent_team);
  const home = teamNameVariants(qualifier.home_team);
  const road = teamNameVariants(qualifier.road_team);

  const participantMatch = qualified.some((x) => participant.has(x)) || home.some((x) => participant.has(x)) || road.some((x) => participant.has(x));
  const opponentMatch = opp.some((x) => opponent.has(x)) || home.some((x) => opponent.has(x)) || road.some((x) => opponent.has(x));

  if (String(candidate.market_type).includes('total')) {
    return String(candidate.side ?? '').toLowerCase() === String(qualifier.action_side ?? '').toLowerCase()
      && (participantMatch || opponentMatch || home.some((x) => participant.has(x) || opponent.has(x)) || road.some((x) => participant.has(x) || opponent.has(x)));
  }

  return participantMatch;
}

async function rest(pathname, options = {}) {
  const res = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`REST ${res.status} ${pathname}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

const candidateRows = await rest('/goose_market_candidates?select=candidate_id,event_id,sport,league,event_date,market_type,participant_name,opponent_name,side,line,odds,book,capture_ts,snapshot_id,event_snapshot_id,source&order=event_date.desc,capture_ts.desc&limit=5000');
const featureRows = await rest('/goose_feature_rows?select=*&order=generated_ts.desc&limit=5000');
const qualifierRows = await rest('/system_qualifiers?select=id,system_id,system_slug,system_name,game_date,logged_at,qualified_team,opponent_team,league,market_type,action_side,home_team,road_team&order=game_date.desc&limit=1000');

const featureByCandidate = new Map(featureRows.map((row) => [row.candidate_id, row]));
const refreshed = [];
for (const candidate of candidateRows) {
  const feature = featureByCandidate.get(candidate.candidate_id);
  if (!feature) continue;
  const matchingQualifiers = qualifierRows.filter((qualifier) => qualifier.game_date === candidate.event_date && matches(qualifier, candidate));
  refreshed.push({
    ...feature,
    feature_payload: {
      ...(feature.feature_payload || {}),
      participant_key_fallback: candidate.participant_name || candidate.side,
    },
    system_flags: {
      qualifier_count: matchingQualifiers.length,
      systems: matchingQualifiers.map((qualifier) => ({
        system_id: qualifier.system_id,
        system_slug: qualifier.system_slug,
        system_name: qualifier.system_name,
        action_side: qualifier.action_side,
        market_type: qualifier.market_type,
        logged_at: qualifier.logged_at,
      })),
    },
    source_chain: [
      ...(Array.isArray(feature.source_chain) ? feature.source_chain.filter((item) => item?.source !== 'system_qualifiers') : []),
      ...matchingQualifiers.map((qualifier) => ({
        source: 'system_qualifiers',
        qualifier_id: qualifier.id,
        system_slug: qualifier.system_slug,
      })),
    ],
  });
}

if (refreshed.length) {
  await rest('/goose_feature_rows?on_conflict=feature_row_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(refreshed),
  });
}

const report = {
  updated_feature_rows: refreshed.length,
  rows_with_qualifiers: refreshed.filter((row) => Number(row.system_flags?.qualifier_count ?? 0) > 0).length,
  top_examples: refreshed.filter((row) => Number(row.system_flags?.qualifier_count ?? 0) > 0).slice(0, 10).map((row) => ({
    feature_row_id: row.feature_row_id,
    qualifier_count: row.system_flags.qualifier_count,
    systems: row.system_flags.systems,
  })),
};

fs.writeFileSync(path.join(process.cwd(), 'tmp', 'goose2-feature-qualifier-refresh-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
