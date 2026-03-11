"use client";

import Link from "next/link";
import { usePicks } from "@/hooks/usePicks";
import TeamLogo from "./TeamLogo";

function displayHitRate(val: number): string {
  const pct = val <= 1 ? Math.round(val * 100) : Math.round(val);
  return `${pct}%`;
}

function ResultPill({ result }: { result: string }) {
  if (result === "win") return <span className="text-[10px] font-bold text-emerald-400 uppercase">WIN ✓</span>;
  if (result === "loss") return <span className="text-[10px] font-bold text-red-400 uppercase">LOSS ✗</span>;
  if (result === "push") return <span className="text-[10px] font-bold text-yellow-400 uppercase">PUSH</span>;
  return <span className="text-[10px] text-gray-500 uppercase">Pending</span>;
}

export default function HomePicksSection() {
  const { todayPicks, record, loadingPicks } = usePicks();

  const unitColor = record.profitUnits > 0
    ? "text-emerald-400"
    : record.profitUnits < 0
      ? "text-red-400"
      : "text-gray-400";

  return (
    <section className="rounded-2xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">🪿 TODAY'S GOOSE AI PICKS</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">3 picks/day · 1 unit each</p>
        </div>
        <Link href="/picks" className="text-xs text-accent-blue font-medium">View all →</Link>
      </div>

      {/* Record + Units bar */}
      <div className="flex items-center gap-4 mb-3 px-3 py-2 rounded-xl bg-dark-bg/60 border border-dark-border/50">
        <div className="text-center">
          <p className="text-emerald-400 font-bold text-sm">{record.wins}</p>
          <p className="text-[9px] text-gray-500 uppercase">W</p>
        </div>
        <div className="text-center">
          <p className="text-red-400 font-bold text-sm">{record.losses}</p>
          <p className="text-[9px] text-gray-500 uppercase">L</p>
        </div>
        <div className="text-center">
          <p className="text-gray-400 font-bold text-sm">{record.pending}</p>
          <p className="text-[9px] text-gray-500 uppercase">Pend</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`font-bold text-sm ${unitColor}`}>
            {record.profitUnits > 0 ? "+" : ""}{record.profitUnits}u
          </p>
          <p className="text-[9px] text-gray-500 uppercase">Net Units</p>
        </div>
      </div>

      {/* Picks */}
      {loadingPicks ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-dark-border/40 animate-pulse" />
          ))}
        </div>
      ) : todayPicks.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-gray-400 text-sm font-medium">Picks loading for today's slate</p>
          <p className="text-gray-600 text-xs mt-1">Check back once games are posted</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayPicks.map((pick) => (
            <div key={pick.id} className="flex items-center gap-3 py-2 border-b border-dark-border/40 last:border-0">
              <TeamLogo team={pick.team} size={28} color={pick.teamColor} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">
                  {pick.type === "player" ? pick.playerName : pick.team}
                </p>
                <p className="text-accent-blue text-[11px] truncate">{pick.pickLabel}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-gray-500">{displayHitRate(pick.hitRate)} hit</span>
                <ResultPill result={pick.result} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
