"use client";

import { useEffect, useState } from "react";
import type { NFLDashboardData } from "@/lib/nfl-live-data";
import type { NFLGame } from "@/lib/nfl-api";
import NFLGameCard from "@/components/NFLGameCard";
import { GameCardSkeleton } from "@/components/LoadingSkeleton";

function sectionLabel(date: string) {
  const target = new Date(date);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (target.toDateString() === today.toDateString()) return "Today";
  if (target.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return target.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function OffseasonHero({ data }: { data: NFLDashboardData["meta"] }) {
  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-[linear-gradient(135deg,rgba(8,26,20,0.94)_0%,rgba(15,24,34,0.96)_100%)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">Coming in September</p>
          <h3 className="mt-2 text-xl font-semibold text-white">NFL season starts {data.seasonStartsLabel}</h3>
          <p className="mt-2 max-w-xl text-sm text-gray-300">
            Standings stay live through the offseason. Props and picks launch in Week 1 once the board is posting regularly.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Countdown</p>
          <p className="mt-1 text-2xl font-semibold text-white">{data.countdownDays}</p>
          <p className="text-xs text-gray-400">days</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {data.upcomingEvents.map((event) => (
          <div key={event.label} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
            <p className="text-xs font-semibold text-white">{event.label}</p>
            <p className="mt-1 text-sm text-gray-400">{event.dateLabel}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NFLScheduleBoard({ showHeader = false }: { showHeader?: boolean }) {
  const [data, setData] = useState<NFLDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nfl/dashboard")
      .then((response) => response.json())
      .then((payload) => {
        setData(payload);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const groups = new Map<string, NFLGame[]>();
  for (const game of data?.schedule || []) {
    const key = sectionLabel(game.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(game);
  }

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      {showHeader && (
        <div className="mb-3">
          <h3 className="page-heading">NFL Schedule</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">Lines, totals, and the offseason runway</p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => <GameCardSkeleton key={index} />)}
        </div>
      ) : !data ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">NFL dashboard unavailable right now</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.meta.inOffseason && <OffseasonHero data={data.meta} />}
          {groups.size > 0 ? (
            Array.from(groups.entries()).map(([label, dayGames]) => (
              <div key={label}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-300">{label}</p>
                  <p className="text-[10px] text-gray-500">{dayGames.length} game{dayGames.length === 1 ? "" : "s"}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {dayGames.map((game) => (
                    <NFLGameCard key={game.id} game={game} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-5 text-sm text-gray-400">
              No active NFL games are posted yet.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
