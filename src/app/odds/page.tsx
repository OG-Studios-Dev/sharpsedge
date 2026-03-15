"use client";

import { useEffect, useMemo, useState } from "react";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import { GolfDashboardData } from "@/lib/types";
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
  const [golfData, setGolfData] = useState<GolfDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setProps([]);
    setOdds([]);
    setGolfData(null);

    if (sportLeague === "PGA") {
      fetch("/api/golf/dashboard")
        .then((response) => response.json())
        .then((data: GolfDashboardData) => {
          setGolfData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return;
    }

    const endpoints: Array<Promise<any>> = [];
    if (sportLeague === "All" || sportLeague === "NHL") endpoints.push(fetch("/api/dashboard").then((r) => r.json()));
    if (sportLeague === "All" || sportLeague === "NBA") endpoints.push(fetch("/api/nba/dashboard").then((r) => r.json()));
    if (sportLeague === "All" || sportLeague === "MLB") endpoints.push(fetch("/api/mlb/dashboard").then((r) => r.json()));

    Promise.all(endpoints)
      .then((results) => {
        const allProps = results.flatMap((result) => result.props || []);
        const allOdds = results.flatMap((result) => result.odds || []);
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
    <div className="mx-auto max-w-6xl">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="flex items-center justify-between px-4 py-3">
          <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg" />
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
        <p className="text-center text-sm font-semibold text-gray-300 pb-1">Lines</p>

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

      <div className="px-3 py-4 lg:px-0">
        {loading ? (
          <EmptyStateCard
            eyebrow="Loading odds"
            title="Fetching live lines from sportsbooks"
            body="Pulling real-time odds from DraftKings, FanDuel, BetMGM, and more."
          />
        ) : sportLeague === "PGA" ? (
          tab === "Best Lines" ? (
            golfData?.odds && (golfData.odds.outrights.length > 0 || golfData.odds.h2h.length > 0) ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Tournament board</p>
                  <h3 className="mt-1 text-lg font-semibold text-white">{golfData.leaderboard?.tournament.name || golfData.odds.tournament}</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    {golfData.meta.oddsConnected ? "Outrights and head-to-head matchups loaded from The Odds API." : "Odds feed unavailable for the current PGA event."}
                  </p>
                </div>

                {golfData.odds.outrights.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Outrights</p>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {golfData.odds.outrights.slice(0, 12).map((offer) => (
                        <div key={`${offer.playerName}-${offer.book}`} className="rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">{offer.playerName}</p>
                              <p className="mt-1 text-xs text-gray-500">{offer.book}</p>
                            </div>
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                              {formatOdds(offer.odds)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {golfData.odds.h2h.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Head To Head</p>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {golfData.odds.h2h.slice(0, 8).map((matchup) => (
                        <div key={`${matchup.matchup}-${matchup.book}`} className="rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-3">
                          <p className="text-sm font-semibold text-white">{matchup.matchup}</p>
                          <p className="mt-1 text-xs text-gray-500">{matchup.book}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-dark-border/40 bg-dark-bg/40 px-3 py-2">
                              <p className="truncate text-[11px] text-gray-400">{matchup.playerA}</p>
                              <p className="mt-1 text-sm font-semibold text-white">{formatOdds(matchup.playerAOdds)}</p>
                            </div>
                            <div className="rounded-xl border border-dark-border/40 bg-dark-bg/40 px-3 py-2">
                              <p className="truncate text-[11px] text-gray-400">{matchup.playerB}</p>
                              <p className="mt-1 text-sm font-semibold text-white">{formatOdds(matchup.playerBOdds)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyStateCard
                eyebrow="PGA Odds"
                title="No golf odds available right now"
                body="This view will populate when the current tournament has posted outrights or head-to-head markets."
              />
            )
          ) : (
            <EmptyStateCard
              eyebrow={tab}
              title="Coming soon"
              body="Golf line movement and sharper matchup screening will sit on top of the new tournament odds feed once snapshot storage is enabled."
            />
          )
        ) : tab === "Best Lines" ? (
          propsWithOdds.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
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
