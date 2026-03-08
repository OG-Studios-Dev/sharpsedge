"use client";

import { useEffect, useState } from "react";
import { playerProps } from "@/data/seed";
import { League, PlayerProp } from "@/lib/types";
import PropCard from "@/components/PropCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";

export default function PropsPage() {
  const [league, setLeague] = useState<League>("NHL");
  const [propType, setPropType] = useState("all");
  const [overUnder, setOverUnder] = useState("all");
  const [data, setData] = useState<PlayerProp[]>(playerProps);

  useEffect(() => {
    fetch('/api/props').then(r => r.json()).then((json) => {
      if (Array.isArray(json)) setData(json);
    }).catch(() => {});
  }, []);

  const filtered = data.filter((p) => {
    if (p.league !== league) return false;
    if (propType !== "all" && p.propType !== propType) return false;
    if (overUnder !== "all" && p.overUnder !== overUnder) return false;
    return true;
  });

  const propTypes = Array.from(new Set(data.filter(p => p.league === league).map((p) => p.propType)));

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-white">Player Trends</h1>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>
        <div className="px-4 pb-3">
          <FilterBar
            filters={[
              {
                label: "Type",
                value: propType,
                onChange: setPropType,
                options: [
                  { label: "All Bet Types", value: "all" },
                  ...propTypes.map((t) => ({ label: t, value: t })),
                ],
              },
              {
                label: "Over/Under",
                value: overUnder,
                onChange: setOverUnder,
                options: [
                  { label: "Over+Under", value: "all" },
                  { label: "Over", value: "Over" },
                  { label: "Under", value: "Under" },
                ],
              },
            ]}
          />
        </div>
      </header>

      <div>
        {filtered.map((prop) => <PropCard key={prop.id} prop={prop} />)}
      </div>
    </div>
  );
}
