"use client";

import { useState } from "react";
import { League } from "@/lib/types";
import { featuredLeagues, leagueMeta } from "@/lib/league-meta";

export default function LeaguesPage() {
  const [league, setLeague] = useState<League>("NHL");

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">Leagues</h1>
      </header>

      <div className="px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2">Active league</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-dark-bg text-2xl border border-dark-border">
              {leagueMeta[league].icon}
            </div>
            <div>
              <div className="text-white text-lg font-semibold">{league}</div>
              <div className="text-sm text-gray-400">{leagueMeta[league].subtitle}</div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-white mb-3">Choose your active market</div>
          <div className="grid grid-cols-1 gap-3">
            {featuredLeagues.map((item) => {
              const active = league === item;
              return (
                <button
                  key={item}
                  onClick={() => setLeague(item)}
                  className={`text-left rounded-2xl border p-4 transition-all bg-gradient-to-br ${leagueMeta[item].accent} ${
                    active
                      ? "border-accent-blue shadow-[0_0_0_1px_rgba(96,165,250,0.35)]"
                      : "border-dark-border hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-dark-bg/80 border border-dark-border flex items-center justify-center text-2xl">
                        {leagueMeta[item].icon}
                      </div>
                      <div>
                        <div className="text-white text-base font-semibold">{item}</div>
                        <div className="text-sm text-gray-300 mt-1 max-w-[240px]">
                          {leagueMeta[item].subtitle}
                        </div>
                      </div>
                    </div>
                    <div className={`mt-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      active ? "bg-accent-blue text-white" : "bg-dark-bg text-gray-400 border border-dark-border"
                    }`}>
                      {active ? "Active" : "Set Active"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
