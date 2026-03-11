"use client";

import { League } from "@/lib/types";

const LEAGUES: Array<{ key: League; icon: string; label: string }> = [
  { key: "All", icon: "🪿", label: "All" },
  { key: "NHL", icon: "🏒", label: "NHL" },
  { key: "NBA", icon: "🏀", label: "NBA" },
];

interface Props {
  active: League;
  onChange: (league: League) => void;
}

export default function LeagueSwitcher({ active, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {LEAGUES.map(({ key, icon, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all border ${
              isActive
                ? "bg-accent-blue text-white border-accent-blue shadow-[0_0_10px_rgba(74,158,255,0.25)]"
                : "bg-dark-surface border-dark-border text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
