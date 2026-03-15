"use client";

import { useEffect, useState } from "react";
import NBAGameCard from "./NBAGameCard";
import type { OddsEvent } from "@/lib/types";
import { getDateKey, getDateKeyWithOffset, NBA_TIME_ZONE, parseDateKey } from "@/lib/date-utils";
import { GameCardSkeleton } from "@/components/LoadingSkeleton";

type NBAGame = {
  id: string;
  date: string;
  status: string;
  homeTeam: { id: string; abbreviation: string; fullName: string };
  awayTeam: { id: string; abbreviation: string; fullName: string };
  homeScore: number | null;
  awayScore: number | null;
};

function sectionTitleFor(dateStr: string) {
  const target = parseDateKey(dateStr);
  const nowDay = getDateKey(new Date(), NBA_TIME_ZONE);
  const targetDay = getDateKey(target, NBA_TIME_ZONE);
  if (targetDay === nowDay) return "Today";
  if (targetDay === getDateKeyWithOffset(1, NBA_TIME_ZONE)) return "Tomorrow";
  return target.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

interface Props { compact?: boolean; showHeader?: boolean }

export default function NBAScheduleBoard({ compact, showHeader = false }: Props) {
  const [games, setGames] = useState<NBAGame[]>([]);
  const [oddsEvents, setOddsEvents] = useState<OddsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/nba/dashboard")
      .then((r) => r.json())
      .then((data) => {
        setGames(Array.isArray(data.schedule) ? data.schedule : data.schedule?.games || []);
        setOddsEvents(Array.isArray(data.odds) ? data.odds : []);
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

  function findOddsEvent(game: NBAGame): OddsEvent | undefined {
    const homeFull = game.homeTeam.fullName.toLowerCase();
    const awayFull = game.awayTeam.fullName.toLowerCase();
    return oddsEvents.find((e) => {
      const eHome = e.home_team.toLowerCase();
      const eAway = e.away_team.toLowerCase();
      return (eHome.includes(homeFull) || homeFull.includes(eHome)) &&
             (eAway.includes(awayFull) || awayFull.includes(eAway));
    });
  }

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      {showHeader && (
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="page-heading">NBA Schedule</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Today, tomorrow, and next up</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <GameCardSkeleton key={i} />)}
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
              <div className="grid grid-cols-2 gap-3">
                {dayGames.map((game) => (
                  <NBAGameCard
                    key={game.id}
                    game={game}
                    oddsEvent={findOddsEvent(game)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
