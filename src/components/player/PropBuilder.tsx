"use client";

import { PlayerResearchStatOption } from "@/lib/player-research";

type PropBuilderProps = {
  options: PlayerResearchStatOption[];
  activeStat: string;
  direction: "Over" | "Under";
  line: number;
  hitRate: number | null;
  onStatChange: (nextStat: string) => void;
  onDirectionChange: (nextDirection: "Over" | "Under") => void;
  onLineAdjust: (delta: number) => void;
};

function formatHitRate(hitRate: number | null) {
  if (hitRate === null) return "No sample";
  return `${Math.round(hitRate)}% hit rate`;
}

export default function PropBuilder({
  options,
  activeStat,
  direction,
  line,
  hitRate,
  onStatChange,
  onDirectionChange,
  onLineAdjust,
}: PropBuilderProps) {
  return (
    <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Prop Builder</p>
          <p className="mt-1 text-sm text-gray-300">{formatHitRate(hitRate)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Stat</span>
          <select
            value={activeStat}
            onChange={(event) => onStatChange(event.target.value)}
            className="min-h-[44px] w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 text-sm text-white outline-none transition-colors focus:border-emerald-400/50"
          >
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Direction</span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "Over", label: "At Least" },
              { value: "Under", label: "Under" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onDirectionChange(option.value)}
                className={`min-h-[44px] rounded-2xl border px-3 text-sm font-semibold transition-colors ${
                  direction === option.value
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border-dark-border bg-dark-bg/70 text-gray-400"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Line</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onLineAdjust(-0.5)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-dark-border bg-dark-bg/70 text-lg font-semibold text-white"
            >
              −
            </button>
            <div className="inline-flex min-h-[44px] min-w-[84px] items-center justify-center rounded-2xl border border-dark-border bg-dark-bg/80 px-4 text-lg font-semibold text-white">
              {line.toFixed(1)}
            </div>
            <button
              type="button"
              onClick={() => onLineAdjust(0.5)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-dark-border bg-dark-bg/70 text-lg font-semibold text-white"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
