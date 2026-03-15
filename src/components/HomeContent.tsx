"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { buildClubRows, buildQuickHitters, buildSGPSuggestions, buildTrendingRows, normalizeSportsLeague, type QuickHitterRow } from "@/lib/insights";
import { formatOdds } from "@/lib/edge-engine";
import { createBrowserClient } from "@/lib/supabase-client";
import EmptyStateCard from "@/components/EmptyStateCard";
import TeamLogo from "@/components/TeamLogo";
import HomePicksSection from "./HomePicksSection";
import LeagueSwitcher from "./LeagueSwitcher";
import SectionHeader from "./SectionHeader";
import SGPCard from "./SGPCard";
import TrendRow from "./TrendRow";
import { Zap } from "lucide-react";

function QuickHitterCard({ row }: { row: QuickHitterRow }) {
  return (
    <div className="mx-3 my-3 rounded-2xl border border-dark-border/80 bg-gradient-to-br from-dark-surface/60 to-dark-bg p-4 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)] transition-all hover:-translate-y-[2px] hover:border-accent-blue/40 group">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue shadow-[inset_0_0_15px_rgba(74,158,255,0.1)] group-hover:bg-accent-blue/20 transition-colors">
          <Zap size={20} className="text-accent-blue" fill="currentColor" fillOpacity={0.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="truncate text-[15px] font-heading font-bold text-text-platinum group-hover:text-white transition-colors">{row.title}</p>
            <span className="rounded bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent-blue font-mono">
              {row.paceLabel}
            </span>
            <span className="text-[9px] uppercase tracking-widest text-text-platinum/30 font-mono font-bold">{row.league}</span>
          </div>
          <p className="text-[13px] text-text-platinum/70 leading-snug">{row.marketLabel}</p>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] font-sans font-semibold text-text-platinum/50 bg-dark-bg/50 border border-dark-border/40 inline-flex px-2 py-1 rounded">
            <TeamLogo team={row.team} size={16} color={row.teamColor} />
            <span>{row.subtitle}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end pt-1">
          {typeof row.odds === "number" && (
            <p className="text-[13px] font-mono font-bold text-text-platinum mb-2">{formatOdds(row.odds)}</p>
          )}
          <p className="rounded px-2.5 py-1 font-mono text-sm font-bold text-accent-green leading-none drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
            {Math.round(row.hitRate)}%
          </p>
        </div>
      </div>
    </div>
  );
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
    <section className="mb-10 last:mb-0">
      <SectionHeader title={title} subtitle={subtitle} href={href} />
      <div className="mt-4 bg-dark-bg/30 rounded-[32px] py-2">
        {children}
      </div>
    </section>
  );
}

