"use client";

import { useMemo, useState } from "react";
import type { MyPickEntry } from "@/lib/my-picks";
import { combineAmericanOdds, formatAmericanOdds } from "@/lib/my-picks";

type Props = {
  availablePicks: MyPickEntry[];
  onCreate: (pickIds: string[], units: number) => void;
};

const UNIT_OPTIONS = [1, 2, 3, 4, 5];

export default function ParlayBuilder({ availablePicks, onCreate }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [units, setUnits] = useState(1);
  const selectedPicks = useMemo(
    () => availablePicks.filter((pick) => selectedIds.includes(pick.id)),
    [availablePicks, selectedIds],
  );
  const combinedOdds = selectedPicks.length > 1
    ? combineAmericanOdds(selectedPicks.map((pick) => pick.odds))
    : null;

  function togglePick(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= 4) return current;
      return [...current, id];
    });
  }

  return (
    <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-heading">Parlay Builder</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Build up to 4 legs</h2>
          <p className="mt-1 text-sm text-gray-400">Pick from your active singles. Parlays auto-resolve as each leg settles.</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 px-4 py-3 text-center">
          <p className="meta-label">Combined Odds</p>
          <p className="mt-1 text-sm font-bold text-white">{combinedOdds ? formatAmericanOdds(combinedOdds) : "Select 2+"}</p>
        </div>
      </div>

      {availablePicks.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
          Add a few active picks first, then combine them here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {availablePicks.map((pick) => {
              const selected = selectedIds.includes(pick.id);
              return (
                <button
                  key={pick.id}
                  type="button"
                  onClick={() => togglePick(pick.id)}
                  className={`tap-button rounded-2xl border p-3 text-left ${
                    selected
                      ? "border-accent-blue/40 bg-accent-blue/10"
                      : "border-dark-border bg-dark-bg/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="card-title truncate">{pick.summary}</p>
                      <p className="mt-1 text-xs text-gray-500">{pick.detail}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                      selected ? "bg-accent-blue text-white" : "bg-dark-surface text-gray-400"
                    }`}>
                      {selected ? "Leg" : "Add"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="section-heading">Selected Legs</p>
              <p className="text-xs text-gray-500">{selectedPicks.length}/4</p>
            </div>
            {selectedPicks.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Choose at least two picks to build the parlay.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {selectedPicks.map((pick, index) => (
                  <div key={pick.id} className="flex items-center justify-between gap-3 rounded-xl border border-dark-border/70 bg-dark-surface/70 px-3 py-2">
                    <p className="text-sm text-white">{index + 1}. {pick.summary}</p>
                    <p className="text-xs font-semibold text-accent-blue">{formatAmericanOdds(pick.odds)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {UNIT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setUnits(option)}
                  className={`tap-button rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    units === option
                      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                      : "border-dark-border bg-dark-surface text-gray-400"
                  }`}
                >
                  {option}u
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                onCreate(selectedIds, units);
                setSelectedIds([]);
                setUnits(1);
              }}
              disabled={selectedPicks.length < 2}
              className="tap-button inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Parlay
            </button>
          </div>
        </>
      )}
    </section>
  );
}
