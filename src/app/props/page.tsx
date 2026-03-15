"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayerProp, TeamTrend } from "@/lib/types";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { buildClubRows, normalizeSportsLeague } from "@/lib/insights";
import { qualifiesAsTrend } from "@/lib/trend-filter";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import FilterBar from "@/components/FilterBar";
import EmptyStateCard from "@/components/EmptyStateCard";
import TrendRow from "@/components/TrendRow";

type ViewType = "Players" | "Team" | "100% Club";
type SegmentFilter = "full_game" | "first_quarter" | "first_period";
type ClubLineFilter = "all" | "main" | "alt";
type VenueFilter = "all" | "home" | "away";

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

const MLB_PLAYER_METRICS = [
  { label: "All Props", value: "all" },
  { label: "Hits", value: "Hits" },
  { label: "Total Bases", value: "Total Bases" },
  { label: "HRs", value: "Home Runs" },
  { label: "RBIs", value: "RBIs" },
  { label: "Runs", value: "Runs Scored" },
  { label: "SBs", value: "Stolen Bases" },
  { label: "Strikeouts (K)", value: "Strikeouts" },
  { label: "Over", value: "over" },
  { label: "Under", value: "under" },
];

const NHL_TEAM_METRICS = [
  { label: "All Metrics", value: "all" },
  { label: "Team Goals O/U", value: "Team Goals O/U" },
  { label: "Home Wins", value: "ML Home Win" },
  { label: "Road Wins", value: "ML Road Win" },
  { label: "ML Streak", value: "ML Streak" },
];

const NBA_TEAM_METRICS = [
  { label: "All Metrics", value: "all" },
  { label: "Team Points O/U", value: "Team Points O/U" },
  { label: "Home Wins", value: "ML Home Win" },
  { label: "Road Wins", value: "ML Road Win" },
  { label: "Streak", value: "ML Streak" },
];

const MLB_TEAM_METRICS = [
  { label: "All Metrics", value: "all" },
  { label: "Team Win ML", value: "Team Win ML" },
  { label: "Run Line", value: "Run Line" },
  { label: "Total Runs O/U", value: "Total Runs O/U" },
];

function mergeOptions(...groups: Array<Array<{ label: string; value: string }>>) {
  const seen = new Set<string>();
  const merged: Array<{ label: string; value: string }> = [];

  for (const option of groups.flat()) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    merged.push(option);
  }

  return merged;
}

function buildComingSoonCopy(segment: SegmentFilter) {
  if (segment === "first_quarter") {
    return {
      eyebrow: "1Q filter",
      title: "1st quarter prop trends are coming soon",
      body: "The ESPN pipeline is already powering full-game NBA props. Quarter-level extraction is the next step, so the filter is visible now but not live yet.",
    };
  }

  return {
    eyebrow: "1P filter",
    title: "1st period NHL trends are not available yet",
    body: "The NHL API used in this build does not provide period-level player or team scoring splits. The UI is in place and marked for a future data-source upgrade.",
  };
}

