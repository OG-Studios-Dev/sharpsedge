"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LockedFeature from "@/components/LockedFeature";
import TeamLogo from "@/components/TeamLogo";
import { usePickHistory } from "@/hooks/usePickHistory";
import { computePickHistorySummary } from "@/lib/pick-history";
import type { PickHistoryRecord } from "@/lib/supabase-types";

type PastFilter = "all" | "win" | "loss" | "push";

type HistoryItem = {
  id: string;
  date: string;
  league: string;
  team: string;
  opponent: string;
  teamColor: string;
  pickLabel: string;
  hitRate: number;
  edge: number;
  odds?: number;
  units: number;
  result: PickHistoryRecord["result"];
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function displayHitRate(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${Math.round(pct)}%`;
}

function displayEdge(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function oddsToProfit(odds: number, units: number): number {
  if (odds >= 100) return Math.round((odds / 100) * units * 100) / 100;
  if (odds <= -100) return Math.round((100 / Math.abs(odds)) * units * 100) / 100;
  return units;
}

function mapRecordToHistoryItem(record: PickHistoryRecord): HistoryItem {
  return {
    id: record.id,
    date: record.date,
    league: record.league,
    team: record.team,
    opponent: record.opponent || "TBD",
    teamColor: "#4a9eff",
    pickLabel: record.pick_label,
    hitRate: typeof record.hit_rate === "number" ? record.hit_rate : 0,
    edge: typeof record.edge === "number" ? record.edge : 0,
    odds: typeof record.odds === "number" ? record.odds : undefined,
    units: typeof record.units === "number" && Number.isFinite(record.units) && record.units > 0 ? record.units : 1,
    result: record.result,
  };
}

function computeHistoryRecord(items: HistoryItem[]) {
  return items.reduce((record, item) => {
    if (item.result === "win") {
      record.wins += 1;
      record.profitUnits += item.odds ? oddsToProfit(item.odds, item.units) : item.units;
    } else if (item.result === "loss") {
      record.losses += 1;
      record.profitUnits -= item.units;
    } else if (item.result === "push") {
      record.pushes += 1;
    } else {
      record.pending += 1;
    }
    return record;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });
}

export default function MyPicksPage() {
  const { loading, picks: historyPicks, error } = usePickHistory();
  const [pastFilter, setPastFilter] = useState<PastFilter>("all");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const historyItems = useMemo(() => historyPicks.map(mapRecordToHistoryItem), [historyPicks]);
  const summary = computePickHistorySummary(historyPicks);
  const settled = summary.wins + summary.losses;
  const winPct = settled > 0 ? Math.round((summary.wins / settled) * 100) : 0;

  const pastDates = useMemo(() => (
    Array.from(new Set(historyItems.map((item) => item.date))).sort((a, b) => b.localeCompare(a))
  ), [historyItems]);

  const historyByDate = useMemo(() => (
    historyItems.reduce<Record<string, HistoryItem[]>>((groups, item) => {
      if (!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
      return groups;
    }, {})
  ), [historyItems]);

  const runningUnitsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    let running = 0;

    for (const date of [...pastDates].sort()) {
      running += computeHistoryRecord(historyByDate[date] || []).profitUnits;
      totals[date] = running;
    }

    return totals;
  }, [historyByDate, pastDates]);

  function filterHistoryPicks(picks: HistoryItem[]) {
    if (pastFilter === "all") return picks;
    return picks.filter((p) => p.result === pastFilter);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24 lg:px-0">
      <PageHeader title="My Picks" subtitle="Daily summary, results, units, and every settled pick." />

      <LockedFeature feature="my_picks">
        <div className="space-y-4 px-4 py-4 lg:px-0">
          <section className="rounded-2xl border border-dark-border bg-dark-surface p-4 transition-colors hover:border-accent-blue/30">
            <div className="mb-3 flex items-center justify-between">
              <p className="section-heading">My Picks Record</p>
            </div>
            <div className="flex items-center gap-6 overflow-x-auto">
              <div className="text-center">
                <p className="text-accent-green font-bold text-lg">{summary.wins}</p>
                <p className="text-gray-500 text-[10px] uppercase">W</p>
              </div>
              <div className="text-center">
                <p className="text-accent-red font-bold text-lg">{summary.losses}</p>
                <p className="text-gray-500 text-[10px] uppercase">L</p>
              </div>
              <div className="text-center">
                <p className="text-accent-yellow font-bold text-lg">{summary.pushes}</p>
                <p className="text-gray-500 text-[10px] uppercase">Push</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400 font-bold text-lg">{summary.pending}</p>
                <p className="text-gray-500 text-[10px] uppercase">Pending</p>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="text-right">
                  <p className="font-bold text-lg text-white">{winPct}%</p>
                  <p className="text-gray-500 text-[10px] uppercase">Win % · {settled}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg ${summary.profitUnits > 0 ? "text-accent-green" : summary.profitUnits < 0 ? "text-accent-red" : "text-gray-400"}`}>
                    {summary.profitUnits > 0 ? "+" : ""}{summary.profitUnits.toFixed(2)}u
                  </p>
                  <p className="text-gray-500 text-[10px] uppercase">Net Units</p>
                </div>
              </div>
            </div>
          </section>

          {loading ? (
            <p className="text-gray-400 text-sm">Loading pick history...</p>
          ) : error ? (
            <p className="text-red-300 text-sm">{error}</p>
          ) : historyItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
              No settled picks yet.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 mt-1">
                <p className="section-heading">Pick History</p>
                <div className="flex gap-1">
                  {(["all", "win", "loss", "push"] as PastFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPastFilter(f)}
                      className={`tap-button text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border transition-colors ${
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

              <div className="space-y-3">
                {pastDates.map((date, index) => {
                  const dayPicks = historyByDate[date] || [];
                  const filtered = filterHistoryPicks(dayPicks);
                  if (!filtered.length) return null;
                  const dailyRecord = computeHistoryRecord(dayPicks);
                  const dailyWinPct = (dailyRecord.wins + dailyRecord.losses) > 0
                    ? Math.round((dailyRecord.wins / (dailyRecord.wins + dailyRecord.losses)) * 100)
                    : null;
                  const dailyUnits = dailyRecord.profitUnits;
                  const runningUnits = runningUnitsByDate[date] ?? dailyUnits;

                  return (
                    <div key={date} className="overflow-hidden rounded-2xl border border-dark-border/70 bg-dark-surface/40">
                      <button
                        type="button"
                        onClick={() => setExpandedDate(expandedDate === date ? null : date)}
                        className="tap-button w-full flex items-center justify-between px-4 py-2.5 bg-dark-bg/40"
                      >
                        <div className="text-left">
                          <p className="text-gray-300 text-xs font-semibold">{formatDate(date)}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Running total {runningUnits > 0 ? "+" : ""}{runningUnits.toFixed(2)}u
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase flex-wrap justify-end">
                          <span className="text-emerald-400">{dailyRecord.wins}W</span>
                          <span className="text-red-400">{dailyRecord.losses}L</span>
                          {dailyRecord.pushes > 0 && <span className="text-yellow-400">{dailyRecord.pushes}P</span>}
                          {dailyRecord.pending > 0 && <span className="text-gray-500 inline-flex items-center gap-0.5">{dailyRecord.pending}<Clock size={10} /></span>}
                          <span className={dailyUnits >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {dailyUnits >= 0 ? "+" : ""}{dailyUnits.toFixed(2)}u
                          </span>
                          {dailyWinPct !== null && (
                            <span className={dailyWinPct >= 50 ? "text-emerald-400" : "text-red-400"}>
                              {dailyWinPct}%
                            </span>
                          )}
                          <ChevronDown size={12} className={`text-gray-500 transition-transform ${expandedDate === date ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {expandedDate === date && (
                        <div className="divide-y divide-dark-border/30 border-t border-dark-border/40">
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
                              <TeamLogo team={pick.team} size={24} color={pick.teamColor} sport={pick.league || undefined} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-white text-xs font-medium truncate">{pick.pickLabel}</p>
                                  {pick.league && (
                                    <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <p className="text-gray-500 text-[10px]">{pick.team} vs {pick.opponent}</p>
                                  <span className="text-[9px] text-gray-600">{displayHitRate(pick.hitRate)} hit · {displayEdge(pick.edge)} edge</span>
                                  {typeof pick.odds === "number" && Number.isFinite(pick.odds) && pick.odds !== 0 && (
                                    <span className="text-[9px] text-gray-500 bg-dark-bg/60 rounded px-1.5 py-0.5">{formatAmericanOdds(pick.odds)}</span>
                                  )}
                                  <span className="text-[9px] text-gray-500 bg-dark-bg/60 rounded px-1.5 py-0.5">{pick.units}u</span>
                                </div>
                              </div>
                              {pick.result === "win" ? (
                                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-lg px-2.5 py-1">W ✓</span>
                              ) : pick.result === "loss" ? (
                                <span className="text-xs font-bold text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1">L ✕</span>
                              ) : pick.result === "push" ? (
                                <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 rounded-lg px-2.5 py-1">P</span>
                              ) : (
                                <span className="text-xs font-bold text-gray-400 bg-dark-bg/60 rounded-lg px-2.5 py-1">Pending</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </LockedFeature>
    </main>
  );
}
