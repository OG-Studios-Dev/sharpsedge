import type { AIPick } from "@/lib/types";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/supabase-shared";

function buildPrimaryRows(picks: AIPick[]) {
  return picks.map((pick) => ({
    id: pick.id,
    date: pick.date,
    league: pick.league || "NHL",
    pick_type: pick.type,
    player_name: pick.playerName || null,
    team: pick.team,
    opponent: pick.opponent || null,
    pick_label: pick.pickLabel,
    hit_rate: typeof pick.hitRate === "number" ? pick.hitRate : null,
    edge: typeof pick.edge === "number" ? pick.edge : null,
    odds: typeof pick.odds === "number" ? pick.odds : null,
    book: pick.book || null,
    result: pick.result || "pending",
    game_id: pick.gameId || null,
    reasoning: pick.reasoning || null,
    confidence: typeof pick.confidence === "number" ? pick.confidence : null,
    units: pick.units || 1,
  }));
}

function buildLegacyRows(picks: AIPick[]) {
  return picks.map((pick) => ({
    pick_id: pick.id,
    date: pick.date,
    league: pick.league || "NHL",
    type: pick.type,
    player_name: pick.playerName || "",
    team: pick.team,
    opponent: pick.opponent || null,
    pick_label: pick.pickLabel,
    hit_rate: typeof pick.hitRate === "number" ? pick.hitRate : null,
    edge: typeof pick.edge === "number" ? pick.edge : null,
    odds: typeof pick.odds === "number" ? pick.odds : null,
    book: pick.book || null,
    result: pick.result || "pending",
    game_id: pick.gameId || null,
    reasoning: pick.reasoning || null,
    confidence: typeof pick.confidence === "number" ? pick.confidence : null,
    units: pick.units || 1,
  }));
}

async function postRows(url: string, key: string, rows: unknown) {
  return fetch(`${url}/rest/v1/pick_history`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
}

/**
 * Persist AI picks to Supabase pick_history table.
 * Uses service role key for server-side writes.
 * Supports both the current schema (`pick_type`) and the legacy live schema (`type` + `pick_id`).
 */
export async function persistPicksToSupabase(picks: AIPick[]): Promise<void> {
  if (!picks.length) return;

  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();

  let response = await postRows(url, key, buildPrimaryRows(picks));
  if (response.ok) return;

  const errorText = await response.text();
  const shouldRetryLegacy = response.status === 400 && (
    errorText.includes("pick_type")
    || errorText.includes("schema cache")
    || errorText.includes("Could not find the 'pick_type' column")
  );

  if (shouldRetryLegacy) {
    response = await postRows(url, key, buildLegacyRows(picks));
    if (response.ok) return;
    throw new Error(`Supabase legacy pick_history write failed (${response.status})`);
  }

  throw new Error(`Supabase pick_history write failed (${response.status})`);
}
