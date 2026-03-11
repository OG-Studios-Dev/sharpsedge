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

function RecordBar({ wins, losses, pending, profitUnits, label }: {
  wins: number; losses: number; pending: number; profitUnits: number; label?: string;
}) {
  const unitColor = profitUnits > 0 ? "text-emerald-400" : profitUnits < 0 ? "text-red-400" : "text-gray-400";
  return (
    <div className="flex items-center gap-4 px-3 py-2 rounded-xl bg-dark-bg/60 border border-dark-border/50">
      {label && <span className="text-[10px] text-gray-500 font-semibold uppercase mr-1">{label}</span>}
      <div className="text-center">
        <p className="text-emerald-400 font-bold text-sm">{wins}</p>
        <p className="text-[9px] text-gray-500 uppercase">W</p>
      </div>
      <div className="text-center">
        <p className="text-red-400 font-bold text-sm">{losses}</p>
        <p className="text-[9px] text-gray-500 uppercase">L</p>
      </div>
      <div className="text-center">
        <p className="text-gray-400 font-bold text-sm">{pending}</p>
        <p className="text-[9px] text-gray-500 uppercase">Pend</p>
      </div>
      <div className="ml-auto text-right">
        <p className={`font-bold text-sm ${unitColor}`}>
          {profitUnits > 0 ? "+" : ""}{profitUnits}u
        </p>
        <p className="text-[9px] text-gray-500 uppercase">Net</p>
      </div>
    </div>
  );
}

export default function HomePicksSection({ league = "NHL" }: { league?: string }) {
  const { todayPicks, record, allPicks: allPicksStore, loadingPicks } = usePicks();

  // Flatten all picks across all days for cumulative records
  const allPicks = Object.values(allPicksStore).flat();
  const nhlPicks = allPicks.filter((p) => !p.league || p.league === "NHL");
  const nbaPicks = allPicks.filter((p) => p.league === "NBA");

  function computeRecord(picks: typeof allPicks) {
    const resolved = picks.filter((p) => p.result !== "pending");
    const wins = resolved.filter((p) => p.result === "win").length;
    const losses = resolved.filter((p) => p.result === "loss").length;
    const pending = picks.filter((p) => p.result === "pending").length;
    const profitUnits = Math.round((wins - losses) * 10) / 10;
    return { wins, losses, pending, profitUnits };
  }

  const nhlRecord = computeRecord(nhlPicks);
  const nbaRecord = computeRecord(nbaPicks);
  const allRecord = computeRecord(allPicks);

  const displayPicks = league === "NBA"
    ? todayPicks.filter((p) => p.league === "NBA")
    : league === "All"
      ? todayPicks
      : todayPicks.filter((p) => !p.league || p.league === "NHL");

  // NBA coming soon — no picks yet
  if (league === "NBA") {
    return (
      <section className="rounded-2xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">🪿 TODAY'S GOOSE AI PICKS</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">NBA · 3 picks/day · 1 unit each</p>
          </div>
        </div>
        <RecordBar {...nbaRecord} label="NBA" />
        <div className="text-center py-5 mt-3">
          <p className="text-2xl mb-2">🏀</p>
          <p className="text-gray-400 text-sm font-medium">NBA picks coming soon</p>
          <p className="text-gray-600 text-xs mt-1">AI pick engine is being trained on NBA data</p>
        </div>
      </section>
    );
  }

  const unitColor = record.profitUnits > 0 ? "text-emerald-400" : record.profitUnits < 0 ? "text-red-400" : "text-gray-400";

  return (
    <section className="rounded-2xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">🪿 TODAY'S GOOSE AI PICKS</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {league === "All" ? "All Sports" : league} · 3 picks/day · 1 unit each
          </p>
        </div>
        <Link href="/picks" className="text-xs text-accent-blue font-medium">View all →</Link>
      </div>

      {/* Record bar — combined or per-league */}
      {league === "All" ? (
        <div className="space-y-1.5">
          <RecordBar {...allRecord} label="All" />
          <div className="flex gap-1.5">
            <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-dark-bg/40 border border-dark-border/40">
              <span className="text-[10px] text-gray-500 font-semibold">🏒 NHL</span>
              <span className="text-emerald-400 text-[11px] font-bold">{nhlRecord.wins}W</span>
              <span className="text-red-400 text-[11px] font-bold">{nhlRecord.losses}L</span>
              <span className={`ml-auto text-[11px] font-bold ${nhlRecord.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {nhlRecord.profitUnits >= 0 ? "+" : ""}{nhlRecord.profitUnits}u
              </span>
            </div>
            <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-dark-bg/40 border border-dark-border/40">
              <span className="text-[10px] text-gray-500 font-semibold">🏀 NBA</span>
              <span className="text-emerald-400 text-[11px] font-bold">{nbaRecord.wins}W</span>
              <span className="text-red-400 text-[11px] font-bold">{nbaRecord.losses}L</span>
              <span className={`ml-auto text-[11px] font-bold ${nbaRecord.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {nbaRecord.profitUnits >= 0 ? "+" : ""}{nbaRecord.profitUnits}u
              </span>
            </div>
          </div>
        </div>
      ) : (
        <RecordBar wins={record.wins} losses={record.losses} pending={record.pending} profitUnits={record.profitUnits} />
      )}

      {/* Picks */}
      <div className="mt-3">
        {loadingPicks ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-dark-border/40 animate-pulse" />
            ))}
          </div>
        ) : displayPicks.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm font-medium">Picks loading for today's slate</p>
            <p className="text-gray-600 text-xs mt-1">Check back once games are posted</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayPicks.map((pick) => (
              <div key={pick.id} className="flex items-center gap-3 py-2 border-b border-dark-border/40 last:border-0">
                <TeamLogo team={pick.team} size={28} color={pick.teamColor} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white text-xs font-semibold truncate">
                      {pick.type === "player" ? pick.playerName : pick.team}
                    </p>
                    {pick.league && (
                      <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>
                    )}
                  </div>
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
      </div>
    </section>
  );
}
