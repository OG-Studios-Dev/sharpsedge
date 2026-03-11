"use client";

import { useState } from "react";
import { usePicks } from "@/hooks/usePicks";
import { useLeague } from "@/hooks/useLeague";
import { AIPick } from "@/lib/types";
import LeagueSelector from "@/components/LeagueSelector";
import TeamLogo from "@/components/TeamLogo";
import EmptyStateCard from "@/components/EmptyStateCard";

function ResultPill({ result }: { result: AIPick["result"] }) {
  const styles: Record<AIPick["result"], string> = {
    pending: "border-gray-500 text-gray-400",
    win: "border-accent-green text-accent-green bg-accent-green/10",
    loss: "border-accent-red text-accent-red bg-accent-red/10",
    push: "border-accent-yellow text-accent-yellow bg-accent-yellow/10",
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${styles[result]}`}
    >
      {result}
    </span>
  );
}

// Normalize hit rate: stored values may be 0-1 decimal (old) or 0-100 (new)
function displayHitRate(val: number): string {
  const pct = val <= 1 ? Math.round(val * 100) : Math.round(val);
  return `${pct}%`;
}

// Normalize edge: stored as decimal (0.18) → display as "+18%"
function displayEdge(val: number): string {
  const pct = Math.abs(val) <= 1 ? Math.round(val * 100) : Math.round(val);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function PickCard({ pick }: { pick: AIPick }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-2">
      <div className="flex items-center gap-3">
        <TeamLogo team={pick.team} size={32} color={pick.teamColor} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {pick.type === "player" ? pick.playerName : pick.team}
          </p>
          <p className="text-gray-500 text-xs">
            {pick.isAway ? "@" : "vs"} {pick.opponent}
          </p>
        </div>
        <ResultPill result={pick.result} />
      </div>

      <p className="text-accent-blue font-medium text-sm">{pick.pickLabel}</p>

      <div className="flex items-center gap-2">
        <span className="text-[10px] bg-accent-green/10 text-accent-green rounded-full px-2 py-0.5 font-medium">
          {displayHitRate(pick.hitRate)} hit
        </span>
        <span className="text-[10px] bg-accent-blue/10 text-accent-blue rounded-full px-2 py-0.5 font-medium">
          {displayEdge(pick.edge)} edge
        </span>
        <span className="ml-auto text-[10px] text-gray-500 font-medium">1u</span>
      </div>

      {pick.reasoning && (
        <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">
          {pick.reasoning}
        </p>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-dark-border" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-dark-border rounded w-28" />
          <div className="h-3 bg-dark-border rounded w-20" />
        </div>
      </div>
      <div className="h-3.5 bg-dark-border rounded w-40" />
      <div className="flex gap-2">
        <div className="h-4 bg-dark-border rounded-full w-16" />
        <div className="h-4 bg-dark-border rounded-full w-16" />
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type PastFilter = "all" | "win" | "loss";

export default function PicksPage() {
  const [league, setLeague] = useLeague();
  const { todayPicks, allPicks, record, loadingPicks, refreshPicks } = usePicks();
  const [pastFilter, setPastFilter] = useState<PastFilter>("all");

  const todayKey = new Date().toISOString().slice(0, 10);

  // Past picks: only resolved (win/loss/push), not pending
  const pastDates = Object.keys(allPicks)
    .filter((d) => d !== todayKey)
    .filter((d) => allPicks[d].some((p) => p.result !== "pending"))
    .sort((a, b) => b.localeCompare(a));

  function filterPastPicks(picks: AIPick[]) {
    const resolved = picks.filter((p) => p.result !== "pending");
    if (pastFilter === "all") return resolved;
    return resolved.filter((p) => p.result === pastFilter);
  }

  return (
    <main className="min-h-screen bg-dark-bg pb-24 pt-6 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark-bg pb-3 -mx-4 px-4 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-semibold">AI Picks</h1>
            <p className="text-gray-500 text-xs mt-0.5">{formatDate(todayKey)}</p>
          </div>
          <LeagueSelector selected={league} onSelect={setLeague} />
        </div>
      </div>

      {/* Record Card */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 mb-4">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">
          Season Record
        </p>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-accent-green font-bold text-lg">{record.wins}</p>
            <p className="text-gray-500 text-[10px] uppercase">W</p>
          </div>
          <div className="text-center">
            <p className="text-accent-red font-bold text-lg">{record.losses}</p>
            <p className="text-gray-500 text-[10px] uppercase">L</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 font-bold text-lg">{record.pending}</p>
            <p className="text-gray-500 text-[10px] uppercase">Pending</p>
          </div>
          <div className="ml-auto text-right">
            <p
              className={`font-bold text-lg ${
                record.profitUnits > 0
                  ? "text-accent-green"
                  : record.profitUnits < 0
                    ? "text-accent-red"
                    : "text-gray-400"
              }`}
            >
              {record.profitUnits > 0 ? "+" : ""}
              {record.profitUnits}u
            </p>
            <p className="text-gray-500 text-[10px] uppercase">Net Units</p>
          </div>
        </div>
      </div>

      {/* Today's Picks */}
      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
        Today&apos;s Picks
      </p>

      {loadingPicks ? (
        <div className="space-y-3 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : todayPicks.length === 0 ? (
        <div className="mb-6">
          <EmptyStateCard
            eyebrow="AI Picks"
            title="No picks today"
            body="Check back when games are scheduled to see today's top AI picks."
          />
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {todayPicks.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}

      {/* Past Picks */}
      {pastDates.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 mt-2">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">
              Past Picks
            </p>
            <div className="flex gap-1">
              {(["all", "win", "loss"] as PastFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setPastFilter(f)}
                  className={`text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border transition-colors ${
                    pastFilter === f
                      ? f === "win"
                        ? "bg-accent-green/20 border-accent-green text-accent-green"
                        : f === "loss"
                          ? "bg-accent-red/20 border-accent-red text-accent-red"
                          : "bg-dark-surface border-accent-blue text-accent-blue"
                      : "border-dark-border text-gray-500"
                  }`}
                >
                  {f === "all" ? "All" : f === "win" ? "Won" : "Lost"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {pastDates.map((date) => {
              const picks = filterPastPicks(allPicks[date]);
              if (!picks.length) return null;
              return (
                <div key={date}>
                  <p className="text-gray-500 text-xs mb-1.5">{formatDate(date)}</p>
                  <div className="space-y-2">
                    {picks.map((pick) => (
                      <div
                        key={pick.id}
                        className="rounded-xl border border-dark-border bg-dark-card px-3 py-2.5 flex items-center gap-3"
                      >
                        <TeamLogo team={pick.team} size={24} color={pick.teamColor} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">
                            {pick.pickLabel}
                          </p>
                          <p className="text-gray-500 text-[10px]">
                            {pick.isAway ? "@" : "vs"} {pick.opponent}
                          </p>
                        </div>
                        <ResultPill result={pick.result} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
