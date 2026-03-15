"use client";

import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import TeamLogo from "@/components/TeamLogo";
import EmptyStateCard from "@/components/EmptyStateCard";

type Tab = "Best Lines" | "Movement" | "Sharp";

type BookPrice = {
  book: string;
  odds: number;
  line?: number;
};

type PropWithOdds = {
  playerName: string;
  team: string;
  teamColor: string;
  opponent: string;
  isAway: boolean;
  propType: string;
  overUnder: string;
  modelLine: number;
  league: string;
  gameId: string;
  hitRate: number;
  books: BookPrice[];
  bestBook: string;
  bestOdds: number;
  worstOdds: number;
  edge: number; // cents saved best vs worst
};

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function shortBookName(book: string): string {
  const map: Record<string, string> = {
    "DraftKings": "DK",
    "FanDuel": "FD",
    "BetMGM": "MGM",
    "Caesars": "CZR",
    "PointsBet": "PB",
    "BetRivers": "BR",
    "Unibet": "UNI",
    "WynnBET": "WYNN",
    "SuperBook": "SB",
    "Bovada": "BOV",
    "BetOnline.ag": "BOL",
  };
  return map[book] || book.slice(0, 3).toUpperCase();
}

export default function OddsPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [tab, setTab] = useState<Tab>("Best Lines");
  const [props, setProps] = useState<any[]>([]);
  const [odds, setOdds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const endpoints = [];
    if (sportLeague !== "NBA") endpoints.push(fetch("/api/dashboard").then(r => r.json()));
    if (sportLeague !== "NHL") endpoints.push(fetch("/api/nba/dashboard").then(r => r.json()));

    Promise.all(endpoints)
      .then((results) => {
        const allProps = results.flatMap(r => r.props || []);
        const allOdds = results.flatMap(r => r.odds || []);
        setProps(allProps);
        setOdds(allOdds);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sportLeague]);

  // Build props with all book prices
  const propsWithOdds = useMemo((): PropWithOdds[] => {
    return props
      .filter((p: any) => p.book && p.book !== "Model Line")
      .map((p: any) => {
        // For now, show what we have — single book from the prop
        const books: BookPrice[] = [{ book: p.book || "Unknown", odds: p.odds || -110, line: p.line }];
        return {
          playerName: p.playerName,
          team: p.team,
          teamColor: p.teamColor,
          opponent: p.opponent,
          isAway: p.isAway,
          propType: p.propType,
          overUnder: p.overUnder || "Over",
          modelLine: p.line,
          league: p.league || "NHL",
          gameId: p.gameId,
          hitRate: typeof p.hitRate === "number" ? (Math.abs(p.hitRate) <= 1 ? p.hitRate * 100 : p.hitRate) : 0,
          books,
          bestBook: books[0]?.book || "—",
          bestOdds: books[0]?.odds || -110,
          worstOdds: books[0]?.odds || -110,
          edge: 0,
        };
      })
      .sort((a: PropWithOdds, b: PropWithOdds) => b.hitRate - a.hitRate);
  }, [props]);

  // Props with model line (for line movement simulation)
  const modelProps = useMemo(() => {
    return props
      .filter((p: any) => p.book === "Model Line" && p.odds)
      .map((p: any) => ({
        playerName: p.playerName,
        team: p.team,
        teamColor: p.teamColor,
        opponent: p.opponent,
        propType: p.propType,
        overUnder: p.overUnder || "Over",
        line: p.line,
        modelOdds: p.odds,
        hitRate: typeof p.hitRate === "number" ? (Math.abs(p.hitRate) <= 1 ? p.hitRate * 100 : p.hitRate) : 0,
        league: p.league || "NHL",
      }));
  }, [props]);

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-white">Lines & Odds</h1>
            <p className="text-xs text-gray-500 mt-0.5">Best prices, movement & sharp signals</p>
          </div>
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>

        <div className="flex border-b border-dark-border overflow-x-auto scrollbar-hide">
          {(["Best Lines", "Movement", "Sharp"] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`flex-1 min-w-[80px] py-3 text-sm font-medium text-center transition-colors relative ${
                tab === item ? "text-white" : "text-gray-500"
              }`}
            >
              {item === "Best Lines" && "💰 "}
              {item === "Movement" && "📈 "}
              {item === "Sharp" && "🧠 "}
              {item}
              {tab === item && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />}
            </button>
          ))}
        </div>
      </header>

      <div className="px-3 py-4">
        {loading ? (
          <EmptyStateCard
            eyebrow="Loading odds"
            title="Fetching live lines from sportsbooks"
            body="Pulling real-time odds from DraftKings, FanDuel, BetMGM, and more."
          />
        ) : tab === "Best Lines" ? (
          propsWithOdds.length > 0 ? (
            <div className="space-y-2">
              {propsWithOdds.map((prop, i) => (
                <div key={i} className="rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TeamLogo team={prop.team} size={28} color={prop.teamColor} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white font-semibold text-sm truncate">{prop.playerName}</span>
                        <span className="text-[9px] text-gray-600 uppercase">{prop.league}</span>
                      </div>
                      <span className="text-gray-400 text-xs">
                        {prop.overUnder} {prop.modelLine} {prop.propType}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-bold ${prop.hitRate >= 70 ? "text-emerald-400" : "text-white"}`}>
                        {prop.hitRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {/* Book prices */}
                  <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
                    {prop.books.map((book, j) => (
                      <span
                        key={j}
                        className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                          book.book === prop.bestBook
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                            : "bg-dark-bg border-dark-border text-gray-400"
                        }`}
                      >
                        {shortBookName(book.book)} {formatOdds(book.odds)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyStateCard
              eyebrow="Best Lines"
              title="No book-priced props available right now"
              body="Best line comparisons appear when sportsbooks have posted lines for today's games."
            />
          )
        ) : tab === "Movement" ? (
          <EmptyStateCard
            eyebrow="Line Movement"
            title="Coming soon"
            body="Line movement tracking requires historical odds snapshots. This feature will launch once we enable odds polling. You'll see opening vs current lines with directional arrows."
          />
        ) : (
          <EmptyStateCard
            eyebrow="Sharp Signals"
            title="Coming soon"
            body="Sharp money detection identifies when professional bettors move lines across multiple books simultaneously. This feature will launch with our paid Odds API tier."
          />
        )}
      </div>
    </div>
  );
}
