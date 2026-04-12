import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');

const headers = (prefer) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${url} :: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function duplicateClusterKey(event) {
  const commenceHour = event.commence_time ? new Date(event.commence_time).toISOString().slice(0, 13) : 'no-time';
  return [event.sport, event.event_date, event.home_team || '', event.away_team || '', commenceHour].join('|');
}

function chooseCanonical(cluster) {
  const slugged = cluster.filter((event) => /@.+:\d{4}-\d{2}-\d{2}T\d{2}$/i.test(event.event_id));
  if (slugged.length) return slugged[0];
  return cluster[0];
}

async function restSelect(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, { headers: headers() });
}

async function patch(pathname, body) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'PATCH',
    headers: headers('return=minimal'),
    body: JSON.stringify(body),
  });
}

async function safePatch(pathname, body) {
  try {
    await patch(pathname, body);
    return { applied: true, conflict: false };
  } catch (error) {
    if (String(error.message || '').includes('23505')) {
      return { applied: false, conflict: true };
    }
    throw error;
  }
}

async function del(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'DELETE',
    headers: headers('return=representation'),
  });
}

async function main() {
  const events = await restSelect('/goose_market_events?select=event_id,source_event_id,sport,event_date,commence_time,home_team,away_team&sport=eq.NHL&order=event_date.desc,commence_time.desc&limit=5000');

  const clusterMap = new Map();
  for (const event of events || []) {
    const key = duplicateClusterKey(event);
    if (!clusterMap.has(key)) clusterMap.set(key, []);
    clusterMap.get(key).push(event);
  }

  const duplicateClusters = [...clusterMap.values()].filter((cluster) => cluster.length > 1);
  const report = [];

  for (const cluster of duplicateClusters) {
    const canonical = chooseCanonical(cluster);
    const duplicates = cluster.filter((event) => event.event_id !== canonical.event_id);

    for (const duplicate of duplicates) {
      const eventId = encodeURIComponent(duplicate.event_id);
      const canonicalEventId = canonical.event_id;

      const [candidateRows, featureRows, decisionRows, resultRows] = await Promise.all([
        restSelect(`/goose_market_candidates?select=candidate_id,event_id&event_id=eq.${eventId}&limit=5000`),
        restSelect(`/goose_feature_rows?select=feature_row_id,event_id&event_id=eq.${eventId}&limit=5000`),
        restSelect(`/goose_decision_log?select=decision_id,event_id&event_id=eq.${eventId}&limit=5000`),
        restSelect(`/goose_market_results?select=candidate_id,event_id&event_id=eq.${eventId}&limit=5000`),
      ]);

      let candidateMoved = 0;
      let candidateConflicts = 0;
      for (const row of candidateRows || []) {
        const outcome = await safePatch(`/goose_market_candidates?candidate_id=eq.${encodeURIComponent(row.candidate_id)}`, { event_id: canonicalEventId });
        if (outcome.applied) candidateMoved += 1;
        if (outcome.conflict) candidateConflicts += 1;
      }

      let featureMoved = 0;
      let featureConflicts = 0;
      for (const row of featureRows || []) {
        const outcome = await safePatch(`/goose_feature_rows?feature_row_id=eq.${encodeURIComponent(row.feature_row_id)}`, { event_id: canonicalEventId });
        if (outcome.applied) featureMoved += 1;
        if (outcome.conflict) featureConflicts += 1;
      }

      let decisionMoved = 0;
      let decisionConflicts = 0;
      for (const row of decisionRows || []) {
        const outcome = await safePatch(`/goose_decision_log?decision_id=eq.${encodeURIComponent(row.decision_id)}`, { event_id: canonicalEventId });
        if (outcome.applied) decisionMoved += 1;
        if (outcome.conflict) decisionConflicts += 1;
      }

      let resultMoved = 0;
      let resultConflicts = 0;
      for (const row of resultRows || []) {
        const outcome = await safePatch(`/goose_market_results?candidate_id=eq.${encodeURIComponent(row.candidate_id)}`, { event_id: canonicalEventId });
        if (outcome.applied) resultMoved += 1;
        if (outcome.conflict) resultConflicts += 1;
      }

      const dependentRowsTouched = candidateMoved + featureMoved + decisionMoved + resultMoved + candidateConflicts + featureConflicts + decisionConflicts + resultConflicts;
      const duplicateStillHasDependents = (candidateRows?.length || 0) + (featureRows?.length || 0) + (decisionRows?.length || 0) + (resultRows?.length || 0) > dependentRowsTouched;
      const deletedDuplicateEvent = dependentRowsTouched > 0 && !duplicateStillHasDependents;

      if (deletedDuplicateEvent) {
        await del(`/goose_market_events?event_id=eq.${eventId}`);
      }

      report.push({
        canonical_event_id: canonicalEventId,
        removed_event_id: duplicate.event_id,
        candidate_rows_moved: candidateMoved,
        candidate_conflicts_existing_canonical: candidateConflicts,
        feature_rows_moved: featureMoved,
        feature_conflicts_existing_canonical: featureConflicts,
        decision_rows_moved: decisionMoved,
        decision_conflicts_existing_canonical: decisionConflicts,
        result_rows_moved: resultMoved,
        result_conflicts_existing_canonical: resultConflicts,
        duplicate_still_has_dependents: duplicateStillHasDependents,
        duplicate_event_deleted: deletedDuplicateEvent,
      });
    }
  }

  console.log(JSON.stringify({ ok: true, duplicate_clusters_found: duplicateClusters.length, migrated: report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
