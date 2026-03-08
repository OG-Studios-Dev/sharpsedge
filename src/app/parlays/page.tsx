"use client";

import { useState } from "react";
import { parlays, sgps } from "@/data/seed";
import { League } from "@/lib/types";
import ParlayCard from "@/components/ParlayCard";
import SGPCard from "@/components/SGPCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";

type Tab = "Parlay" | "SGP";

export default function ParlaysPage() {
  const [league, setLeague] = useState<League>("NHL");
  const [tab, setTab] = useState<Tab>("Parlay");
  const [betType, setBetType] = useState("all");

  const filteredParlays = parlays.filter((p) => {
    if (p.league !== league) return false;
    if (betType !== "all" && p.category !== betType) return false;
    return true;
  });

  const filteredSGPs = sgps.filter((s) => {
    if (s.league !== league) return false;
    return true;
  });

  const parlayCategories = Array.from(new Set(parlays.filter(p => p.league === league).map((p) => p.category)));

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-white">Trends</h1>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>

        <div className="flex border-b border-dark-border">
          {(["Parlay", "SGP"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors relative ${
                tab === t ? "text-white" : "text-gray-500"
              }`}
            >
              {t}
              {tab === t && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />
              )}
            </button>
          ))}
        </div>

        {tab === "Parlay" && (
          <div className="px-4 py-3">
            <FilterBar
              filters={[
                {
                  label: "Type",
                  value: betType,
                  onChange: setBetType,
                  options: [
                    { label: "All Bet Types", value: "all" },
                    ...parlayCategories.map((c) => ({ label: c, value: c })),
                  ],
                },
              ]}
            />
          </div>
        )}
      </header>

      <div>
        {tab === "Parlay" ? (
          filteredParlays.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <p className="text-gray-500 text-sm">No parlays found.</p>
            </div>
          ) : (
            filteredParlays.map((parlay) => <ParlayCard key={parlay.id} parlay={parlay} />)
          )
        ) : filteredSGPs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <p className="text-gray-500 text-sm">No SGPs found.</p>
          </div>
        ) : (
          filteredSGPs.map((sgp) => <SGPCard key={sgp.id} sgp={sgp} />)
        )}
      </div>
    </div>
  );
}
