"use client";

import { useEffect, useMemo, useState } from "react";
import { League, PlayerProp, TeamTrend } from "@/lib/types";
import { useLeague } from "@/hooks/useLeague";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueSelector from "@/components/LeagueSelector";
import FilterBar from "@/components/FilterBar";
import EmptyStateCard from "@/components/EmptyStateCard";

type ViewType = "Players" | "Team";

const PLAYER_METRIC_OPTIONS = [
  { label: "All Props", value: "all" },
  { label: "Goals", value: "Goals" },
  { label: "Assists", value: "Assists" },
  { label: "Points", value: "Points" },
  { label: "Shots on Goal", value: "Shots on Goal" },
  { label: "Over", value: "over" },
  { label: "Under", value: "under" },
];

const TEAM_METRIC_OPTIONS = [
  { label: "All Metrics", value: "all" },
  { label: "Team Goals O/U", value: "Team Goals O/U" },
  { label: "Team Win ML", value: "Team Win ML" },
  { label: "Home Wins", value: "ML Home Win" },
  { label: "Road Wins", value: "ML Road Win" },
  { label: "ML Streak", value: "ML Streak" },
  { label: "Score First & Win", value: "Score First & Win" },
];

export default function PropsPage() {
  const [league, setLeague] = useLeague();
  const [view, setView] = useState<ViewType>("Players");
  const [metric, setMetric] = useState("all");
  const [playerProps, setPlayerProps] = useState<PlayerProp[]>([]);
  const [teamTrends, setTeamTrends] = useState<TeamTrend[]>([]);
  const [loading, setLoading] = useState(true);

  // Reset metric filter when switching view
  const handleViewChange = (v: string) => {
    setView(v as ViewType);
    setMetric("all");
  };

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard')
      .then(r => r.json())
      .then((json) => {
        if (Array.isArray(json?.props)) setPlayerProps(json.props);
        if (Array.isArray(json?.teamTrends)) setTeamTrends(json.teamTrends);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Filter player props
  const filteredPlayers = useMemo(() => {
    return playerProps.filter((p) => {
      if (p.league !== league) return false;
      if (metric === "all") return true;
      if (metric === "over") return p.overUnder === "Over";
      if (metric === "under") return p.overUnder === "Under";
      return p.propType === metric;
    });
  }, [playerProps, league, metric]);

  // Filter team trends
  const filteredTeams = useMemo(() => {
    return teamTrends.filter((t) => {
      if (t.league !== league) return false;
      if (metric === "all") return true;
      return t.betType === metric;
    });
  }, [teamTrends, league, metric]);

  const metricOptions = view === "Players" ? PLAYER_METRIC_OPTIONS : TEAM_METRIC_OPTIONS;
  const isEmpty = view === "Players" ? filteredPlayers.length === 0 : filteredTeams.length === 0;

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
          title={view === "Players" ? "Pulling current NHL prop markets" : "Loading team analytics"}
          body="Goosalytics is fetching live NHL data and computing edges for today's slate."
        />
      ) : isEmpty ? (
        <EmptyStateCard
          eyebrow="Nothing here yet"
          title={view === "Players" ? "No player props match this filter" : "No team analytics match this filter"}
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
