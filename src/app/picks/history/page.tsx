"use client";

import { useState, useMemo } from "react";
import { Clock } from "lucide-react";
import { usePickHistory } from "@/hooks/usePickHistory";
import { computePickHistorySummary } from "@/lib/pick-history";
import type { PickHistoryRecord, PickSlateRecord } from "@/lib/supabase-types";
import TeamLogo from "@/components/TeamLogo";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

type SportFilter = "all" | "NHL" | "NBA" | "MLB" | "PGA";

function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return (0).toFixed(digits);
  return value.toFixed(digits);
}

function formatUnits(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function displayHitRate(val?: number | null): string {
  if (typeof val !== "number" || !Number.isFinite(val)) return "0.00%";
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${formatPercent(pct)}%`;
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

function ResultBadge({ result }: { result: PickHistoryRecord["result"] }) {
  if (result === "win") return <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1">W ✓</span>;
  if (result === "loss") return <span className="text-xs font-bold text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1">L ✗</span>;
  if (result === "push") return <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 rounded-lg px-2.5 py-1">P</span>;
  return <span className="text-xs font-bold text-gray-500 bg-gray-500/10 rounded-lg px-2.5 py-1 inline-flex items-center gap-0.5"><Clock size={11} /></span>;
}

function slateBadgeTone(slate: PickSlateRecord) {
  if (slate.integrity_status === "incomplete") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
}

function slateBadgeLabel(slate: PickSlateRecord) {
  if (slate.integrity_status === "incomplete") return `${slate.league} pending review`;
  return `${slate.league} locked`;
}

export default function PickHistoryPage() {
  const { picks: historyPicks, slates, loading, error } = usePickHistory();
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  // Get unique months for filter
  const months = useMemo(() => {
    const set = new Set(historyPicks.map((pick) => getMonthKey(pick.date)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [historyPicks]);

  const standardHistoryPicks = useMemo(() => historyPicks.filter((pick) => pick.league !== "PGA"), [historyPicks]);
  const pgaHistoryPicks = useMemo(() => historyPicks.filter((pick) => pick.league === "PGA"), [historyPicks]);

  // Apply filters
  const filtered = useMemo(() => {
    return historyPicks.filter((pick) => {
      if (sportFilter !== "all" && pick.league !== sportFilter) return false;
      if (monthFilter !== "all" && getMonthKey(pick.date) !== monthFilter) return false;
      return true;
    });
  }, [historyPicks, monthFilter, sportFilter]);

  const headlineRecords = useMemo(() => {
    // For "all" view: use filtered (respects monthFilter) but exclude PGA from headline stats.
    // For specific sport: use filtered directly (already scoped by sport + month).
    // For PGA: use full pgaHistoryPicks (tournament-level view, not month-filtered).
    const base = sportFilter === "PGA"
      ? pgaHistoryPicks
      : sportFilter === "all"
        ? filtered.filter((pick) => pick.league !== "PGA")
        : filtered;

    return base.filter((pick) => pick.provenance === "original");
  }, [filtered, pgaHistoryPicks, sportFilter]);

  // Compute stats
  const record = computePickHistorySummary(headlineRecords);
  const winPct = (record.wins + record.losses) > 0
    ? formatPercent((record.wins / (record.wins + record.losses)) * 100)
    : "0.00";
  const isPgaView = sportFilter === "PGA";

  // Group by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, PickHistoryRecord[]>();
    for (const pick of filtered) {
      const current = map.get(pick.date) || [];
      current.push(pick);
      map.set(pick.date, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const filteredSlates = useMemo(() => (
    slates.filter((slate) => {
      if (sportFilter === "all" && slate.league === "PGA") return false;
      if (sportFilter !== "all" && slate.league !== sportFilter) return false;
      if (monthFilter !== "all" && getMonthKey(slate.date) !== monthFilter) return false;
      return true;
    })
  ), [monthFilter, slates, sportFilter]);

  const slatesByDate = useMemo(() => {
    const map = new Map<string, PickSlateRecord[]>();
    for (const slate of filteredSlates) {
      const bucket = map.get(slate.date) ?? [];
      bucket.push(slate);
      map.set(slate.date, bucket);
    }
    return map;
  }, [filteredSlates]);

  const integrityIssues = useMemo(() => (
    filteredSlates.filter((slate) => slate.integrity_status !== "ok")
  ), [filteredSlates]);

  return (
    <main className="min-h-screen bg-dark-bg pb-24">
      <PageHeader
        title="Pick History"
        subtitle="Official settled pick history. Standard sports exclude PGA by default; PGA lives in its own tournament-style lane focused on units and standalone results."
      />

      <div className="mx-auto max-w-2xl px-4 py-4">
        <Link href="/picks" className="tap-button mb-4 inline-flex text-xs font-medium text-accent-blue">← Back to Picks</Link>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {integrityIssues.length > 0 && (
        <div className="mb-4 rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Admin review available</p>
          <p className="mt-2 text-sm text-gray-300">
            Historical review flags live in admin only. Public history stays clean once picks are confirmed.
          </p>
        </div>
      )}

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
            <p className="text-gray-500 text-[10px] uppercase">{isPgaView ? "Win %" : "Win %"}</p>
          </div>
          <div>
            <p className={`font-bold text-xl ${record.profitUnits > 0 ? "text-accent-green" : record.profitUnits < 0 ? "text-accent-red" : "text-gray-400"}`}>
              {record.profitUnits > 0 ? "+" : ""}{formatUnits(record.profitUnits)}u
            </p>
            <p className="text-gray-500 text-[10px] uppercase">Units</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {/* Sport Filter */}
        {(["all", "NHL", "NBA", "MLB", "PGA"] as SportFilter[]).map((s) => (
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

      {sportFilter === "all" && (
        <div className="mb-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">PGA Reporting</p>
          <p className="mt-1 text-sm text-emerald-50/85">
            PGA is separated from the standard all-sports history view. Tournament-style picks should be judged primarily on standalone units and tournament outcomes, not blended into the daily slate headline record.
          </p>
        </div>
      )}

      {/* Pending count */}
      {record.pending > 0 && (
        <p className="text-[11px] text-gray-500 mb-3">{record.pending} pick{record.pending !== 1 ? "s" : ""} still pending</p>
      )}

      {/* Pick list grouped by date */}
      {loading && groupedByDate.length === 0 ? (
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-6 text-center">
          <p className="text-gray-400 text-sm">Loading pick history...</p>
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-6 text-center">
          <p className="text-gray-400 text-sm">No picks yet. Check back after today&apos;s games.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByDate.map(([date, picks]) => {
            const dayRecord = computePickHistorySummary(picks);
            const dayWinPct = (dayRecord.wins + dayRecord.losses) > 0
              ? formatPercent((dayRecord.wins / (dayRecord.wins + dayRecord.losses)) * 100)
              : null;
            const daySlates = slatesByDate.get(date) || [];
            return (
              <div key={date} className="rounded-2xl border border-dark-border/70 bg-dark-surface/40 overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-dark-bg/40 border-b border-dark-border/40">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-gray-300 text-xs font-semibold">{formatDate(date)}</p>
                    {daySlates.map((slate) => (
                      <span
                        key={`${slate.date}-${slate.league}`}
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${slateBadgeTone(slate)}`}
                      >
                        {slateBadgeLabel(slate)}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                    <span className="text-emerald-400">{dayRecord.wins}W</span>
                    <span className="text-red-400">{dayRecord.losses}L</span>
                    {dayRecord.pushes > 0 && <span className="text-yellow-400">{dayRecord.pushes}P</span>}
                    {dayRecord.pending > 0 && <span className="text-gray-500 inline-flex items-center gap-0.5">{dayRecord.pending}<Clock size={10} /></span>}
                    {dayWinPct !== null && (
                      <span className={`ml-1 ${parseFloat(dayWinPct) >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                        {dayWinPct}%
                      </span>
                    )}
                    <span className={`ml-1 ${dayRecord.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {dayRecord.profitUnits >= 0 ? "+" : ""}{formatUnits(dayRecord.profitUnits)}u
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
                      <TeamLogo team={pick.team} size={24} />
                      <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                          <p className="text-white text-xs font-medium truncate">{pick.pick_label}</p>
                          <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>

                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-gray-500 text-[10px]">{pick.team} vs {pick.opponent || "TBD"}</p>
                          <span className="text-[9px] text-gray-600">
                            {displayHitRate(pick.hit_rate)} hit
                          </span>
                          {typeof pick.odds === "number" && Number.isFinite(pick.odds) && pick.odds !== 0 && (
                            <span className="text-[9px] text-gray-500 bg-dark-bg/60 rounded px-1.5 py-0.5">
                              {pick.odds > 0 ? `+${pick.odds}` : `${pick.odds}`}
                            </span>
                          )}
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
      </div>
    </main>
  );
}
