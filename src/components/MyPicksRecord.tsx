"use client";

import { calculatePayout } from "@/lib/pick-record";
import type { MyPickEntry } from "@/lib/my-picks";

function computeRecord(picks: MyPickEntry[]) {
  return picks.reduce((summary, pick) => {
    if (pick.result === "win") {
      summary.wins += 1;
      summary.profitUnits += calculatePayout(pick.odds, pick.units);
    } else if (pick.result === "loss") {
      summary.losses += 1;
      summary.profitUnits -= pick.units;
    } else if (pick.result === "push") {
      summary.pushes += 1;
    } else {
      summary.pending += 1;
    }

    return summary;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });
}

export default function MyPicksRecord({ picks }: { picks: MyPickEntry[] }) {
  const record = computeRecord(picks);
  const settled = record.wins + record.losses;
  const winPct = settled > 0 ? (record.wins / settled) * 100 : 0;

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-heading">My Record</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Personal tracking board</h2>
          <p className="mt-1 text-sm text-gray-400">Wins, losses, pushes, and unit profit across singles and parlays.</p>
        </div>
        <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-center">
          <p className="meta-label text-accent-blue">Win %</p>
          <p className="mt-1 text-xl font-bold text-white">{winPct.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Wins</p>
          <p className="mt-1 text-sm font-bold text-emerald-400">{record.wins}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Losses</p>
          <p className="mt-1 text-sm font-bold text-red-400">{record.losses}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Pushes</p>
          <p className="mt-1 text-sm font-bold text-yellow-300">{record.pushes}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Pending</p>
          <p className="mt-1 text-sm font-bold text-gray-300">{record.pending}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Profit</p>
          <p className={`mt-1 text-sm font-bold ${record.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {record.profitUnits >= 0 ? "+" : ""}{record.profitUnits.toFixed(2)}u
          </p>
        </div>
      </div>
    </section>
  );
}
