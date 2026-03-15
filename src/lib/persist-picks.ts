import type { AIPick } from "@/lib/types";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/supabase-shared";

/**
 * Persist AI picks to Supabase pick_history table.
 * Uses service role key for server-side writes.
 * Upserts by ID to avoid duplicates.
 */
export async function persistPicksToSupabase(picks: AIPick[]): Promise<void> {
  if (!picks.length) return;

  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();

  const rows = picks.map((pick) => ({
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

  try {
    await fetch(`${url}/rest/v1/pick_history`, {
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
  } catch (err) {
    console.warn("[persist-picks] failed to write to Supabase:", err);
  }
}
