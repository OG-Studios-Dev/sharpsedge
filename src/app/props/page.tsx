"use client";

import { useEffect, useMemo, useState } from "react";
import { League, PlayerProp, TeamTrend } from "@/lib/types";
import { useLeague } from "@/hooks/useLeague";
import { qualifiesAsTrend } from "@/lib/trend-filter";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";
import EmptyStateCard from "@/components/EmptyStateCard";

type ViewType = "Players" | "Team";

const NHL_PLAYER_METRICS = [
  { label: "All Props", value: "all" },
  { label: "Goals", value: "Goals" },
  { label: "Assists", value: "Assists" },
  { label: "Points", value: "Points" },
  { label: "Shots on Goal", value: "Shots on Goal" },
  { label: "Over", value: "over" },
  { label: "Under", value: "under" },
];

const NBA_PLAYER_METRICS = [
  { label: "All Props", value: "all" },
  { label: "Points", value: "Points" },
  { label: "Rebounds", value: "Rebounds" },
  { label: "Assists", value: "Assists" },
  { label: "3PM", value: "3-Pointers Made" },
  { label: "Steals", value: "Steals" },
  { label: "Blocks", value: "Blocks" },
  { label: "Over", value: "over" },
  { label: "Under", value: "under" },
];

const NHL_TEAM_METRICS = [
  { label: "All Metrics", value: "all" },
  { label: "Team Goals O/U", value: "Team Goals O/U" },
  { label: "Team Win ML", value: "Team Win ML" },
  { label: "Home Wins", value: "ML Home Win" },
  { label: "Road Wins", value: "ML Road Win" },
  { label: "ML Streak", value: "ML Streak" },
];

const NBA_TEAM_METRICS = [
  { label: "All Metrics", value: "all" },
  { label: "Team Points O/U", value: "Team Points O/U" },
  { label: "Team Win ML", value: "Team Win ML" },
  { label: "Home Wins", value: "ML Home Win" },
  { label: "Road Wins", value: "ML Road Win" },
  { label: "Streak", value: "ML Streak" },
];

export default function PropsPage() {
  const [league, setLeague] = useLeague();
  const [view, setView] = useState<ViewType>("Players");
  const [metric, setMetric] = useState("all");
  const [playerProps, setPlayerProps] = useState<PlayerProp[]>([]);
  const [teamTrends, setTeamTrends] = useState<TeamTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const handleViewChange = (v: string) => {
    setView(v as ViewType);
    setMetric("all");
  };

  useEffect(() => {
    setMetric("all");
  }, [league]);

  useEffect(() => {
    setLoading(true);
    const endpoint = league === "NBA" ? "/api/nba/dashboard" : "/api/dashboard";
    fetch(endpoint)
      .then(r => r.json())
      .then((json) => {
        if (Array.isArray(json?.props)) setPlayerProps(json.props);
        if (Array.isArray(json?.teamTrends)) setTeamTrends(json.teamTrends);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [league]);

  const filteredPlayers = useMemo(() => {
    return playerProps.filter((p) => {
      if (p.league !== league) return false;
      if (!qualifiesAsTrend(p)) return false;
      if (metric === "all") return true;
      if (metric === "over") return p.overUnder === "Over";
      if (metric === "under") return p.overUnder === "Under";
      return p.propType === metric;
    });
  }, [playerProps, league, metric]);

  const filteredTeams = useMemo(() => {
    return teamTrends.filter((t) => {
      if (t.league !== league) return false;
      if (metric === "all") return true;
      return t.betType === metric;
    });
  }, [teamTrends, league, metric]);

  const isNBA = league === "NBA";
  const playerMetrics = isNBA ? NBA_PLAYER_METRICS : NHL_PLAYER_METRICS;
  const teamMetrics = isNBA ? NBA_TEAM_METRICS : NHL_TEAM_METRICS;
  const metricOptions = view === "Players" ? playerMetrics : teamMetrics;
  const isEmpty = view === "Players" ? filteredPlayers.length === 0 : filteredTeams.length === 0;
  const sportLabel = isNBA ? "NBA" : "NHL";

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-white">Props & Analytics</h1>
            <p className="text-xs text-gray-500 mt-0.5">Live slate. Real stats only.</p>
          </div>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>
        <div className="px-4 pb-3">
          <FilterBar
            filters={[
              {
                label: "View",
                value: view,
                onChange: handleViewChange,
                options: [
                  { label: "Players", value: "Players" },
                  { label: "Team", value: "Team" },
                ],
              },
              {
                label: "Metric",
                value: metric,
                onChange: setMetric,
                options: metricOptions,
              },
            ]}
          />
        </div>
      </header>

      {loading ? (
        <EmptyStateCard
          eyebrow="Loading live slate"
          title={view === "Players" ? `Pulling current ${sportLabel} prop markets` : "Loading team analytics"}
          body={`Goosalytics is fetching live ${sportLabel} data and computing edges for today's slate.`}
        />
      ) : isEmpty ? (
        <EmptyStateCard
          eyebrow="Nothing here yet"
          title={view === "Players" ? `No ${sportLabel} player props match this filter` : `No ${sportLabel} team analytics match this filter`}
          body={view === "Players"
            ? "Try switching to All Props or check back once today's slate is posted."
            : "Team analytics require today's schedule to be active. Check back closer to game time."}
        />
      ) : view === "Players" ? (
        <div>
          {filteredPlayers.map((prop) => <PropCard key={prop.id} prop={prop} />)}
        </div>
      ) : (
        <div>
          {filteredTeams.map((trend) => <TeamTrendCard key={trend.id} trend={trend} />)}
        </div>
      )}
    </div>
  );
}