export default function HomeContent() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const dashboards = useSportsDashboards(sportLeague);
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerInitial, setViewerInitial] = useState("G");

  const clubRows = useMemo(
    () => buildClubRows(dashboards.props, dashboards.teamTrends).slice(0, 5),
    [dashboards.props, dashboards.teamTrends],
  );
  const quickHitters = useMemo(
    () => buildQuickHitters(dashboards.props, 5, dashboards.teamTrends),
    [dashboards.props],
  );
  const sgps = useMemo(
    () => buildSGPSuggestions(dashboards.props, 3),
    [dashboards.props],
  );
  const trendingRows = useMemo(
    () => buildTrendingRows(dashboards.props, 5),
    [dashboards.props],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const supabase = createBrowserClient();
      const result = await supabase.auth.getSession();
      if (cancelled) return;

      const name = result.data.profile?.name || result.data.user?.name || result.data.user?.email || null;
      setViewerName(name);
      setViewerInitial((name || "G").charAt(0).toUpperCase());
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-dark-bg pb-32 pt-6">
      <div className="max-w-3xl mx-auto px-4 lg:px-6 space-y-8">
        <header className="flex items-center justify-between mb-8">
          <div>
            <img src="/logo.jpg" alt="Goosalytics" className="h-14 w-auto rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.05)]" />
          </div>

          {viewerName ? (
            <Link
              href="/settings"
              aria-label="Open settings"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-surface border border-dark-border text-base font-bold font-sans text-text-platinum hover:text-white hover:border-gray-500 hover:bg-dark-card transition-all"
            >
              {viewerInitial}
            </Link>
          ) : (
            <Link href="/login" className="px-5 py-2.5 rounded-full bg-accent-blue text-sm font-bold text-dark-bg hover:bg-accent-blue/90 hover:shadow-[0_0_15px_rgba(74,158,255,0.4)] transition-all">
              Sign In
            </Link>
          )}
        </header>

        <LeagueSwitcher active={sportLeague} onChange={setLeague} />

        <div className="mb-10">
           <HomePicksSection league={sportLeague} />
        </div>

        <HomeSection
          title="100% Club"
          subtitle="Perfect and near-perfect player props plus team trends with at least five samples."
          href="/props"
        >
          {dashboards.loading ? (
            <div className="space-y-4 px-3 py-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 rounded-2xl bg-dark-surface/50 border border-dark-border/40 animate-pulse" />
              ))}
            </div>
          ) : clubRows.length === 0 ? (
            <EmptyStateCard
              eyebrow="100% Club"
              title="No elite trends on the board yet"
              body="This section populates once props or team trends hit an 80% rate with a five-game sample."
            />
          ) : (
            <div className="space-y-0">
              {clubRows.map((row) => <TrendRow key={row.id} row={row} />)}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Quick Hitters"
          subtitle="Low-line props with high hit rates. Easy money, quick cash."
        >
          {dashboards.loading ? (
            <div className="space-y-4 px-3 py-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 rounded-2xl bg-dark-surface/50 border border-dark-border/40 animate-pulse" />
              ))}
            </div>
          ) : quickHitters.length === 0 ? (
            <EmptyStateCard
              eyebrow="Quick Hitters"
              title="No low-line heaters cleared the bar"
              body="This section populates when short-line props hit at least a 55% rate."
            />
          ) : (
            <div className="space-y-0">
              {quickHitters.map((row) => <QuickHitterCard key={row.id} row={row} />)}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Same-Game Parlays"
          subtitle="Today’s strongest same-game combinations ranked by multiplied hit probability."
          href="/parlays"
        >
          {dashboards.loading ? (
            <div className="space-y-4 px-3 py-2">
              {[0, 1].map((item) => (
                <div key={item} className="h-56 rounded-[24px] bg-dark-surface/50 border border-dark-border/40 animate-pulse border-l-[3px] border-l-dark-border" />
              ))}
            </div>
          ) : sgps.length === 0 ? (
            <EmptyStateCard
              eyebrow="Parlays"
              title="No same-game builds cleared the bar"
              body="SGP cards appear when at least two high-trend props line up in the same matchup."
            />
          ) : (
            <div className="space-y-0">
              {sgps.map((sgp) => <SGPCard key={sgp.id} sgp={sgp} />)}
            </div>
          )}
        </HomeSection>

        <HomeSection
          title="Trending Now"
          subtitle="The hottest live props across NHL, NBA, and MLB, ranked by hit rate, sample, and edge."
          href="/trends"
        >
          {dashboards.loading ? (
            <div className="space-y-4 px-3 py-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-24 rounded-2xl bg-dark-surface/50 border border-dark-border/40 animate-pulse" />
              ))}
            </div>
          ) : trendingRows.length === 0 ? (
            <EmptyStateCard
              eyebrow="Trending"
              title="No live props qualify right now"
              body="Once current slates post, the hottest props across both leagues will appear here automatically."
            />
          ) : (
            <div className="space-y-0">
              {trendingRows.map((row) => <TrendRow key={row.id} row={row} />)}
            </div>
          )}
        </HomeSection>
      </div>
    </main>
  );
}
