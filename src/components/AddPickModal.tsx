"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (pickDraft) {
      setUnits(1);
      setSaving(false);
      setError(null);
      setSaved(false);
    }
  }, [pickDraft]);

  if (!pickDraft || !mounted) return null;

  async function handleSave() {
    if (saving || !pickDraft) return;
    const draft = pickDraft;
    setSaving(true);
    setError(null);

    const result = await addPickFromDraft(draft, units);
    if (!result.ok) {
      setSaving(false);
      setError(result.error || "Failed to save pick");
      return;
    }

    setSaved(true);
    setSaving(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 px-3 pb-24 pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        onClick={saving ? undefined : closeAddPickModal}
        aria-label="Close add pick modal"
      />

      <div className="relative z-[131] mb-0 flex w-full max-w-md animate-slide-up flex-col overflow-hidden rounded-[24px] border border-dark-border bg-[linear-gradient(180deg,#141b25_0%,#0d1118_100%)] shadow-[0_20px_70px_rgba(0,0,0,0.45)] max-h-[min(62dvh,520px)] sm:my-4 sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto flex h-full w-full min-h-0 flex-col px-4 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-dark-border" />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            <div className="rounded-3xl border border-dark-border bg-dark-surface/70 p-4">
              {error && (
                <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200">
                  {error}
                </div>
              )}
              {saved && (
                <div className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
                  Pick saved.
                </div>
              )}
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
          </div>

          <div className="shrink-0 border-t border-dark-border/60 bg-[linear-gradient(180deg,rgba(13,17,24,0)_0%,rgba(13,17,24,0.96)_18%,rgba(13,17,24,1)_100%)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeAddPickModal}
                disabled={saving}
                className="tap-button inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="tap-button inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Pick"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
