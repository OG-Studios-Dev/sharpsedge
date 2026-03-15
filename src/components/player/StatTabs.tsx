"use client";

import { PlayerResearchStatOption } from "@/lib/player-research";

type StatTabsProps = {
  options: PlayerResearchStatOption[];
  activeKey: string;
  onChange: (nextKey: string) => void;
};

export default function StatTabs({ options, activeKey, onChange }: StatTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {options.map((option) => {
        const active = option.key === activeKey;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${
              active
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                : "border-dark-border bg-dark-bg/70 text-gray-400"
            }`}
          >
            {option.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
