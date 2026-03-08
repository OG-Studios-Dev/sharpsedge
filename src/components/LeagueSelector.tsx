"use client";

import { useState } from "react";
import { League } from "@/lib/types";
import { leagueCategories } from "@/data/seed";
import { leagueMeta } from "@/lib/league-meta";

type Props = {
  selected: League;
  onSelect: (league: League) => void;
};

export default function LeagueSelector({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark-surface border border-dark-border text-sm font-medium text-white hover:bg-dark-card transition-colors"
      >
        <span>{leagueMeta[selected]?.icon}</span>
        <span>{selected}</span>
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg bg-dark-card rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-dark-card z-10 flex items-center justify-between px-5 py-4 border-b border-dark-border">
              <button onClick={() => setOpen(false)} className="text-accent-blue text-sm font-medium">
                Close
              </button>
              <h2 className="text-white font-semibold">Select League</h2>
              <div className="w-10" />
            </div>
            <div className="px-5 pb-8">
              {leagueCategories.map((cat) => (
                <div key={cat.name}>
                  <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mt-5 mb-2">
                    {cat.name}
                  </h3>
                  {cat.leagues.map((league) => (
                    <button
                      key={`${cat.name}-${league}`}
                      onClick={() => { onSelect(league); setOpen(false); }}
                      className="flex items-center justify-between w-full px-1 py-3.5 border-b border-dark-border/50 hover:bg-dark-surface/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{leagueMeta[league]?.icon}</span>
                        <span className="text-white text-[15px]">{league}</span>
                      </div>
                      {selected === league && (
                        <svg className="w-5 h-5 text-accent-blue" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
