"use client";

import { useState } from "react";
import Link from "next/link";
import { usePicks, useNBAPicks } from "@/hooks/usePicks";
import { useLeague } from "@/hooks/useLeague";
import { AIPick } from "@/lib/types";
import { normalizeSportsLeague } from "@/lib/insights";
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

function PickCard({ pick, isExpanded, onToggle }: { pick: AIPick; isExpanded: boolean; onToggle: () => void }) {
  const showBookOdds = Boolean(pick.book && pick.book !== "Model Line");

  return (
    <div
      className={`rounded-2xl border bg-dark-surface p-4 space-y-2 cursor-pointer transition-all ${
        isExpanded ? "border-accent-blue/40 ring-1 ring-accent-blue/20" : "border-dark-border"
      }`}
      onClick={onToggle}
    >
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
        <div className="flex items-center gap-2">
          <ResultPill result={pick.result} />
          <span className={`text-[10px] text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
        </div>
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

      {/* Expanded AI Analysis */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-dark-border/50 space-y-3">
          {/* AI Reasoning */}
          {pick.reasoning && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-blue mb-1.5">🤖 AI Analysis</p>
              <p className="text-gray-300 text-xs leading-relaxed">
                {pick.reasoning}
              </p>
            </div>
          )}

          {/* Key Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-dark-bg/60 border border-dark-border/40 p-2.5 text-center">
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">Hit Rate</p>
              <p className="text-accent-green font-bold text-sm mt-0.5">{displayHitRate(pick.hitRate)}</p>
            </div>
            <div className="rounded-xl bg-dark-bg/60 border border-dark-border/40 p-2.5 text-center">
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">Edge</p>
              <p className="text-accent-blue font-bold text-sm mt-0.5">{displayEdge(pick.edge)}</p>
            </div>
            <div className="rounded-xl bg-dark-bg/60 border border-dark-border/40 p-2.5 text-center">
              <p className="text-[9px] text-gray-500 uppercase tracking-wide">Odds</p>
              <p className="text-white font-bold text-sm mt-0.5">{formatAmericanOdds(pick.odds)}</p>
            </div>
          </div>

          {/* Confidence Bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Confidence</p>
              <p className="text-[10px] text-gray-400 font-semibold">{pick.confidence ?? Math.round(pick.hitRate)}%</p>
            </div>
            <div className="h-1.5 bg-dark-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (pick.confidence ?? pick.hitRate) >= 80 ? "bg-accent-green" :
                  (pick.confidence ?? pick.hitRate) >= 60 ? "bg-accent-blue" : "bg-accent-yellow"
                }`}
                style={{ width: `${Math.min(pick.confidence ?? pick.hitRate, 100)}%` }}
              />
            </div>
          </div>

          {/* Pick Details */}
          <div className="flex items-center gap-2 flex-wrap">
            {pick.type === "player" && (
              <span className="text-[9px] bg-dark-bg/60 border border-dark-border/40 text-gray-400 rounded-full px-2 py-0.5">
                Player Prop
              </span>
            )}
            {pick.type === "team" && (
              <span className="text-[9px] bg-dark-bg/60 border border-dark-border/40 text-gray-400 rounded-full px-2 py-0.5">
                Team Trend
              </span>
            )}
            {pick.book && pick.book !== "Model Line" && (
              <span className="text-[9px] bg-dark-bg/60 border border-dark-border/40 text-gray-400 rounded-full px-2 py-0.5">
                📖 {pick.book}
              </span>
            )}
            <span className="text-[9px] bg-dark-bg/60 border border-dark-border/40 text-gray-400 rounded-full px-2 py-0.5">
              🎯 1 unit
            </span>
          </div>
        </div>
      )}

      {/* Collapsed hint */}
      {!isExpanded && pick.reasoning && (
        <p className="text-gray-600 text-[10px]">Tap for AI analysis ↓</p>
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

type PastFilter = "all" | "win" | "loss" | "push";

function computeRecord(picks: AIPick[]) {
  return computePickRecord(picks);
}

export default function PicksPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
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
  const [expandedPickId, setExpandedPickId] = useState<string | null>(null);

  const todayKey = localTodayKey();

  // Merge picks stores based on league
  const activeToday = sportLeague === "NBA" ? nbaToday
    : sportLeague === "All" ? [...nhlToday, ...nbaToday]
    : nhlToday;

  const activeAll: Record<string, AIPick[]> = {};
  const mergeStore = (store: Record<string, AIPick[]>) => {
    for (const [date, picks] of Object.entries(store)) {
      if (!activeAll[date]) activeAll[date] = [];
      activeAll[date].push(...picks);
    }
  };
  if (sportLeague === "NHL" || sportLeague === "All") mergeStore(nhlAll);
  if (sportLeague === "NBA" || sportLeague === "All") mergeStore(nbaAll);

  const allFlat = Object.values(activeAll).flat();
  const activeRecord = computeRecord(allFlat);
  const activeStalePickCount = sportLeague === "NBA"
    ? nbaStalePickCount
    : sportLeague === "All"
      ? nhlStalePickCount + nbaStalePickCount
      : nhlStalePickCount;

  const loading = sportLeague === "NBA" ? nbaLoading : sportLeague === "All" ? (nhlLoading || nbaLoading) : nhlLoading;

  // Per-league records for combined view
  const nhlFlat = Object.values(nhlAll).flat();
  const nbaFlat = Object.values(nbaAll).flat();
  const nhlRec = computeRecord(nhlFlat);
  const nbaRec = computeRecord(nbaFlat);

  // Pick History: all past dates (including pending), sorted newest first
  const pastDates = Object.keys(activeAll)
    .filter((d) => d !== todayKey)
    .sort((a, b) => b.localeCompare(a));

  const runningUnitsByDate = (() => {
    const totals: Record<string, number> = {};
    let running = 0;
    for (const date of [...pastDates].sort()) {
      running += computeRecord(activeAll[date] || []).profitUnits;
      totals[date] = running;
    }
    return totals;
  })();

  // Flat list of all past picks for history
  const allHistoryPicks = pastDates.flatMap((d) =>
    (activeAll[d] || []).map((p) => ({ ...p, _date: d }))
  );

  function filterHistoryPicks(picks: (AIPick & { _date: string })[]) {
    if (pastFilter === "all") return picks;
    return picks.filter((p) => p.result === pastFilter);
  }

  function handleClearStalePicks() {
    if (sportLeague === "NBA") {
      clearNBAStalePicks();
      return;
    }
    if (sportLeague === "All") {
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
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
      </div>

      {/* Record Card — tappable to drill down */}
      <Link href="/picks/history">
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 mb-4 cursor-pointer hover:border-accent-blue/30 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">
            {sportLeague === "All" ? "Combined" : sportLeague} Season Record
          </p>
          <span className="text-[10px] text-accent-blue font-medium">View History →</span>
        </div>
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
        {sportLeague === "All" && (
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
      </Link>

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
            title={`No ${sportLeague === "All" ? "" : sportLeague + " "}picks today`}
            body="Check back when games are scheduled to see today's top AI picks."
          />
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {activeToday.map((pick) => (
            <PickCard
              key={pick.id}
              pick={pick}
              isExpanded={expandedPickId === pick.id}
              onToggle={() => setExpandedPickId(expandedPickId === pick.id ? null : pick.id)}
            />
          ))}
        </div>
      )}

      {/* Pick History */}
      {allHistoryPicks.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3 mt-4">
            <p className="text-white text-sm font-bold uppercase tracking-wide">
              Pick History
            </p>
            <div className="flex gap-1">
              {(["all", "win", "loss", "push"] as PastFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setPastFilter(f)}
                  className={`text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border transition-colors ${
                    pastFilter === f
                      ? f === "win"
                        ? "bg-accent-green/20 border-accent-green text-accent-green"
                        : f === "loss"
                          ? "bg-accent-red/20 border-accent-red text-accent-red"
                          : f === "push"
                            ? "bg-accent-yellow/20 border-accent-yellow text-accent-yellow"
                          : "bg-dark-surface border-accent-blue text-accent-blue"
                      : "border-dark-border text-gray-500"
                  }`}
                >
                  {f === "all" ? "All" : f === "win" ? "Won" : f === "loss" ? "Lost" : "Push"}
                </button>
              ))}
            </div>
          </div>

          {/* Daily grouped history */}
          <div className="space-y-3">
            {pastDates.map((date) => {
              const dayPicks = (activeAll[date] || []).map((p) => ({ ...p, _date: date }));
              const filtered = filterHistoryPicks(dayPicks);
              if (!filtered.length) return null;
              const dailyRecord = computeRecord(activeAll[date]);
              const dailyWinPct = (dailyRecord.wins + dailyRecord.losses) > 0
                ? Math.round((dailyRecord.wins / (dailyRecord.wins + dailyRecord.losses)) * 100)
                : null;
              const dailyUnits = dailyRecord.profitUnits;
              const runningUnits = runningUnitsByDate[date] ?? dailyUnits;
              return (
                <div key={date} className="rounded-2xl border border-dark-border/70 bg-dark-surface/40 overflow-hidden">
                  {/* Day header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark-bg/40 border-b border-dark-border/40">
                    <div>
                      <p className="text-gray-300 text-xs font-semibold">{formatDate(date)}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Running total {runningUnits > 0 ? "+" : ""}{runningUnits}u
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase flex-wrap justify-end">
                      <span className="text-emerald-400">{dailyRecord.wins}W</span>
                      <span className="text-red-400">{dailyRecord.losses}L</span>
                      {dailyRecord.pushes > 0 && <span className="text-yellow-400">{dailyRecord.pushes}P</span>}
                      {dailyRecord.pending > 0 && <span className="text-gray-500">{dailyRecord.pending}⏳</span>}
                      <span className={dailyUnits >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {dailyUnits >= 0 ? "+" : ""}{dailyUnits}u
                      </span>
                      {dailyWinPct !== null && (
                        <span className={dailyWinPct >= 50 ? "text-emerald-400" : "text-red-400"}>
                          {dailyWinPct}%
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Pick rows */}
                  <div className="divide-y divide-dark-border/30">
                    {filtered.map((pick) => (
                      <div
                        key={pick.id}
                        className={`px-4 py-3 flex items-center gap-3 ${
                          pick.result === "win" ? "border-l-2 border-l-emerald-500" :
                          pick.result === "loss" ? "border-l-2 border-l-red-500" :
                          pick.result === "push" ? "border-l-2 border-l-yellow-500" :
                          "border-l-2 border-l-gray-600"
                        }`}
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
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-gray-500 text-[10px]">
                              {pick.isAway ? "@" : "vs"} {pick.opponent}
                            </p>
                            <span className="text-[9px] text-gray-600">
                              {displayHitRate(pick.hitRate)} hit · {displayEdge(pick.edge)} edge
                            </span>
                          </div>
                        </div>
                        {pick.result === "win" ? (
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1">W ✓</span>
                        ) : pick.result === "loss" ? (
                          <span className="text-xs font-bold text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1">L ✗</span>
                        ) : pick.result === "push" ? (
                          <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 rounded-lg px-2.5 py-1">P</span>
                        ) : (
                          <span className="text-xs font-bold text-gray-500 bg-gray-500/10 rounded-lg px-2.5 py-1">⏳</span>
                        )}
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
