"use client";

import { League } from "@/lib/types";
import LeagueLogo from "@/components/LeagueLogo";

const LEAGUES: Array<{ key: League; label: string }> = [
  { key: "All", label: "All" },
  { key: "NHL", label: "NHL" },
  { key: "NBA", label: "NBA" },
  { key: "MLB", label: "MLB" },
  { key: "NFL", label: "NFL" },
  { key: "EPL", label: "EPL" },
  { key: "Serie A", label: "Serie A" },
  { key: "PGA", label: "PGA" },
];

interface Props {
  active: League;
  onChange: (league: League) => void;
}

export default function LeagueSwitcher({ active, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {LEAGUES.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all border ${
              isActive
                ? "bg-accent-blue text-white border-accent-blue shadow-[0_0_10px_rgba(74,158,255,0.25)]"
                : "bg-dark-surface border-dark-border text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {key === "All" ? <span>🪿</span> : <LeagueLogo league={key} size={18} />}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
