"use client";

import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { buildSGPSuggestions, normalizeSportsLeague } from "@/lib/insights";
import EmptyStateCard from "@/components/EmptyStateCard";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import SGPCard from "@/components/SGPCard";
import PageHeader from "@/components/PageHeader";
import LockedFeature from "@/components/LockedFeature";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import { getStaggerStyle } from "@/lib/stagger-style";

export default function ParlaysPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const dashboards = useSportsDashboards(sportLeague);
  const sgps = useMemo(() => buildSGPSuggestions(dashboards.props, 8), [dashboards.props]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    if (!sgps.length) {
      setActiveGameId(null);
      return;
    }

    setActiveGameId((current) => current && sgps.some((sgp) => sgp.gameId === current)
      ? current
      : sgps[0].gameId || sgps[0].id);
  }, [sgps]);

  const games = useMemo(() => {
    const seen = new Set<string>();
    return sgps.filter((sgp) => {
      const key = sgp.gameId || sgp.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sgps]);

  const activeSuggestions = sgps.filter((sgp) => (sgp.gameId || sgp.id) === activeGameId);

  return (
    <div>
      <PageHeader
        title="Parlay Builder"
        subtitle="Same-game combinations ranked by multiplied hit probability."
        right={<LeagueSwitcher active={sportLeague} onChange={setLeague} />}
      />

      <LockedFeature feature="sgp_builder">
        {dashboards.loading ? (
          <div className="space-y-3 px-4 py-4">
            {[0, 1].map((index) => <CardSkeleton key={index} className="h-48" />)}
          </div>
        ) : sgps.length === 0 ? (
          <EmptyStateCard
            eyebrow="No SGPs yet"
            title="No same-game builds cleared the quality threshold"
            body="This page only shows parlays when at least two strong props exist in the same game. Check back as more lines post."
          />
        ) : (
          <div className="px-4 py-4 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {games.map((sgp) => {
                const key = sgp.gameId || sgp.id;
                const active = key === activeGameId;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveGameId(key)}
                    className={`tap-button min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
                      active
                        ? "border-accent-blue/40 bg-accent-blue/15 text-accent-blue"
                        : "border-dark-border bg-dark-surface text-gray-400"
                    }`}
                  >
                    {sgp.matchup}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {activeSuggestions.map((sgp, index) => (
                <div key={sgp.id} className="stagger-in" style={getStaggerStyle(index)}>
                  <SGPCard sgp={sgp} />
                </div>
              ))}
            </div>
          </div>
        )}
      </LockedFeature>
    </div>
  );
}
