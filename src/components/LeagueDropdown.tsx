"use client";

import { useState, useRef, useEffect } from "react";
import { League } from "@/lib/types";
import LeagueLogo from "@/components/LeagueLogo";

const LEAGUES: Array<{ key: League; label: string }> = [
  { key: "All", label: "ALL" },
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

export default function LeagueDropdown({ active, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LEAGUES.find((l) => l.key === active) || LEAGUES[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="tap-button flex items-center gap-1.5 rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-gray-600"
      >
        {current.key === "All" ? <span>🪿</span> : <LeagueLogo league={current.key} size={18} />}
        <span>{current.label}</span>
        <svg className={`w-3 h-3 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-xl border border-dark-border bg-dark-surface shadow-[0_8px_30px_rgba(0,0,0,0.4)] overflow-hidden">
          {LEAGUES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                active === key
                  ? "bg-accent-blue/10 text-accent-blue font-semibold"
                  : "text-gray-300 hover:bg-dark-bg"
              }`}
            >
              {key === "All" ? <span>🪿</span> : <LeagueLogo league={key} size={18} />}
              <span>{label}</span>
              {active === key && <span className="ml-auto text-accent-blue">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
