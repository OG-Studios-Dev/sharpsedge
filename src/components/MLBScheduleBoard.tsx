"use client";

import { useEffect, useState } from "react";
import MLBGameCard from "./MLBGameCard";
import type { MLBGame } from "@/lib/types";
import { getDateKey, getDateKeyWithOffset, parseDateKey } from "@/lib/date-utils";

function sectionTitleFor(dateStr: string) {
  const target = parseDateKey(dateStr);
  const today = getDateKey();
  const targetDay = getDateKey(target);
  if (targetDay === today) return "Today";
  if (targetDay === getDateKeyWithOffset(1)) return "Tomorrow";
  return target.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export default function MLBScheduleBoard({ compact, showHeader = false }: { compact?: boolean; showHeader?: boolean }) {
  const [games, setGames] = useState<MLBGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mlb/dashboard")
      .then((response) => response.json())
      .then((data) => {
        setGames(Array.isArray(data.schedule) ? data.schedule : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const sections: Array<{ label: string; games: MLBGame[] }> = [];
  const seen = new Map<string, MLBGame[]>();
  for (const game of games) {
    const label = sectionTitleFor(game.date);
    if (!seen.has(label)) {
      seen.set(label, []);
      sections.push({ label, games: seen.get(label)! });
    }
    seen.get(label)!.push(game);
  }

  const displaySections = compact ? sections.slice(0, 2) : sections;

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      {showHeader && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-white">MLB Schedule</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">Starters, run lines, totals, and live inning state</p>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-44 rounded-2xl bg-dark-border/40 animate-pulse" />
          ))}
        </div>
      ) : displaySections.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">No MLB games scheduled</p>
          <p className="mt-1 text-xs text-gray-600">Pitching lines and game cards will appear once the slate posts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displaySections.map(({ label, games: dayGames }) => (
            <div key={label}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-300">{label}</p>
                <p className="text-[10px] text-gray-500">{dayGames.length} game{dayGames.length === 1 ? "" : "s"}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dayGames.map((game) => (
                  <MLBGameCard key={game.id} game={game} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
