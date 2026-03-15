"use client";

import { useEffect, useState } from "react";
import { useAppChrome } from "@/components/AppChromeProvider";
import { formatAmericanOdds } from "@/lib/my-picks";

const UNIT_OPTIONS = [1, 2, 3, 4, 5];

export default function AddPickModal() {
  const {
    pickDraft,
    closeAddPickModal,
    addPickFromDraft,
  } = useAppChrome();
  const [units, setUnits] = useState(1);

  useEffect(() => {
    if (pickDraft) {
      setUnits(1);
    }
  }, [pickDraft]);

  if (!pickDraft) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={closeAddPickModal}
        aria-label="Close add pick modal"
      />

      <div className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-[28px] border-t border-dark-border bg-[linear-gradient(180deg,#141b25_0%,#0d1118_100%)] px-4 pb-8 pt-4 shadow-[0_-20px_70px_rgba(0,0,0,0.45)]">
        <div className="mx-auto max-w-lg">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-dark-border" />

          <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
            <p className="section-heading">Add To My Picks</p>
            <h3 className="mt-2 text-lg font-semibold text-white">{pickDraft.summary}</h3>
            <p className="mt-2 text-sm text-gray-400">{pickDraft.detail}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/70 p-3">
                <p className="meta-label">League</p>
                <p className="mt-1 text-sm font-semibold text-white">{pickDraft.league}</p>
              </div>
              <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/70 p-3">
                <p className="meta-label">Odds</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatAmericanOdds(pickDraft.odds)}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
            <p className="section-heading">Units</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {UNIT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setUnits(option)}
                  className={`tap-button min-h-[48px] rounded-2xl border text-sm font-semibold ${
                    units === option
                      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                      : "border-dark-border bg-dark-bg/70 text-gray-400"
                  }`}
                >
                  {option}u
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={closeAddPickModal}
              className="tap-button inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface px-4 text-sm font-semibold text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => addPickFromDraft(pickDraft, units)}
              className="tap-button inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue"
            >
              Confirm Pick
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
