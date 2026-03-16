"use client";

import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { normalizeSportsLeague } from "@/lib/insights";
import { qualifiesAsTrend } from "@/lib/trend-filter";
import TrendPropCard from "@/components/TrendPropCard";
import TeamTrendCard from "@/components/TeamTrendCard";
import LeagueDropdown from "@/components/LeagueDropdown";
import EmptyStateCard from "@/components/EmptyStateCard";
import { TREND_FILTER_OPTIONS } from "@/components/TrendIndicators";
import FilterBar from "@/components/FilterBar";
import { hasIndicator } from "@/lib/player-trend";
import PageHeader from "@/components/PageHeader";
import { PropCardSkeleton, TeamTrendCardSkeleton } from "@/components/LoadingSkeleton";
import { useAppChrome } from "@/components/AppChromeProvider";
import { getStaggerStyle } from "@/lib/stagger-style";

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
  const { viewer } = useAppChrome();
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
  const isSoccerLeague = sportLeague === "EPL" || sportLeague === "Serie A";
  const availableTabs: Tab[] = isSoccerLeague ? ["All", "Team"] : ["All", "Player", "Team"];

  useEffect(() => {
    if (isSoccerLeague && tab === "Player") {
      setTab("Team");
    }
  }, [isSoccerLeague, tab]);

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
  const isFreeTier = viewer.tier === "free";
  const limitedProps = isFreeTier ? filteredProps.slice(0, 5) : filteredProps;
  const limitedTeams = isFreeTier ? filteredTeams.slice(0, 5) : filteredTeams;

  const allEmpty = limitedProps.length === 0 && limitedTeams.length === 0;
  const filters = isSoccerLeague
    ? [
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
      ]
    : [
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

  if (sportLeague === "NFL") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Trends"
          subtitle="Live trend cards and model signals."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        />

        <EmptyStateCard
          eyebrow="NFL"
          title="NFL props and picks launch Week 1"
          body="The offseason build keeps NFL visible through schedule and standings support. Trend cards activate once regular weekly markets are live."
        />
      </div>
    );
  }

  if (sportLeague === "PGA") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Trends"
          subtitle="Live trend cards and model signals."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        />

        <EmptyStateCard
          eyebrow="PGA"
          title="Golf trend cards live in the tournament view"
          body="PGA support in this build centers on the leaderboard, course history, recent form, and outright boards. Generic trend-card ranking is still limited to NHL, NBA, and MLB."
          ctaLabel="Open Schedule"
          ctaHref="/schedule"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Trends"
          subtitle="Live trend cards and model signals."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        >
          <div className="flex border-b border-dark-border overflow-x-auto scrollbar-hide">
          {availableTabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`tap-button relative flex-1 min-w-[64px] py-3 text-center text-sm font-medium transition-colors ${
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
              className={`tap-button shrink-0 flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
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
      </PageHeader>

      {isFreeTier && (filteredProps.length > 5 || filteredTeams.length > 5) && (
        <div className="mx-4 mt-4 rounded-2xl border border-accent-blue/20 bg-accent-blue/10 p-3 lg:mx-0">
          <p className="section-heading text-accent-blue">Free tier</p>
          <p className="mt-1 text-sm text-gray-300">
            Showing the top 5 trend cards. Upgrade to Pro for the full filtered board.
          </p>
        </div>
      )}

      {dashboards.loading ? (
        <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="stagger-in" style={getStaggerStyle(index)}>
              {tab === "Team" ? <TeamTrendCardSkeleton /> : <PropCardSkeleton />}
            </div>
          ))}
        </div>
      ) : tab === "All" ? (
        allEmpty ? (
          <EmptyStateCard
            eyebrow="No trends yet"
            title="No player or team trends cleared the filter"
            body="Check back once more live props are available. Trends appear as soon as game logs and current lines line up."
          />
        ) : (
          <>
            {limitedTeams.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-1">
                  <p className="section-heading">Team Trends</p>
                </div>
                <div className="grid gap-3 px-4 pb-3 lg:grid-cols-2 lg:px-0">
                  {limitedTeams.map((trend, index) => (
                    <div key={trend.id} className="stagger-in" style={getStaggerStyle(index)}>
                      <TeamTrendCard trend={trend} />
                    </div>
                  ))}
                </div>
              </>
            )}
            {limitedProps.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-1">
                  <p className="section-heading">Player Props</p>
                </div>
                <div className="grid gap-3 px-4 pb-3 lg:grid-cols-2 lg:px-0">
                  {limitedProps.map((prop, index) => <div key={prop.id} className="stagger-in" style={getStaggerStyle(index)}><TrendPropCard prop={prop} /></div>)}
                </div>
              </>
            )}
          </>
        )
      ) : tab === "Player" ? (
        limitedProps.length > 0 ? (
          <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
            {limitedProps.map((prop, index) => <div key={prop.id} className="stagger-in" style={getStaggerStyle(index)}><TrendPropCard prop={prop} /></div>)}
          </div>
        ) : (
          <EmptyStateCard
            eyebrow="Player trends"
            title="No player props qualify right now"
            body="Check back once more live markets are posted. The page will populate automatically."
          />
        )
      ) : limitedTeams.length > 0 ? (
        <div className="grid gap-3 px-4 py-4 lg:grid-cols-2 lg:px-0">
          {limitedTeams.map((trend, index) => <div key={trend.id} className="stagger-in" style={getStaggerStyle(index)}><TeamTrendCard trend={trend} /></div>)}
        </div>
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
