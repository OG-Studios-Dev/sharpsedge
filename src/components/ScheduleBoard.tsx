"use client";

import { useEffect, useMemo, useState } from "react";
import { NHLGame } from "@/lib/types";
import TeamLogo from "@/components/TeamLogo";

type GamesResponse = {
  games: NHLGame[];
  date: string;
  meta?: {
    oddsConnected?: boolean;
  };
};

type Section = {
  key: string;
  title: string;
  games: NHLGame[];
};

function formatDayLabel(date: Date) {
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function formatGameTime(startTimeUTC: string) {
  return new Date(startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sectionTitleFor(date: Date) {
  const now = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return formatDayLabel(date);
}

export default function ScheduleBoard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<GamesResponse>({ games: [], date: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/games?days=${compact ? 3 : 7}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.games) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [compact]);

  const sections = useMemo<Section[]>(() => {
    const grouped = new Map<string, NHLGame[]>();
    const today = startOfDay(new Date()).getTime();
    const ACTIVE = new Set(["FUT", "LIVE", "PRE"]);

    for (const game of data.games) {
      if (!ACTIVE.has(game.gameState)) continue; // skip finished games
      const date = new Date(game.startTimeUTC);
      const normalized = startOfDay(date).getTime();
      if (normalized < today) continue;
      if (game.gameState === "OFF") continue;
      const key = dayKey(date);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(game);
    }

    return Array.from(grouped.entries()).map(([key, games]) => ({
      key,
      title: sectionTitleFor(new Date(key)),
      games,
    }));
  }, [data.games]);

  return (
    <section className="rounded-3xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-white font-semibold text-lg">NHL Schedule</h2>
          <p className="text-xs text-gray-500 mt-1">{compact ? "Today, tomorrow, and next up" : "Today, tomorrow, and the rest of the week"}</p>
        </div>
        <div className="flex items-center gap-2">
          {data.meta?.oddsConnected ? (
            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Live odds connected</span>
          ) : (
            <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">Schedule only</span>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading NHL slate...</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming NHL games found.</p>
      ) : (
        <div className="space-y-5">
          {sections.slice(0, compact ? 3 : 7).map((section) => (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                <span className="text-[11px] text-gray-500">{section.games.length} game{section.games.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid gap-3">
                {section.games.map((game) => (
                  <div key={game.id} className="rounded-2xl border border-dark-border bg-dark-surface p-4">
                    <div className="flex items-center justify-between mb-3 gap-3">
                      <div className="text-xs text-gray-400">{formatGameTime(game.startTimeUTC)}</div>
                      <div className="text-[11px] px-2 py-1 rounded-full bg-dark-bg text-gray-300 border border-dark-border/60">
                        {game.gameState}
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamLogo team={game.awayTeam.abbrev} logo={game.awayTeam.logo} color="#334155" />
                        <div className="min-w-0">
                          <div className="text-white font-semibold truncate">{game.awayTeam.name || game.awayTeam.abbrev}</div>
                          <div className="text-xs text-gray-500">{game.awayTeam.abbrev}</div>
                        </div>
                      </div>

                      <div className="text-center">
                        <div className="text-xs text-gray-500 mb-1">at</div>
                        <div className="text-[11px] text-gray-400 uppercase tracking-[0.16em]">Matchup</div>
                      </div>

                      <div className="flex items-center gap-3 min-w-0 justify-end text-right">
                        <div className="min-w-0">
                          <div className="text-white font-semibold truncate">{game.homeTeam.name || game.homeTeam.abbrev}</div>
                          <div className="text-xs text-gray-500">{game.homeTeam.abbrev}</div>
                        </div>
                        <TeamLogo team={game.homeTeam.abbrev} logo={game.homeTeam.logo} color="#334155" />
                      </div>
                    </div>

                    {(game.bestMoneyline?.away || game.bestMoneyline?.home) && (
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-dark-bg border border-dark-border px-3 py-2 text-gray-300">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mb-1">Away line</div>
                          <div>{game.awayTeam.abbrev} {game.bestMoneyline?.away?.odds ?? "-"}</div>
                        </div>
                        <div className="rounded-xl bg-dark-bg border border-dark-border px-3 py-2 text-gray-300">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mb-1">Home line</div>
                          <div>{game.homeTeam.abbrev} {game.bestMoneyline?.home?.odds ?? "-"}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
