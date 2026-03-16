"use client";

import { useEffect, useState } from "react";
import type { SoccerLeague, SoccerMatch } from "@/lib/soccer-api";
import SoccerMatchCard from "@/components/SoccerMatchCard";
import { GameCardSkeleton } from "@/components/LoadingSkeleton";

function leagueLabel(league: SoccerLeague) {
  return league === "SERIE_A" ? "Serie A" : "EPL";
}

function sectionLabel(date: string) {
  const target = new Date(date);
  const today = new Date();
  const todayKey = today.toDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target.toDateString() === todayKey) return "Today";
  if (target.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return target.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function SoccerScheduleBoard({ league, showHeader = false }: { league: SoccerLeague; showHeader?: boolean }) {
  const [matches, setMatches] = useState<SoccerMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/soccer/dashboard?league=${league}`)
      .then((response) => response.json())
      .then((data) => {
        setMatches(Array.isArray(data?.schedule) ? data.schedule : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [league]);

  const groups = new Map<string, SoccerMatch[]>();
  for (const match of matches) {
    const key = sectionLabel(match.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(match);
  }

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      {showHeader && (
        <div className="mb-3">
          <h3 className="page-heading">{leagueLabel(league)} Schedule</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">Today, tomorrow, and next up with 1X2 pricing</p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => <GameCardSkeleton key={index} />)}
        </div>
      ) : groups.size === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">No {leagueLabel(league)} matches scheduled</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([label, dayMatches]) => (
            <div key={`${league}-${label}`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-300">{label}</p>
                <p className="text-[10px] text-gray-500">{dayMatches.length} match{dayMatches.length === 1 ? "" : "es"}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {dayMatches.map((match) => (
                  <SoccerMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
