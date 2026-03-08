"use client";

import { useEffect, useState } from "react";
import { NHLGame } from "@/lib/types";

type GamesResponse = {
  games: NHLGame[];
  date: string;
  meta?: {
    oddsConnected?: boolean;
  };
};

function formatStartTime(startTimeUTC: string) {
  return new Date(startTimeUTC).toLocaleString([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ScheduleStrip() {
  const [data, setData] = useState<GamesResponse>({ games: [], date: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/games?days=3")
      .then((r) => r.json())
      .then((json) => {
        if (json?.games) setData(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="rounded-2xl bg-dark-surface border border-dark-border p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-white font-semibold">Upcoming NHL Games</h2>
        <div className="flex items-center gap-2">
          {data.meta?.oddsConnected ? (
            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Live odds connected</span>
          ) : (
            <span className="text-[10px] px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">Schedule only</span>
          )}
          <span className="text-xs text-gray-500">Next 3 days</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading schedule...</p>
      ) : data.games.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming NHL games found.</p>
      ) : (
        <div className="space-y-2">
          {data.games.slice(0, 6).map((game) => (
            <div key={game.id} className="rounded-xl border border-dark-border/60 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white font-medium">
                    {game.awayTeam.abbrev} @ {game.homeTeam.abbrev}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatStartTime(game.startTimeUTC)}
                  </div>
                  {(game.bestMoneyline?.away || game.bestMoneyline?.home) && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      {game.awayTeam.abbrev} {game.bestMoneyline?.away?.odds ?? "-"} • {game.homeTeam.abbrev} {game.bestMoneyline?.home?.odds ?? "-"}
                    </div>
                  )}
                </div>
                <div className="text-[11px] px-2 py-1 rounded-full bg-dark-bg text-gray-300 border border-dark-border/60">
                  {game.gameState}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
