"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayerProp, TeamTrend } from "@/lib/types";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { buildClubRows, normalizeSportsLeague } from "@/lib/insights";
import { qualifiesAsTrend } from "@/lib/trend-filter";
import PropCard from "@/components/PropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueDropdown from "@/components/LeagueDropdown";
import FilterBar from "@/components/FilterBar";
import EmptyStateCard from "@/components/EmptyStateCard";
import TrendRow from "@/components/TrendRow";
import PageHeader from "@/components/PageHeader";
import LockedFeature from "@/components/LockedFeature";
import { PropCardSkeleton, TeamTrendCardSkeleton, TrendRowSkeleton } from "@/components/LoadingSkeleton";
import { getStaggerStyle } from "@/lib/stagger-style";

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
  const [sortBy, setSortBy] = useState<"hit_rate" | "edge" | "odds">("hit_rate");
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
    const filtered = dashboards.props.filter((prop: PlayerProp) => {
      if (!qualifiesAsTrend(prop)) return false;
      if (gameFilter !== "all" && prop.gameId !== gameFilter) return false;
      if (metric === "all") return true;
      if (metric === "over") return prop.overUnder === "Over";
      if (metric === "under") return prop.overUnder === "Under";
      return prop.propType === metric;
    });
    // Sort
    return filtered.sort((a, b) => {
      const aHR = typeof a.hitRate === "number" ? (Math.abs(a.hitRate) <= 1 ? a.hitRate * 100 : a.hitRate) : 0;
      const bHR = typeof b.hitRate === "number" ? (Math.abs(b.hitRate) <= 1 ? b.hitRate * 100 : b.hitRate) : 0;
      if (sortBy === "hit_rate") return bHR - aHR;
      if (sortBy === "edge") return (b.edgePct ?? b.edge ?? 0) - (a.edgePct ?? a.edge ?? 0);
      if (sortBy === "odds") return (a.odds ?? 0) - (b.odds ?? 0);
      return bHR - aHR;
    });
  }, [dashboards.props, metric, gameFilter, sortBy]);

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
    ...(view === "Players"
      ? [{
          label: "Sort",
          value: sortBy,
          onChange: (v: string) => setSortBy(v as "hit_rate" | "edge" | "odds"),
          options: [
            { label: "Hit Rate ↓", value: "hit_rate" },
            { label: "Edge ↓", value: "edge" },
            { label: "Best Odds", value: "odds" },
          ],
        }]
      : []),
  ];

  const comingSoon = view === "Players" && segment !== "full_game" ? buildComingSoonCopy(segment) : null;
  const isEmpty = view === "Players"
    ? filteredPlayers.length === 0
    : view === "Team"
      ? filteredTeams.length === 0
      : clubRows.length === 0;

  if (sportLeague === "PGA") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Props"
          subtitle="Player and team market analytics."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        />

        <EmptyStateCard
          eyebrow="PGA"
          title="Golf is leaderboard-first in this build"
          body="Tournament outrights, matchups, and contender cards live on the home, schedule, and lines views. Generic prop-card rendering has not been turned on for PGA yet."
          ctaLabel="Open Schedule"
          ctaHref="/schedule"
        />
      </div>
    );
  }

  if (sportLeague === "NFL") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Props"
          subtitle="Player and team market analytics."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        />

        <EmptyStateCard
          eyebrow="NFL"
          title="NFL props launch Week 1"
          body="The offseason build keeps NFL visible through schedule, standings, and lines. Prop cards turn on when the regular-season board is posting consistently."
          ctaLabel="Open Schedule"
          ctaHref="/schedule"
        />
      </div>
    );
  }

  if (sportLeague === "EPL" || sportLeague === "Serie A") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Props"
          subtitle="Player and team market analytics."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        />

        <EmptyStateCard
          eyebrow={sportLeague}
          title="Soccer trend cards live in Trends"
          body="This build ships soccer schedule, standings, 1X2 pricing, and team-level trend cards first. Generic prop-card rendering is still reserved for the North American leagues."
          ctaLabel="Open Trends"
          ctaHref="/trends"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Props"
        subtitle="Player and team market analytics."
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      >
        <div className="pb-1">
          <FilterBar filters={filters} />
        </div>
      </PageHeader>

      {dashboards.error ? (
        <EmptyStateCard eyebrow="Props unavailable" title="Market dashboard did not load" body={dashboards.error} />
      ) : dashboards.loading ? (
        <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="stagger-in" style={getStaggerStyle(index)}>
              {view === "Players" ? <PropCardSkeleton /> : view === "Team" ? <TeamTrendCardSkeleton /> : <TrendRowSkeleton />}
            </div>
          ))}
        </div>
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
        <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
          {filteredPlayers.map((prop, index) => (
            <div key={prop.id} className="stagger-in" style={getStaggerStyle(index)}>
              <PropCard prop={prop} />
            </div>
          ))}
        </div>
      ) : view === "Team" ? (
        <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
          {filteredTeams.map((trend, index) => (
            <div key={trend.id} className="stagger-in" style={getStaggerStyle(index)}>
              <TeamTrendCard trend={trend} />
            </div>
          ))}
        </div>
      ) : (
        <LockedFeature feature="club_100">
          <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
            {clubRows.map((row, index) => (
              <div key={row.id} className="stagger-in" style={getStaggerStyle(index)}>
                <TrendRow row={row} />
              </div>
            ))}
          </div>
        </LockedFeature>
      )}
    </div>
  );
}
