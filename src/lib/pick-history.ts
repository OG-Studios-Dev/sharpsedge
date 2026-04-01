import type { PickHistoryRecord } from "@/lib/supabase-types";
import { calculatePayout } from "@/lib/pick-record";

export type PickHistorySummary = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  profitUnits: number;
};

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function computePickHistorySummary(records: PickHistoryRecord[]): PickHistorySummary {
  const summary = records.reduce<PickHistorySummary>((acc, record) => {
    // Always treat units as a positive stake. Negative values (e.g. -1) are a
    // data anomaly where P&L was stored instead of the stake amount. Clamping to
    // a minimum of 1 prevents double-negatives in the loss calculation below.
    const units = typeof record.units === "number" && Number.isFinite(record.units) && record.units > 0 ? record.units : 1;
    const odds = typeof record.odds === "number" ? record.odds : undefined;

    if (record.result === "win") {
      acc.wins += 1;
      acc.profitUnits += calculatePayout(odds, units);
    } else if (record.result === "loss") {
      acc.losses += 1;
      acc.profitUnits -= units;
    } else if (record.result === "push") {
      acc.pushes += 1;
    } else {
      acc.pending += 1;
    }

    return acc;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });

  return {
    ...summary,
    profitUnits: roundToTwo(summary.profitUnits),
  };
}
