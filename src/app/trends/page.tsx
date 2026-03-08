"use client";

import { useEffect, useState } from "react";
import { playerProps, teamTrends, parlays, sgps } from "@/data/seed";
import { League, PlayerProp, TeamTrend, Parlay, SGP } from "@/lib/types";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import ParlayCard from "@/components/ParlayCard";
import SGPCard from "@/components/SGPCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";

type Tab = "Player" | "Team" | "Parlay" | "SGP";

export default function TrendsPage() {
  const [league, setLeague] = useState<League>("NHL");
  const [tab, setTab] = useState<Tab>("Player");
  const [propsData, setPropsData] = useState<PlayerProp[]>(playerProps);
  const [trendsData, setTrendsData] = useState<TeamTrend[]>(teamTrends);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [propsRes, trendsRes] = await Promise.all([
          fetch('/api/props').then(r => r.json()),
          fetch('/api/trends').then(r => r.json()),
        ]);
        if (Array.isArray(propsRes)) setPropsData(propsRes);
        if (Array.isArray(trendsRes)) setTrendsData(trendsRes);
      } catch {
        // keep seed fallback
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredProps = propsData.filter((p) => p.league === league);
  const filteredTrends = trendsData.filter((t) => t.league === league);
  const filteredParlays = parlays.filter((p) => p.league === league);
  const filteredSGPs = sgps.filter((s) => s.league === league);

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="w-8" />
          <h1 className="text-xl font-bold text-white">Trends</h1>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>

        <div className="flex border-b border-dark-border overflow-x-auto scrollbar-hide">
          {(["Player", "Team", "Parlay", "SGP"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[80px] py-3 text-sm font-medium text-center transition-colors relative ${
                tab === t ? "text-white" : "text-gray-500"
              }`}
            >
              {t}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />}
            </button>
          ))}
        </div>

        <div className="px-4 py-3">
          <FilterBar
            filters={[
              { label: 'Lines', value: 'main', onChange: () => {}, options: [{ label: 'Main Lines', value: 'main' }] },
              { label: 'Games', value: 'all', onChange: () => {}, options: [{ label: 'All Games', value: 'all' }] },
              { label: 'OU', value: 'all', onChange: () => {}, options: [{ label: 'Over+Under', value: 'all' }] },
              { label: 'Type', value: 'all', onChange: () => {}, options: [{ label: 'All Bet Types', value: 'all' }] },
            ]}
          />
        </div>
      </header>

      {loading && <div className="px-4 py-4 text-sm text-gray-500">Loading latest trends...</div>}

      <div>
        {tab === "Player" && filteredProps.map((item) => <PropCard key={item.id} prop={item} />)}
        {tab === "Team" && filteredTrends.map((item) => <TeamTrendCard key={item.id} trend={item} />)}
        {tab === "Parlay" && filteredParlays.map((item) => <ParlayCard key={item.id} parlay={item} />)}
        {tab === "SGP" && filteredSGPs.map((item) => <SGPCard key={item.id} sgp={item} />)}
      </div>
    </div>
  );
}
