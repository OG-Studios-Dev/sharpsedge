"use client";

import { useState } from "react";
import { teamTrends } from "@/data/seed";
import { League } from "@/lib/types";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";

export default function TeamsPage() {
  const [league, setLeague] = useState<League>("NHL");
  const [betType, setBetType] = useState("all");
  const [overUnder, setOverUnder] = useState("all");

  const filtered = teamTrends.filter((t) => {
    if (t.league !== league) return false;
    if (betType !== "all" && t.betType !== betType) return false;
    return true;
  });

  const betTypes = Array.from(new Set(teamTrends.filter(t => t.league === league).map((t) => t.betType)));

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-white">Team Trends</h1>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>
        <div className="px-4 pb-3">
          <FilterBar
            filters={[
              {
                label: "Type",
                value: betType,
                onChange: setBetType,
                options: [
                  { label: "All Bet Types", value: "all" },
                  ...betTypes.map((t) => ({ label: t, value: t })),
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
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <p className="text-gray-500 text-sm">No team trends found for the selected filters.</p>
          </div>
        ) : (
          filtered.map((trend) => <TeamTrendCard key={trend.id} trend={trend} />)
        )}
      </div>
    </div>
  );
}
