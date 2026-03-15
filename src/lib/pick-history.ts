import type { PickHistoryRecord } from "@/lib/supabase-types";
import { calculatePayout } from "@/lib/pick-record";

export type PickHistorySummary = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  profitUnits: number;
};

export function computePickHistorySummary(records: PickHistoryRecord[]): PickHistorySummary {
  return records.reduce<PickHistorySummary>((summary, record) => {
    const units = typeof record.units === "number" && Number.isFinite(record.units) ? record.units : 1;
    const odds = typeof record.odds === "number" ? record.odds : undefined;

    if (record.result === "win") {
      summary.wins += 1;
      summary.profitUnits += calculatePayout(odds, units);
    } else if (record.result === "loss") {
      summary.losses += 1;
      summary.profitUnits -= units;
    } else if (record.result === "push") {
      summary.pushes += 1;
    } else {
      summary.pending += 1;
    }

    return summary;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });
}
