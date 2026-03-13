"use client";

import { useLeague } from "@/hooks/useLeague";
import LeagueSelector from "@/components/LeagueSelector";
import EmptyStateCard from "@/components/EmptyStateCard";

export default function ParlaysPage() {
  const [league, setLeague] = useLeague();
  const sportLabel = league === "NBA" ? "NBA" : league === "All" ? "cross-sport" : "NHL";

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-white">Parlays</h1>
            <p className="text-xs text-gray-500 mt-0.5">Held back until pricing and legs are live.</p>
          </div>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>
      </header>

      <EmptyStateCard
        eyebrow="Disabled"
        title={`No live ${sportLabel} parlays in this build`}
        body="Parlay cards were using illustrative legs instead of live bookable prices, so they’ve been removed. Use Picks for current recommendations and Props for market-by-market research."
      />

      <div className="px-4 pb-6 grid gap-3 sm:grid-cols-2">
        <a href="/picks" className="rounded-2xl border border-dark-border bg-dark-surface px-4 py-4 transition-colors hover:border-gray-600">
          <p className="text-white font-semibold">Open Picks</p>
          <p className="text-sm text-gray-400 mt-1">See the best current recommendations instead of placeholder parlays.</p>
        </a>
        <a href="/props" className="rounded-2xl border border-dark-border bg-dark-surface px-4 py-4 transition-colors hover:border-gray-600">
          <p className="text-white font-semibold">Open Props</p>
          <p className="text-sm text-gray-400 mt-1">Review individual player props and team trends with live data.</p>
        </a>
      </div>
    </div>
  );
}
