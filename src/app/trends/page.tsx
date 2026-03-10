"use client";

import { useEffect, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { parlays, sgps } from "@/data/seed";
import { League, PlayerProp, TeamTrend, Parlay, SGP } from "@/lib/types";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import ParlayCard from "@/components/ParlayCard";
import SGPCard from "@/components/SGPCard";
import LeagueSelector from "@/components/LeagueSelector";
import EmptyStateCard from "@/components/EmptyStateCard";

type Tab = "Player" | "Team" | "Parlay" | "SGP";

export default function TrendsPage() {
  const [league, setLeague] = useLeague();
  const [tab, setTab] = useState<Tab>("Player");
  const [propsData, setPropsData] = useState<PlayerProp[]>([]);
  const [teamTrendsData, setTeamTrendsData] = useState<TeamTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [propsError, setPropsError] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/trends')
      .then(r => r.json())
      .then((json) => {
        if (Array.isArray(json?.props)) setPropsData(json.props);
        else setPropsError(true);
        if (Array.isArray(json?.teamTrends)) setTeamTrendsData(json.teamTrends);
      })
      .catch(() => setPropsError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredProps = propsData.filter((p) => p.league === league);
  const filteredTrends = teamTrendsData.filter((t) => t.league === league);
  const filteredParlays = parlays.filter((p) => p.league === league);
  const filteredSGPs = sgps.filter((s) => s.league === league);

  const tabBadge = (t: Tab) => {
    if (t === "Player") return null;
    return (
      <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 uppercase tracking-wide">
        research
      </span>
    );
  };

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">Trends</h1>
            <p className="text-xs text-gray-500 mt-0.5">Live NHL player edges. Research modules below.</p>
          </div>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>

        <div className="flex border-b border-dark-border overflow-x-auto scrollbar-hide">
          {(["Player", "Team", "Parlay", "SGP"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[80px] py-3 text-sm font-medium text-center transition-colors relative flex items-center justify-center gap-1 ${
                tab === t ? "text-white" : "text-gray-500"
              }`}
            >
              {t}
              {tabBadge(t)}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />}
            </button>
          ))}
        </div>
      </header>

      <div>
        {tab === "Player" && (
          loading ? (
            <EmptyStateCard
              eyebrow="Building live prop feed"
              title="Pulling current-slate player stats"
              body="Goosalytics is fetching real NHL player game logs and computing rolling averages for today's slate. Takes a few seconds."
            />
          ) : propsError ? (
            <EmptyStateCard
              eyebrow="Error"
              title="Failed to load live props"
              body="There was a problem fetching the live prop feed. Try refreshing."
            />
          ) : filteredProps.length > 0 ? (
            filteredProps.map((item) => <PropCard key={item.id} prop={item} />)
          ) : (
            <EmptyStateCard
              eyebrow="Live player props"
              title="No upcoming NHL games on this slate"
              body="There are no FUT or LIVE games to generate props for right now. Check back when the next slate opens — typically the following morning."
            />
          )
        )}

        {tab === "Team" && (
          <>
            <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/15 text-xs text-yellow-400">
              Team trends are research data. Not live for this slate.
            </div>
            {filteredTrends.map((item) => <TeamTrendCard key={item.id} trend={item} />)}
          </>
        )}

        {tab === "Parlay" && (
          <>
            <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/15 text-xs text-yellow-400">
              Parlay builder is a research module. Lines are illustrative, not live.
            </div>
            {filteredParlays.map((item) => <ParlayCard key={item.id} parlay={item} />)}
          </>
        )}

        {tab === "SGP" && (
          <>
            <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/15 text-xs text-yellow-400">
              Same-game parlay builder is a research module. Lines are illustrative, not live.
            </div>
            {filteredSGPs.map((item) => <SGPCard key={item.id} sgp={item} />)}
          </>
        )}
      </div>
    </div>
  );
}
