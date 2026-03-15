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

function QuickHitterCard({ row }: { row: QuickHitterRow }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/80 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-blue/10 text-lg text-accent-blue">
          ϟ
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-semibold text-white">{row.title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
              row.paceLabel === "LOW" 
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-accent-blue/20 bg-accent-blue/10 text-accent-blue"
            }`}>
              {row.paceLabel === "LOW" ? "EZ" : row.paceLabel}
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-gray-600">{row.league}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <TeamLogo team={row.team} size={20} color={row.teamColor} />
            <span>{row.subtitle}</span>
          </div>
          <p className="mt-2 text-sm text-gray-200">{row.marketLabel}</p>
        </div>
        <div className="shrink-0 text-right">
          {typeof row.odds === "number" && (
            <p className="text-xs font-semibold text-white">{formatOdds(row.odds)}</p>
          )}
          <p className="mt-1 rounded-full border border-accent-green/20 bg-accent-green/10 px-2.5 py-1 text-[11px] font-semibold text-accent-green">
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
    <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <SectionHeader title={title} subtitle={subtitle} href={href} />
      <div className="mt-4">{children}</div>
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
    <main className="min-h-screen bg-dark-bg pb-24">
      <div className="mx-auto max-w-6xl px-4 py-5 space-y-5 lg:px-0 lg:py-1">
        <header className="flex items-center justify-between">
          <div>
            <img src="/logo.jpg" alt="Goosalytics" className="h-12 w-auto rounded-xl" />
          </div>

          {viewerName ? (
            <Link
              href="/settings"
              aria-label="Open settings"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-blue/20 text-sm font-bold text-accent-blue"
            >
              {viewerInitial}
            </Link>
          ) : (
            <Link href="/login" className="text-sm font-semibold text-accent-blue">
              Sign In
            </Link>
          )}
        </header>

        <LeagueSwitcher active={sportLeague} onChange={setLeague} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start">
          <div className="space-y-5">
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
              title="Quick Hitters"
              subtitle="Low-line props with high hit rates. Easy money, quick cash."
            >
              {dashboards.loading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="h-20 rounded-2xl bg-dark-border/40 animate-pulse" />
                  ))}
                </div>
              ) : quickHitters.length === 0 ? (
                <EmptyStateCard
                  eyebrow="Quick Hitters"
                  title="No low-line heaters cleared the bar"
                  body="This section populates when short-line props hit at least a 55% rate."
                  className="mx-0 mt-0"
                />
              ) : (
                <div className="space-y-3">
                  {quickHitters.map((row) => <QuickHitterCard key={row.id} row={row} />)}
                </div>
              )}
            </HomeSection>
          </div>

          <div className="space-y-5">
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
              subtitle="The hottest live props across NHL, NBA, and MLB, ranked by hit rate, sample, and edge."
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
          </div>
        </div>
      </div>
    </main>
  );
}
