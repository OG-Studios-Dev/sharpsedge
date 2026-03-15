"use client";

import { useState, useMemo } from "react";
import { usePicks, useNBAPicks, useMLBPicks } from "@/hooks/usePicks";
import { AIPick } from "@/lib/types";
import { computePickRecord } from "@/lib/pick-record";
import TeamLogo from "@/components/TeamLogo";
import Link from "next/link";

type SportFilter = "all" | "NHL" | "NBA" | "MLB";

function displayHitRate(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getMonthKey(dateStr: string) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function formatMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function ResultBadge({ result }: { result: AIPick["result"] }) {
  if (result === "win") return <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1">W ✓</span>;
  if (result === "loss") return <span className="text-xs font-bold text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1">L ✗</span>;
  if (result === "push") return <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 rounded-lg px-2.5 py-1">P</span>;
  return <span className="text-xs font-bold text-gray-500 bg-gray-500/10 rounded-lg px-2.5 py-1">⏳</span>;
}

export default function PickHistoryPage() {
  const { allPicks: nhlAll } = usePicks();
  const { allPicks: nbaAll } = useNBAPicks();
  const { allPicks: mlbAll } = useMLBPicks();
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // Merge all picks with league tags
  const allPicks = useMemo(() => {
    const picks: (AIPick & { _date: string })[] = [];
    for (const [date, datePicks] of Object.entries(nhlAll)) {
      for (const p of datePicks) picks.push({ ...p, _date: date, league: p.league || "NHL" });
    }
    for (const [date, datePicks] of Object.entries(nbaAll)) {
      for (const p of datePicks) picks.push({ ...p, _date: date, league: p.league || "NBA" });
    }
    for (const [date, datePicks] of Object.entries(mlbAll)) {
      for (const p of datePicks) picks.push({ ...p, _date: date, league: p.league || "MLB" });
    }
    return picks.sort((a, b) => b._date.localeCompare(a._date));
  }, [mlbAll, nbaAll, nhlAll]);

  // Get unique months for filter
  const months = useMemo(() => {
    const set = new Set(allPicks.map((p) => getMonthKey(p._date)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [allPicks]);

  // Apply filters
  const filtered = useMemo(() => {
    return allPicks.filter((p) => {
      if (sportFilter !== "all" && p.league !== sportFilter) return false;
      if (monthFilter !== "all" && getMonthKey(p._date) !== monthFilter) return false;
      return true;
    });
  }, [allPicks, sportFilter, monthFilter]);

  // Compute stats
  const record = computePickRecord(filtered);
  const winPct = (record.wins + record.losses) > 0
    ? ((record.wins / (record.wins + record.losses)) * 100).toFixed(1)
    : "0.0";

  // Group by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, (AIPick & { _date: string })[]>();
    for (const pick of filtered) {
      const current = map.get(pick._date) || [];
      current.push(pick);
      map.set(pick._date, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <main className="min-h-screen bg-dark-bg pb-24 pt-6 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/picks" className="text-accent-blue text-xs font-medium mb-1 block">← Back to Picks</Link>
          <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg" />
          <p className="text-gray-500 text-xs mt-0.5">All-time AI pick performance</p>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 mb-4">
        <div className="grid grid-cols-5 gap-3 text-center">
          <div>
            <p className="text-accent-green font-bold text-xl">{record.wins}</p>
            <p className="text-gray-500 text-[10px] uppercase">Wins</p>
          </div>
          <div>
            <p className="text-accent-red font-bold text-xl">{record.losses}</p>
            <p className="text-gray-500 text-[10px] uppercase">Losses</p>
          </div>
          <div>
            <p className="text-accent-yellow font-bold text-xl">{record.pushes}</p>
            <p className="text-gray-500 text-[10px] uppercase">Push</p>
          </div>
          <div>
            <p className={`font-bold text-xl ${parseFloat(winPct) >= 60 ? "text-accent-green" : parseFloat(winPct) >= 50 ? "text-white" : "text-accent-red"}`}>
              {winPct}%
            </p>
            <p className="text-gray-500 text-[10px] uppercase">Win %</p>
          </div>
          <div>
            <p className={`font-bold text-xl ${record.profitUnits > 0 ? "text-accent-green" : record.profitUnits < 0 ? "text-accent-red" : "text-gray-400"}`}>
              {record.profitUnits > 0 ? "+" : ""}{record.profitUnits}u
            </p>
            <p className="text-gray-500 text-[10px] uppercase">Units</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {/* Sport Filter */}
        {(["all", "NHL", "NBA", "MLB"] as SportFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setSportFilter(s)}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              sportFilter === s
                ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                : "border-dark-border text-gray-500"
            }`}
          >
            {s === "all" ? "All Sports" : s}
          </button>
        ))}

        <div className="w-px bg-dark-border/50 shrink-0" />

        {/* Month Filter */}
        <button
          onClick={() => setMonthFilter("all")}
          className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
            monthFilter === "all"
              ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
              : "border-dark-border text-gray-500"
          }`}
        >
          All Time
        </button>
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonthFilter(m)}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              monthFilter === m
                ? "bg-accent-blue/15 border-accent-blue/40 text-accent-blue"
                : "border-dark-border text-gray-500"
            }`}
          >
            {formatMonth(m)}
          </button>
        ))}
      </div>

      {/* Pending count */}
      {record.pending > 0 && (
        <p className="text-[11px] text-gray-500 mb-3">{record.pending} pick{record.pending !== 1 ? "s" : ""} still pending</p>
      )}

      {/* Pick list grouped by date */}
      {groupedByDate.length === 0 ? (
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-6 text-center">
          <p className="text-gray-400 text-sm">No picks yet. Check back after today&apos;s games.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByDate.map(([date, picks]) => {
            const dayRecord = computePickRecord(picks);
            const dayWinPct = (dayRecord.wins + dayRecord.losses) > 0
              ? Math.round((dayRecord.wins / (dayRecord.wins + dayRecord.losses)) * 100)
              : null;
            return (
              <div key={date} className="rounded-2xl border border-dark-border/70 bg-dark-surface/40 overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-dark-bg/40 border-b border-dark-border/40">
                  <p className="text-gray-300 text-xs font-semibold">{formatDate(date)}</p>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                    <span className="text-emerald-400">{dayRecord.wins}W</span>
                    <span className="text-red-400">{dayRecord.losses}L</span>
                    {dayRecord.pushes > 0 && <span className="text-yellow-400">{dayRecord.pushes}P</span>}
                    {dayRecord.pending > 0 && <span className="text-gray-500">{dayRecord.pending}⏳</span>}
                    {dayWinPct !== null && (
                      <span className={`ml-1 ${dayWinPct >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                        {dayWinPct}%
                      </span>
                    )}
                    <span className={`ml-1 ${dayRecord.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {dayRecord.profitUnits >= 0 ? "+" : ""}{dayRecord.profitUnits}u
                    </span>
                  </div>
                </div>
                {/* Pick rows */}
                <div className="divide-y divide-dark-border/30">
                  {picks.map((pick) => (
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
                          <p className="text-white text-xs font-medium truncate">{pick.pickLabel}</p>
                          {pick.league && (
                            <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-gray-500 text-[10px]">{pick.isAway ? "@" : "vs"} {pick.opponent}</p>
                          <span className="text-[9px] text-gray-600">
                            {displayHitRate(pick.hitRate)} hit
                          </span>
                        </div>
                      </div>
                      <ResultBadge result={pick.result} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
