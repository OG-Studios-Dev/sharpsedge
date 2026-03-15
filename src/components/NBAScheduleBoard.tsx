"use client";

import { useEffect, useState } from "react";
import NBAGameCard from "./NBAGameCard";
import type { OddsEvent } from "@/lib/types";
import { getDateKey, getDateKeyWithOffset, NBA_TIME_ZONE, parseDateKey } from "@/lib/date-utils";

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

export default function NBAScheduleBoard({ compact, showHeader = true }: Props) {
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
    <section className="rounded-3xl bg-dark-card border border-dark-border/80 p-5 lg:p-6 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)]">
      {showHeader && (
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap border-b border-dark-border/40 pb-4">
          <div>
            <h2 className="text-text-platinum font-heading font-black text-2xl tracking-tight">NBA Schedule</h2>
            <p className="text-xs text-text-platinum/50 font-sans mt-1">Today, tomorrow, and next up</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-48 rounded-2xl bg-dark-border/40 animate-pulse border border-dark-border/50" />)}
        </div>
      ) : displaySections.length === 0 ? (
        <div className="text-center py-10 bg-dark-bg/30 rounded-2xl border border-dark-border/30">
          <p className="text-text-platinum/60 text-sm font-semibold">No NBA games scheduled</p>
          <p className="text-text-platinum/40 text-xs mt-1">Check back on game days</p>
        </div>
      ) : (
        <div className="space-y-8">
          {displaySections.map(({ label, games: dayGames }) => (
            <div key={label}>
              <div className="flex items-end justify-between mb-4 border-b border-dark-border/30 pb-2 pl-1">
                <h3 className="text-[13px] uppercase font-mono tracking-widest font-bold text-text-platinum/80">{label}</h3>
                <p className="text-[10px] font-mono text-text-platinum/40">{dayGames.length} game{dayGames.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
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
