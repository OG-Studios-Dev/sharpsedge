"use client";

import { useEffect, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { parlays, sgps } from "@/data/seed";
import { PlayerProp, TeamTrend } from "@/lib/types";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import ParlayCard from "@/components/ParlayCard";
import SGPCard from "@/components/SGPCard";
import LeagueSelector from "@/components/LeagueSelector";
import EmptyStateCard from "@/components/EmptyStateCard";

type Tab = "All" | "Player" | "Team" | "Parlay" | "SGP";

export default function TrendsPage() {
  const [league, setLeague] = useLeague();
  const [tab, setTab] = useState<Tab>("All");
  const [propsData, setPropsData] = useState<PlayerProp[]>([]);
  const [teamTrendsData, setTeamTrendsData] = useState<TeamTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/trends')
      .then(r => r.json())
      .then((json) => {
        if (Array.isArray(json?.props)) setPropsData(json.props);
        if (Array.isArray(json?.teamTrends)) setTeamTrendsData(json.teamTrends);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredProps = propsData.filter((p) => p.league === league);
  const filteredTeams = teamTrendsData.filter((t) => t.league === league);
  const filteredParlays = parlays.filter((p) => p.league === league);
  const filteredSGPs = sgps.filter((s) => s.league === league);

  const allEmpty = filteredProps.length === 0 && filteredTeams.length === 0;

  const TABS: Tab[] = ["All", "Player", "Team", "Parlay", "SGP"];
  const researchTabs: Tab[] = ["Parlay", "SGP"];

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">Trends</h1>
            <p className="text-xs text-gray-500 mt-0.5">70%+ hit rate in last 10 games</p>
          </div>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>

        <div className="flex border-b border-dark-border overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 min-w-[64px] py-3 text-sm font-medium text-center transition-colors relative flex items-center justify-center gap-1 ${
                tab === t ? "text-white" : "text-gray-500"
              }`}
            >
              {t}
              {researchTabs.includes(t) && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 uppercase tracking-wide">
                  soon
                </span>
              )}
              {tab === t && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />}
            </button>
          ))}
        </div>
      </header>

      <div>
        {/* ALL — combined player + team */}
        {tab === "All" && (
          loading ? (
            <EmptyStateCard
              eyebrow="Loading trends"
              title="Computing hot streaks"
              body="Pulling NHL player game logs and team records. Takes a few seconds."
            />
          ) : allEmpty ? (
            <EmptyStateCard
              eyebrow="No trends yet"
              title="No trends hitting 70%+ right now"
              body="Check back once recent games are logged. The model needs at least 5 games of data per player."
            />
          ) : (
            <>
              {filteredTeams.length > 0 && (
                <>
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Trends</p>
                  </div>
                  {filteredTeams.map((t) => <TeamTrendCard key={t.id} trend={t} />)}
                </>
              )}
              {filteredProps.length > 0 && (
                <>
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Player Props</p>
                  </div>
                  {filteredProps.map((p) => <PropCard key={p.id} prop={p} />)}
                </>
              )}
            </>
          )
        )}

        {/* PLAYER only */}
        {tab === "Player" && (
          loading ? (
            <EmptyStateCard
              eyebrow="Loading player trends"
              title="Pulling player game logs"
              body="Computing rolling hit rates from recent NHL games."
            />
          ) : filteredProps.length > 0 ? (
            filteredProps.map((p) => <PropCard key={p.id} prop={p} />)
          ) : (
            <EmptyStateCard
              eyebrow="Player trends"
              title="No player props at 70%+ right now"
              body="The model requires at least 5 recent games per player. Check back after tonight's slate."
            />
          )
        )}

        {/* TEAM only */}
        {tab === "Team" && (
          loading ? (
            <EmptyStateCard
              eyebrow="Loading team trends"
              title="Pulling team records"
              body="Computing home/road records, goals O/U, and current streaks."
            />
          ) : filteredTeams.length > 0 ? (
            filteredTeams.map((t) => <TeamTrendCard key={t.id} trend={t} />)
          ) : (
            <EmptyStateCard
              eyebrow="Team trends"
              title="No team trends at 70%+ right now"
              body="Check back closer to game time."
            />
          )
        )}

        {/* PARLAY */}
        {tab === "Parlay" && (
          <>
            <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/15 text-xs text-yellow-400">
              Parlay builder coming soon. Lines are illustrative.
            </div>
            {filteredParlays.map((item) => <ParlayCard key={item.id} parlay={item} />)}
          </>
        )}

        {/* SGP */}
        {tab === "SGP" && (
          <>
            <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/15 text-xs text-yellow-400">
              Same-game parlay builder coming soon. Lines are illustrative.
            </div>
            {filteredSGPs.map((item) => <SGPCard key={item.id} sgp={item} />)}
          </>
        )}
      </div>
    </div>
  );
}
