"use client";

import { useEffect, useState } from "react";
import TeamLogo from "./TeamLogo";

type NBAGame = {
  id: number;
  date: string;
  status: string;
  homeTeam: { id: number; abbreviation: string; full_name: string };
  awayTeam: { id: number; abbreviation: string; full_name: string };
  homeScore: number | null;
  awayScore: number | null;
};

function sectionTitleFor(dateStr: string) {
  const now = new Date();
  const target = new Date(dateStr);
  const nowDay = now.toISOString().slice(0, 10);
  const targetDay = target.toISOString().slice(0, 10);
  if (targetDay === nowDay) return "Today";
  const tom = new Date(now);
  tom.setDate(now.getDate() + 1);
  if (targetDay === tom.toISOString().slice(0, 10)) return "Tomorrow";
  return target.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function GameStatusBadge({ status }: { status: string }) {
  const isLive = status === "In Progress";
  const isFinal = status === "Final";
  if (isLive) return <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">LIVE</span>;
  if (isFinal) return <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-dark-bg/50 border border-dark-border">Final</span>;
  return <span className="text-[10px] text-gray-400">{status}</span>;
}

interface Props { compact?: boolean }

export default function NBAScheduleBoard({ compact }: Props) {
  const [games, setGames] = useState<NBAGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nba/dashboard")
      .then((r) => r.json())
      .then((data) => {
        setGames(Array.isArray(data.schedule) ? data.schedule : data.schedule?.games || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Group by day
  const sections: Array<{ label: string; games: NBAGame[] }> = [];
  const seen = new Map<string, NBAGame[]>();
  for (const g of games) {
    const dayLabel = sectionTitleFor(g.date);
    if (!seen.has(dayLabel)) {
      seen.set(dayLabel, []);
      sections.push({ label: dayLabel, games: seen.get(dayLabel)! });
    }
    seen.get(dayLabel)!.push(g);
  }

  const displaySections = compact ? sections.slice(0, 2) : sections;

  return (
    <section className="rounded-2xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">NBA Schedule</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Today, tomorrow, and next up</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-dark-border/40 animate-pulse" />)}
        </div>
      ) : displaySections.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-gray-400 text-sm">No NBA games scheduled</p>
          <p className="text-gray-600 text-xs mt-1">Check back on game days</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displaySections.map(({ label, games: dayGames }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-300">{label}</p>
                <p className="text-[10px] text-gray-500">{dayGames.length} game{dayGames.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="space-y-2">
                {dayGames.map((game) => {
                  const isLive = game.status === "In Progress";
                  const isFinal = game.status === "Final";
                  return (
                    <div
                      key={game.id}
                      className={`rounded-xl border px-3 py-2.5 ${
                        isLive ? "bg-emerald-950/20 border-emerald-500/15" : "bg-dark-bg/40 border-dark-border/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <TeamLogo team={game.awayTeam.abbreviation} size={20} />
                            <span className="text-white text-xs font-semibold">{game.awayTeam.abbreviation}</span>
                            {isFinal && game.awayScore !== null && (
                              <span className="text-white text-xs font-bold">{game.awayScore}</span>
                            )}
                            <span className="text-gray-600 text-[10px]">at</span>
                            <TeamLogo team={game.homeTeam.abbreviation} size={20} />
                            <span className="text-white text-xs font-semibold">{game.homeTeam.abbreviation}</span>
                            {isFinal && game.homeScore !== null && (
                              <span className="text-white text-xs font-bold">{game.homeScore}</span>
                            )}
                          </div>
                          <GameStatusBadge status={game.status} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
