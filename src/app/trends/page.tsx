"use client";

import { useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { normalizeSportsLeague } from "@/lib/insights";
import { qualifiesAsTrend } from "@/lib/trend-filter";
import TrendPropCard from "@/components/TrendPropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import EmptyStateCard from "@/components/EmptyStateCard";
import { TREND_FILTER_OPTIONS } from "@/components/TrendIndicators";
import FilterBar from "@/components/FilterBar";
import { hasIndicator } from "@/lib/player-trend";

type Tab = "All" | "Player" | "Team";
type IndicatorType = "goose_lean" | "hot" | "money" | "lock" | "streak";
type DirectionFilter = "all" | "over" | "under";
type PropTypeFilter =
  | "all"
  | "Points"
  | "Rebounds"
  | "Assists"
  | "Shots"
  | "Goals"
  | "3PM"
  | "Hits"
  | "Total Bases"
  | "Home Runs"
  | "Strikeouts";
type SortFilter = "hit_rate" | "edge" | "odds";

const TEAM_THRESHOLD = 50;

function matchesPropType(propType: string, filter: PropTypeFilter) {
  if (filter === "all") return true;
  if (filter === "3PM") return propType === "3-Pointers Made";
  if (filter === "Shots") return propType === "Shots on Goal" || propType === "Shots";
  if (filter === "Strikeouts") return propType === "Strikeouts";
  return propType === filter;
}

function toPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function compareBySort(
  a: { hitRate?: number | null; edge?: number | null; odds?: number | null },
  b: { hitRate?: number | null; edge?: number | null; odds?: number | null },
  sortBy: SortFilter,
) {
  if (sortBy === "edge") {
    return toPercent(b.edge) - toPercent(a.edge)
      || toPercent(b.hitRate) - toPercent(a.hitRate);
  }
  if (sortBy === "odds") {
    return (b.odds ?? -9999) - (a.odds ?? -9999)
      || toPercent(b.hitRate) - toPercent(a.hitRate);
  }
  return toPercent(b.hitRate) - toPercent(a.hitRate)
    || toPercent(b.edge) - toPercent(a.edge);
}

export default function TrendsPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [tab, setTab] = useState<Tab>("All");
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorType>>(new Set());

  function toggleIndicator(type: string) {
    if (type === "all") {
      setActiveIndicators(new Set());
      return;
    }
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(type as IndicatorType)) {
        next.delete(type as IndicatorType);
      } else {
        next.add(type as IndicatorType);
      }
      return next;
    });
  }

  function matchesIndicatorFilter(indicators: any[] | undefined): boolean {
    if (activeIndicators.size === 0) return true;
    const activeTypes = Array.from(activeIndicators);
    return activeTypes.every((type) => hasIndicator(indicators, type));
  }
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [propTypeFilter, setPropTypeFilter] = useState<PropTypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortFilter>("hit_rate");
  const dashboards = useSportsDashboards(sportLeague);

  const filteredProps = useMemo(() => {
    const qualified = dashboards.props
      .filter(qualifiesAsTrend)
      .filter((prop) => matchesIndicatorFilter(prop.indicators))
      .filter((prop) => directionFilter === "all" || prop.overUnder.toLowerCase() === directionFilter)
      .filter((prop) => matchesPropType(prop.propType, propTypeFilter))
      .sort((a, b) => compareBySort(a, b, sortBy));

    return qualified;
  }, [dashboards.props, directionFilter, activeIndicators, propTypeFilter, sortBy]);

  const filteredTeams = useMemo(() => {
    return dashboards.teamTrends
      .filter((trend) => (trend.hitRate ?? 0) >= TEAM_THRESHOLD)
      .filter((trend) => matchesIndicatorFilter(trend.indicators))
      .sort((a, b) => compareBySort(a, b, sortBy));
  }, [dashboards.teamTrends, activeIndicators, sortBy]);

  const allEmpty = filteredProps.length === 0 && filteredTeams.length === 0;
  const title = sportLeague === "All" ? "NHL + NBA + MLB Trends" : `${sportLeague} Trends`;
  const filters = [
    {
      label: "Direction",
      value: directionFilter,
      onChange: (value: string) => setDirectionFilter(value as DirectionFilter),
      options: [
        { label: "All", value: "all" },
        { label: "Over", value: "over" },
        { label: "Under", value: "under" },
      ],
    },
    {
      label: "Prop Type",
      value: propTypeFilter,
      onChange: (value: string) => setPropTypeFilter(value as PropTypeFilter),
      options: [
        { label: "All", value: "all" },
        { label: "Points", value: "Points" },
        { label: "Rebounds", value: "Rebounds" },
        { label: "Assists", value: "Assists" },
        { label: "Shots", value: "Shots" },
        { label: "Goals", value: "Goals" },
        { label: "3PM", value: "3PM" },
        { label: "Hits", value: "Hits" },
        { label: "Total Bases", value: "Total Bases" },
        { label: "Home Runs", value: "Home Runs" },
        { label: "Strikeouts", value: "Strikeouts" },
      ],
    },
    {
      label: "Sort",
      value: sortBy,
      onChange: (value: string) => setSortBy(value as SortFilter),
      options: [
        { label: "Hit Rate", value: "hit_rate" },
        { label: "Edge", value: "edge" },
        { label: "Odds", value: "odds" },
      ],
    },
  ];

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg" />
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

        {/* Trend Indicator Filters (multi-select) */}
        <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-hide">
          {TREND_FILTER_OPTIONS.map((opt) => {
            const isAll = opt.type === "all";
            const isActive = isAll ? activeIndicators.size === 0 : activeIndicators.has(opt.type as IndicatorType);
            return (
            <button
              key={opt.type}
              onClick={() => toggleIndicator(opt.type)}
              className={`shrink-0 flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                isActive
                  ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                  : "border-dark-border text-gray-500 hover:text-gray-300"
              }`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
            );
          })}
        </div>

        <div className="px-4 pb-3">
          <FilterBar filters={filters} />
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
                {filteredProps.map((prop) => <TrendPropCard key={prop.id} prop={prop} />)}
              </>
            )}
          </>
        )
      ) : tab === "Player" ? (
        filteredProps.length > 0 ? (
          filteredProps.map((prop) => <TrendPropCard key={prop.id} prop={prop} />)
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
