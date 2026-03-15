"use client";

import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { useSportsDashboards } from "@/hooks/useSportsDashboards";
import { buildSGPSuggestions, normalizeSportsLeague } from "@/lib/insights";
import EmptyStateCard from "@/components/EmptyStateCard";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import SGPCard from "@/components/SGPCard";

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
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-white">Same-Game Parlays</h1>
            <p className="text-xs text-gray-500 mt-0.5">Grouped by matchup, ranked by combined hit probability.</p>
          </div>
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
      </header>

      {dashboards.loading ? (
        <EmptyStateCard
          eyebrow="SGP builder"
          title="Building same-game parlay combinations"
          body="Goosalytics is grouping live props by matchup and testing the strongest two- and three-leg combinations."
        />
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
                  className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
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
            {activeSuggestions.map((sgp) => <SGPCard key={sgp.id} sgp={sgp} />)}
          </div>
        </div>
      )}
    </div>
  );
}
