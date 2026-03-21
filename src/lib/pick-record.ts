import { AIPick } from "@/lib/types";

export type PickRecord = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  profitUnits: number;
};

export type PickWinRateStats = {
  settled: number;
  winPct: number;
};

/**
 * Calculate payout based on American odds.
 * Negative odds (favorite): payout = 100 / |odds| × units
 * Positive odds (underdog): payout = odds / 100 × units
 */
function calculatePayout(odds: number | undefined, units: number): number {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return units; // fallback to flat unit if no odds
  }
  if (odds < 0) {
    // Favorite: bet 110 to win 100 → payout = 100/110 = 0.91
    return Number(((100 / Math.abs(odds)) * units).toFixed(2));
  }
  // Underdog: bet 100 to win 110 → payout = 110/100 = 1.10
  return Number(((odds / 100) * units).toFixed(2));
}

export function computePickRecord(picks: AIPick[]): PickRecord {
  return picks.reduce<PickRecord>((record, pick) => {
    const units = pick.units || 1;

    if (pick.result === "win") {
      record.wins += 1;
      record.profitUnits += calculatePayout(pick.odds, units);
    } else if (pick.result === "loss") {
      record.losses += 1;
      record.profitUnits -= units; // always lose the stake
    } else if (pick.result === "push") {
      record.pushes += 1;
      // push = money returned, no profit no loss
    } else {
      record.pending += 1;
    }

    return record;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });
}

export function computePickWinRateStats(record: { wins: number; losses: number }): PickWinRateStats {
  const settled = record.wins + record.losses;
  return {
    settled,
    winPct: settled > 0 ? Number(((record.wins / settled) * 100).toFixed(1)) : 0,
  };
}

/** Export for use in other modules */
export { calculatePayout };