export default function PropsPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [view, setView] = useState<ViewType>("Players");
  const [metric, setMetric] = useState("all");
  const [segment, setSegment] = useState<SegmentFilter>("full_game");
  const [clubLineType, setClubLineType] = useState<ClubLineFilter>("all");
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [gameFilter, setGameFilter] = useState("all");
  const dashboards = useSportsDashboards(sportLeague);

  // Build game options from available props
  const gameOptions = useMemo(() => {
    const games = new Map<string, string>();
    for (const prop of dashboards.props) {
      if (prop.gameId && prop.opponent) {
        const label = prop.isAway ? `${prop.team} @ ${prop.opponent}` : `${prop.opponent} @ ${prop.team}`;
        games.set(prop.gameId, label);
      }
    }
    return Array.from(games.entries()).map(([id, label]) => ({ label, value: id }));
  }, [dashboards.props]);

  useEffect(() => {
    setMetric("all");
    setSegment("full_game");
    setClubLineType("all");
    setVenue("all");
    setGameFilter("all");
  }, [sportLeague, view]);

  const playerMetricOptions = useMemo(() => (
    sportLeague === "All"
      ? mergeOptions(NHL_PLAYER_METRICS, NBA_PLAYER_METRICS, MLB_PLAYER_METRICS)
      : sportLeague === "NBA"
        ? NBA_PLAYER_METRICS
        : sportLeague === "MLB"
          ? MLB_PLAYER_METRICS
        : NHL_PLAYER_METRICS
  ), [sportLeague]);

  const teamMetricOptions = useMemo(() => (
    sportLeague === "All"
      ? mergeOptions(NHL_TEAM_METRICS, NBA_TEAM_METRICS, MLB_TEAM_METRICS)
      : sportLeague === "NBA"
        ? NBA_TEAM_METRICS
        : sportLeague === "MLB"
          ? MLB_TEAM_METRICS
        : NHL_TEAM_METRICS
  ), [sportLeague]);

  const segmentOptions = useMemo(() => {
    if (sportLeague === "NBA") {
      return [
        { label: "Full Game", value: "full_game" },
        { label: "1Q (Coming Soon)", value: "first_quarter" },
      ];
    }
    if (sportLeague === "MLB") {
      return [{ label: "Full Game", value: "full_game" }];
    }
    if (sportLeague === "All") {
      return [
        { label: "Full Game", value: "full_game" },
        { label: "1Q (NBA Soon)", value: "first_quarter" },
        { label: "1P (NHL Soon)", value: "first_period" },
      ];
    }
    return [
      { label: "Full Game", value: "full_game" },
      { label: "1P (Coming Soon)", value: "first_period" },
    ];
  }, [sportLeague]);

  const filteredPlayers = useMemo(() => {
    return dashboards.props.filter((prop: PlayerProp) => {
      if (!qualifiesAsTrend(prop)) return false;
      if (gameFilter !== "all" && prop.gameId !== gameFilter) return false;
      if (metric === "all") return true;
      if (metric === "over") return prop.overUnder === "Over";
      if (metric === "under") return prop.overUnder === "Under";
      return prop.propType === metric;
    });
  }, [dashboards.props, metric, gameFilter]);

  const filteredTeams = useMemo(() => {
    return dashboards.teamTrends.filter((trend: TeamTrend) => {
      if (metric === "all") return true;
      return trend.betType === metric;
    });
  }, [dashboards.teamTrends, metric]);

  const clubRows = useMemo(() => (
    buildClubRows(dashboards.props, dashboards.teamTrends, {
      lineType: clubLineType,
      venue,
    })
  ), [clubLineType, dashboards.props, dashboards.teamTrends, venue]);

  const filters = [
    {
      label: "View",
      value: view,
      onChange: (nextView: string) => setView(nextView as ViewType),
      options: [
        { label: "Players", value: "Players" },
        { label: "Team", value: "Team" },
        { label: "100% Club", value: "100% Club" },
      ],
    },
    view === "100% Club"
      ? {
          label: "Lines",
          value: clubLineType,
          onChange: (nextLineType: string) => setClubLineType(nextLineType as ClubLineFilter),
          options: [
            { label: "All Lines", value: "all" },
            { label: "Main Lines", value: "main" },
            { label: "Alt Lines", value: "alt" },
          ],
        }
      : {
          label: "Metric",
          value: metric,
          onChange: setMetric,
          options: view === "Players" ? playerMetricOptions : teamMetricOptions,
        },
    view === "100% Club"
      ? {
          label: "Venue",
          value: venue,
          onChange: (nextVenue: string) => setVenue(nextVenue as VenueFilter),
          options: [
            { label: "All Games", value: "all" },
            { label: "Home", value: "home" },
            { label: "Away", value: "away" },
          ],
        }
      : {
          label: "Split",
          value: segment,
          onChange: (nextSegment: string) => setSegment(nextSegment as SegmentFilter),
          options: segmentOptions,
        },
    ...(view === "Players" && gameOptions.length > 1
      ? [{
          label: "Game",
          value: gameFilter,
          onChange: setGameFilter,
          options: [{ label: "All Games", value: "all" }, ...gameOptions],
        }]
      : []),
  ];

  const loadingTitle = view === "100% Club"
    ? "Scanning the elite trend board"
    : view === "Players"
      ? "Pulling current prop markets"
      : "Loading team analytics";

  const loadingBody = view === "100% Club"
    ? "Goosalytics is ranking perfect and near-perfect trends across the live leagues."
    : view === "Players"
      ? "Goosalytics is fetching live player markets and scoring today’s slate."
      : "Goosalytics is pulling live team trends and matchup context.";

  const comingSoon = view === "Players" && segment !== "full_game" ? buildComingSoonCopy(segment) : null;
  const isEmpty = view === "Players"
    ? filteredPlayers.length === 0
    : view === "Team"
      ? filteredTeams.length === 0
      : clubRows.length === 0;

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg" />
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
        <p className="text-center text-sm font-semibold text-gray-300 pb-1">Props</p>
        <div className="px-4 pb-3">
          <FilterBar filters={filters} />
        </div>
      </header>

      {dashboards.loading ? (
        <EmptyStateCard
          eyebrow="Loading live slate"
          title={loadingTitle}
          body={loadingBody}
        />
      ) : comingSoon ? (
        <EmptyStateCard
          eyebrow={comingSoon.eyebrow}
          title={comingSoon.title}
          body={comingSoon.body}
        />
      ) : isEmpty ? (
        <EmptyStateCard
          eyebrow={view === "100% Club" ? "100% Club" : "Nothing here yet"}
          title={
            view === "100% Club"
              ? "No perfect or near-perfect trends match these filters"
              : view === "Players"
                ? "No player props match this filter"
                : "No team analytics match this filter"
          }
          body={
            view === "100% Club"
              ? "Try switching between main and alt lines, or expand the home/away filter."
              : view === "Players"
                ? "Try switching to All Props or check back once more markets are posted."
                : "Team analytics require active schedules and recent data. Check back closer to game time."
          }
        />
      ) : view === "Players" ? (
        <div>
          {filteredPlayers.map((prop) => <PropCard key={prop.id} prop={prop} />)}
        </div>
      ) : view === "Team" ? (
        <div>
          {filteredTeams.map((trend) => <TeamTrendCard key={trend.id} trend={trend} />)}
        </div>
      ) : (
        <div className="px-3 py-3 space-y-3">
          {clubRows.map((row) => <TrendRow key={row.id} row={row} />)}
        </div>
      )}
    </div>
  );
}
