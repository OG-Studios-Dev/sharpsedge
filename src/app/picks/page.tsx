"use client";

import { useState } from "react";
import { usePicks, useNBAPicks } from "@/hooks/usePicks";
import { useLeague } from "@/hooks/useLeague";
import { AIPick } from "@/lib/types";
import { computePickRecord } from "@/lib/pick-record";
import LeagueSwitcher from "@/components/LeagueSwitcher";
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

function displayHitRate(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

function displayEdge(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function PickCard({ pick }: { pick: AIPick }) {
  const showBookOdds = Boolean(pick.book && pick.book !== "Model Line");

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-2">
      <div className="flex items-center gap-3">
        <TeamLogo team={pick.team} size={32} color={pick.teamColor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-white font-semibold text-sm truncate">
              {pick.type === "player" ? pick.playerName : pick.team}
            </p>
            {pick.league && (
              <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>
            )}
          </div>
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
        {showBookOdds && (
          <span className="text-[10px] bg-dark-bg/70 text-gray-300 rounded-full px-2 py-0.5 font-medium">
            {pick.book} {formatAmericanOdds(pick.odds)}
          </span>
        )}
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

function localTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PastFilter = "all" | "win" | "loss";

function computeRecord(picks: AIPick[]) {
  return computePickRecord(picks);
}

export default function PicksPage() {
  const [league, setLeague] = useLeague();
  const {
    todayPicks: nhlToday,
    allPicks: nhlAll,
    record: nhlRecord,
    loadingPicks: nhlLoading,
    stalePickCount: nhlStalePickCount,
    clearStalePicks: clearNHLStalePicks,
  } = usePicks();
  const {
    todayPicks: nbaToday,
    allPicks: nbaAll,
    record: nbaRecord,
    loadingPicks: nbaLoading,
    stalePickCount: nbaStalePickCount,
    clearStalePicks: clearNBAStalePicks,
  } = useNBAPicks();
  const [pastFilter, setPastFilter] = useState<PastFilter>("all");

  const todayKey = localTodayKey();

  // Merge picks stores based on league
  const activeToday = league === "NBA" ? nbaToday
    : league === "All" ? [...nhlToday, ...nbaToday]
    : nhlToday;

  const activeAll: Record<string, AIPick[]> = {};
  const mergeStore = (store: Record<string, AIPick[]>) => {
    for (const [date, picks] of Object.entries(store)) {
      if (!activeAll[date]) activeAll[date] = [];
      activeAll[date].push(...picks);
    }
  };
  if (league === "NHL" || league === "All") mergeStore(nhlAll);
  if (league === "NBA" || league === "All") mergeStore(nbaAll);

  const allFlat = Object.values(activeAll).flat();
  const activeRecord = computeRecord(allFlat);
  const activeStalePickCount = league === "NBA"
    ? nbaStalePickCount
    : league === "All"
      ? nhlStalePickCount + nbaStalePickCount
      : nhlStalePickCount;

  const loading = league === "NBA" ? nbaLoading : league === "All" ? (nhlLoading || nbaLoading) : nhlLoading;

  // Per-league records for combined view
  const nhlFlat = Object.values(nhlAll).flat();
  const nbaFlat = Object.values(nbaAll).flat();
  const nhlRec = computeRecord(nhlFlat);
  const nbaRec = computeRecord(nbaFlat);

  const pastDates = Object.keys(activeAll)
    .filter((d) => d !== todayKey)
    .filter((d) => activeAll[d].some((p) => p.result !== "pending"))
    .sort((a, b) => b.localeCompare(a));

  function filterPastPicks(picks: AIPick[]) {
    const resolved = picks.filter((p) => p.result !== "pending");
    if (pastFilter === "all") return resolved;
    return resolved.filter((p) => p.result === pastFilter);
  }

  function handleClearStalePicks() {
    if (league === "NBA") {
      clearNBAStalePicks();
      return;
    }
    if (league === "All") {
      clearNHLStalePicks();
      clearNBAStalePicks();
      return;
    }
    clearNHLStalePicks();
  }

  return (
    <main className="min-h-screen bg-dark-bg pb-24 pt-6 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-dark-bg pb-3 -mx-4 px-4 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold tracking-widest uppercase">GOOSE AI PICKS</h1>
            <p className="text-gray-500 text-xs mt-0.5">{formatDate(todayKey)}</p>
          </div>
          <LeagueSwitcher active={league} onChange={setLeague} />
        </div>
      </div>

      {/* Record Card */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 mb-4">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-3">
          {league === "All" ? "Combined" : league} Season Record
        </p>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-accent-green font-bold text-lg">{activeRecord.wins}</p>
            <p className="text-gray-500 text-[10px] uppercase">W</p>
          </div>
          <div className="text-center">
            <p className="text-accent-red font-bold text-lg">{activeRecord.losses}</p>
            <p className="text-gray-500 text-[10px] uppercase">L</p>
          </div>
          <div className="text-center">
            <p className="text-accent-yellow font-bold text-lg">{activeRecord.pushes}</p>
            <p className="text-gray-500 text-[10px] uppercase">Push</p>
          </div>
          <div className="text-center">
            <p className="text-gray-400 font-bold text-lg">{activeRecord.pending}</p>
            <p className="text-gray-500 text-[10px] uppercase">Pending</p>
          </div>
          <div className="ml-auto text-right">
            <p
              className={`font-bold text-lg ${
                activeRecord.profitUnits > 0
                  ? "text-accent-green"
                  : activeRecord.profitUnits < 0
                    ? "text-accent-red"
                    : "text-gray-400"
              }`}
            >
              {activeRecord.profitUnits > 0 ? "+" : ""}
              {activeRecord.profitUnits}u
            </p>
            <p className="text-gray-500 text-[10px] uppercase">Net Units</p>
          </div>
        </div>
        {league === "All" && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-dark-border/40">
            <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-dark-bg/40 border border-dark-border/40">
              <span className="text-[10px] text-gray-500 font-semibold">🏒 NHL</span>
              <span className="text-emerald-400 text-[11px] font-bold">{nhlRec.wins}W</span>
              <span className="text-red-400 text-[11px] font-bold">{nhlRec.losses}L</span>
              <span className={`ml-auto text-[11px] font-bold ${nhlRec.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {nhlRec.profitUnits >= 0 ? "+" : ""}{nhlRec.profitUnits}u
              </span>
            </div>
            <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-dark-bg/40 border border-dark-border/40">
              <span className="text-[10px] text-gray-500 font-semibold">🏀 NBA</span>
              <span className="text-emerald-400 text-[11px] font-bold">{nbaRec.wins}W</span>
              <span className="text-red-400 text-[11px] font-bold">{nbaRec.losses}L</span>
              <span className={`ml-auto text-[11px] font-bold ${nbaRec.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {nbaRec.profitUnits >= 0 ? "+" : ""}{nbaRec.profitUnits}u
              </span>
            </div>
          </div>
        )}
        {activeStalePickCount > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-border/40 flex items-center justify-between gap-3">
            <p className="text-[11px] text-amber-400">
              {activeStalePickCount} legacy pending pick{activeStalePickCount === 1 ? "" : "s"} missing a valid game ID.
            </p>
            <button
              onClick={handleClearStalePicks}
              className="text-[10px] font-semibold uppercase px-3 py-1.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10"
            >
              Clear stale picks
            </button>
          </div>
        )}
      </div>

      {/* Today's Picks */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-sm font-bold uppercase tracking-wide">
          Today&apos;s Goose AI Picks
        </p>
        <span className="text-[10px] text-gray-500">3 picks · 1u each</span>
      </div>

      {loading ? (
        <div className="space-y-3 mb-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : activeToday.length === 0 ? (
        <div className="mb-6">
          <EmptyStateCard
            eyebrow="AI Picks"
            title={`No ${league === "All" ? "" : league + " "}picks today`}
            body="Check back when games are scheduled to see today's top AI picks."
          />
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {activeToday.map((pick) => (
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
              const picks = filterPastPicks(activeAll[date]);
              if (!picks.length) return null;
              const dailyRecord = computeRecord(activeAll[date]);
              return (
                <div key={date} className="rounded-2xl border border-dark-border/70 bg-dark-surface/40 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-gray-300 text-xs font-medium">{formatDate(date)}</p>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase">
                      <span className="text-emerald-400">{dailyRecord.wins}W</span>
                      <span className="text-red-400">{dailyRecord.losses}L</span>
                      {dailyRecord.pushes > 0 && <span className="text-yellow-400">{dailyRecord.pushes} push</span>}
                      {dailyRecord.pending > 0 && <span className="text-gray-500">{dailyRecord.pending} pending</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {picks.map((pick) => (
                      <div
                        key={pick.id}
                        className="rounded-xl border border-dark-border bg-dark-card px-3 py-2.5 flex items-center gap-3"
                      >
                        <TeamLogo team={pick.team} size={24} color={pick.teamColor} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-white text-xs font-medium truncate">
                              {pick.pickLabel}
                            </p>
                            {pick.league && (
                              <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>
                            )}
                          </div>
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
