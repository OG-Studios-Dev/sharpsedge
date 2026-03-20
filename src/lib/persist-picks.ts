import type { AIPick } from "@/lib/types";
import { storeDailyPickSlate } from "@/lib/pick-history-store";

/**
 * Backward-compatible wrapper for authoritative daily slate persistence.
 * Original pick generation should lock a date/league once, then replay it.
 */
export async function persistPicksToSupabase(picks: AIPick[]): Promise<void> {
  if (!picks.length) return;

  const date = picks[0]?.date;
  const league = picks[0]?.league || "NHL";

  if (!date) {
    throw new Error("Cannot persist picks without a date.");
  }

  if (!picks.every((pick) => pick.date === date && (pick.league || "NHL") === league)) {
    throw new Error("persistPicksToSupabase expects a single date/league slate.");
  }

  await storeDailyPickSlate(picks, {
    date,
    league,
  });
}
