"use client";

import { ReactNode, useMemo } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useNBAPicks, usePicks } from "@/hooks/usePicks";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { buildClubRows, buildSGPSuggestions, buildTrendingRows, normalizeSportsLeague } from "@/lib/insights";
import { computePickRecord } from "@/lib/pick-record";
import EmptyStateCard from "@/components/EmptyStateCard";
import HomePicksSection from "./HomePicksSection";
import LeagueSwitcher from "./LeagueSwitcher";
import NBAScheduleBoard from "./NBAScheduleBoard";
import ScheduleBoard from "./ScheduleBoard";
import SectionHeader from "./SectionHeader";
import SGPCard from "./SGPCard";
import TrendRow from "./TrendRow";

function formatRecordSummary(wins: number, losses: number, pushes: number, profitUnits: number) {
  const units = `${profitUnits > 0 ? "+" : ""}${profitUnits}u`;
  return `${wins}-${losses}-${pushes} · ${units}`;
}

function HomeSection({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <SectionHeader title={title} subtitle={subtitle} href={href} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function HomeContent({ today }: { today: string }) {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const dashboards = useSportsDashboards(sportLeague);
  const nhl = usePicks();
  const nba = useNBAPicks();

  const activeRecord = useMemo(() => {
    const nhlRecord = computePickRecord(Object.values(nhl.allPicks).flat());
    const nbaRecord = computePickRecord(Object.values(nba.allPicks).flat());

    if (sportLeague === "NBA") return nbaRecord;
    if (sportLeague === "All") {
      return computePickRecord([
        ...Object.values(nhl.allPicks).flat(),
        ...Object.values(nba.allPicks).flat(),
      ]);
    }
    return nhlRecord;
  }, [nba.allPicks, nhl.allPicks, sportLeague]);

  const clubRows = useMemo(
    () => buildClubRows(dashboards.props, dashboards.teamTrends).slice(0, 5),
    [dashboards.props, dashboards.teamTrends],
  );
  const sgps = useMemo(
    () => buildSGPSuggestions(dashboards.props, 3),
    [dashboards.props],
  );
  const trendingRows = useMemo(
    () => buildTrendingRows(dashboards.props, 5),
    [dashboards.props],
  );

  return (
    <main className="min-h-screen bg-dark-bg pb-24">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <section className="relative overflow-hidden rounded-[28px] border border-dark-border bg-[radial-gradient(circle_at_top_left,rgba(74,158,255,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.16),transparent_34%),linear-gradient(180deg,#161b26_0%,#0d1118_100%)] px-5 py-6 shadow-[0_16px_60px_rgba(0,0,0,0.32)]">
          <div className="relative z-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-accent-blue/80">Goosalytics</p>
            <h1 className="text-white text-[32px] leading-none font-black mt-3">GOOSE AI PICKS</h1>
            <p className="text-sm text-gray-400 mt-3">{today}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300">
                {formatRecordSummary(activeRecord.wins, activeRecord.losses, activeRecord.pushes, activeRecord.profitUnits)}
              </span>
              <span className="rounded-full border border-dark-border bg-dark-bg/70 px-3 py-1.5 text-xs font-medium text-gray-300">
                {sportLeague === "All" ? "Combined season record" : `${sportLeague} season record`}
              </span>
            </div>
          </div>
        </section>

        <LeagueSwitcher active={sportLeague} onChange={setLeague} />

        <HomePicksSection league={sportLeague} />

        <HomeSection
          title="100% Club"
          subtitle="Perfect and near-perfect player props plus team trends with at least five samples."
          href="/props"
        >
          {dashboards.loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 rounded-2xl bg-dark-border/40 animate-pulse" />
              ))}
            </div>
          ) : clubRows.length === 0 ? (
            <EmptyStateCard
              eyebrow="100% Club"
              title="No elite trends on the board yet"
              body="This section populates once props or team trends hit an 80% rate with a five-game sample."
              className="mx-0 mt-0"
            />
          ) : (
            <div className="space-y-3">
              {clubRows.map((row) => <TrendRow key={row.id} row={row} />)}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Same-Game Parlays"
          subtitle="Today’s strongest same-game combinations ranked by multiplied hit probability."
          href="/parlays"
        >
          {dashboards.loading ? (
            <div className="space-y-3">
              {[0, 1].map((item) => (
                <div key={item} className="h-48 rounded-2xl bg-dark-border/40 animate-pulse" />
              ))}
            </div>
          ) : sgps.length === 0 ? (
            <EmptyStateCard
              eyebrow="Parlays"
              title="No same-game builds cleared the bar"
              body="SGP cards appear when at least two high-trend props line up in the same matchup."
              className="mx-0 mt-0"
            />
          ) : (
            <div className="space-y-3">
              {sgps.map((sgp) => <SGPCard key={sgp.id} sgp={sgp} />)}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Trending Now"
          subtitle="The hottest live props across NHL and NBA, ranked by hit rate, sample, and edge."
          href="/trends"
        >
          {dashboards.loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-20 rounded-2xl bg-dark-border/40 animate-pulse" />
              ))}
            </div>
          ) : trendingRows.length === 0 ? (
            <EmptyStateCard
              eyebrow="Trending"
              title="No live props qualify right now"
              body="Once current slates post, the hottest props across both leagues will appear here automatically."
              className="mx-0 mt-0"
            />
          ) : (
            <div className="space-y-3">
              {trendingRows.map((row) => <TrendRow key={row.id} row={row} />)}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Today's Schedule"
          subtitle="Live slates with matchup cards and current odds."
          href="/schedule"
        >
          {sportLeague === "All" ? (
            <div className="space-y-4">
              <ScheduleBoard compact showHeader={false} />
              <NBAScheduleBoard compact showHeader={false} />
            </div>
          ) : sportLeague === "NBA" ? (
            <NBAScheduleBoard compact showHeader={false} />
          ) : (
            <ScheduleBoard compact showHeader={false} />
          )}
        </HomeSection>
      </div>
    </main>
  );
}
