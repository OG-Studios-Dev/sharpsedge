import { AIPick } from "@/lib/types";

export type PickRecord = {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  profitUnits: number;
};

export function computePickRecord(picks: AIPick[]): PickRecord {
  return picks.reduce<PickRecord>((record, pick) => {
    if (pick.result === "win") {
      record.wins += 1;
      record.profitUnits += pick.units;
    } else if (pick.result === "loss") {
      record.losses += 1;
      record.profitUnits -= pick.units;
    } else if (pick.result === "push") {
      record.pushes += 1;
    } else {
      record.pending += 1;
    }

    return record;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });
}
