"use client";

import { useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { normalizeSportsLeague } from "@/lib/insights";
import { qualifiesAsTrend } from "@/lib/trend-filter";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import EmptyStateCard from "@/components/EmptyStateCard";

type Tab = "All" | "Player" | "Team";

const TEAM_THRESHOLD = 50;

export default function TrendsPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [tab, setTab] = useState<Tab>("All");
  const dashboards = useSportsDashboards(sportLeague);

  const filteredProps = useMemo(
    () => dashboards.props.filter(qualifiesAsTrend),
    [dashboards.props],
  );
  const filteredTeams = useMemo(
    () => dashboards.teamTrends.filter((trend) => (trend.hitRate ?? 0) >= TEAM_THRESHOLD),
    [dashboards.teamTrends],
  );

  const allEmpty = filteredProps.length === 0 && filteredTeams.length === 0;
  const title = sportLeague === "All" ? "NHL + NBA Trends" : `${sportLeague} Trends`;

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <p className="text-xs text-gray-500 mt-0.5">60%+ L10 · 3/5 L5 · current streaks</p>
          </div>
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>

        <div className="flex border-b border-dark-border overflow-x-auto scrollbar-hide">
          {(["All", "Player", "Team"] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`flex-1 min-w-[64px] py-3 text-sm font-medium text-center transition-colors relative ${
                tab === item ? "text-white" : "text-gray-500"
              }`}
            >
              {item}
              {tab === item && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />}
            </button>
          ))}
        </div>
      </header>

      {dashboards.loading ? (
        <EmptyStateCard
          eyebrow="Loading trends"
          title="Computing the hottest current streaks"
          body="Pulling live props, recent hit rates, and team trends across the active slate."
        />
      ) : tab === "All" ? (
        allEmpty ? (
          <EmptyStateCard
            eyebrow="No trends yet"
            title="No player or team trends cleared the filter"
            body="Check back once more live props are available. Trends appear as soon as game logs and current lines line up."
          />
        ) : (
          <>
            {filteredTeams.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Trends</p>
                </div>
                {filteredTeams.map((trend) => <TeamTrendCard key={trend.id} trend={trend} />)}
              </>
            )}
            {filteredProps.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Player Props</p>
                </div>
                {filteredProps.map((prop) => <PropCard key={prop.id} prop={prop} />)}
              </>
            )}
          </>
        )
      ) : tab === "Player" ? (
        filteredProps.length > 0 ? (
          filteredProps.map((prop) => <PropCard key={prop.id} prop={prop} />)
        ) : (
          <EmptyStateCard
            eyebrow="Player trends"
            title="No player props qualify right now"
            body="Check back once more live markets are posted. The page will populate automatically."
          />
        )
      ) : filteredTeams.length > 0 ? (
        filteredTeams.map((trend) => <TeamTrendCard key={trend.id} trend={trend} />)
      ) : (
        <EmptyStateCard
          eyebrow="Team trends"
          title="No team trends qualify right now"
          body="Team trend cards appear once current schedules and standings create a live edge."
        />
      )}
    </div>
  );
}
