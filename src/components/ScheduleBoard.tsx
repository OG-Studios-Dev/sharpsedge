"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NHLGame } from "@/lib/types";
import TeamLogo from "@/components/TeamLogo";
import { computeWinProb } from "@/components/WinProbability";
import { getDateKey, parseDateKey } from "@/lib/date-utils";
import { ChevronRight } from "lucide-react";

type GoalieStarter = {
  playerId: number;
  name: string;
  status: "confirmed" | "probable" | "unconfirmed";
  team: string;
  wins: number;
  losses: number;
  otLosses: number;
  savePct: number;
  gaa: number;
  isBackup: boolean;
};

type GameGoalies = {
  gameId: number;
  home: GoalieStarter | null;
  away: GoalieStarter | null;
};

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

const NHL_TEAMS = [
  "ANA","ARI","BOS","BUF","CGY","CAR","CHI","COL","CBJ","DAL","DET","EDM",
  "FLA","LAK","MIN","MTL","NSH","NJD","NYI","NYR","OTT","PHI","PIT","SEA",
  "SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH",
];

function formatDayLabel(date: Date) {
  return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function formatGameTime(startTimeUTC: string) {
  return new Date(startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function dayKey(date: Date) {
  return getDateKey(date);
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

function GoalieInfo({ goalie }: { goalie: GoalieStarter | null }) {
  if (!goalie) return <div className="text-[11px] text-text-platinum/40 font-mono tracking-widest">TBD</div>;
  
  const isConfirmed = goalie.status === "confirmed";
  const isProbable = goalie.status === "probable";
  
  const statusColor = isConfirmed 
    ? "text-accent-green border-accent-green/30 bg-accent-green/10" 
    : isProbable 
      ? "text-accent-yellow border-accent-yellow/30 bg-accent-yellow/10" 
      : "text-text-platinum/50 border-dark-border bg-dark-bg text-text-platinum/60";
      
  const statusLabel = isConfirmed ? "CONFIRMED" : isProbable ? "PROBABLE" : "TBD";
  
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[12px] text-text-platinum font-bold font-sans">{goalie.name}</span>
        {goalie.isBackup && (
          <span className="text-[8px] px-1.5 py-0.5 rounded border border-accent-red/30 bg-accent-red/10 text-accent-red font-bold uppercase tracking-wider font-mono">BACKUP</span>
        )}
      </div>
      <div className="text-[10px] text-text-platinum/50 font-mono flex gap-2">
        <span>SV% {goalie.savePct.toFixed(3)}</span>
        <span>GAA {goalie.gaa.toFixed(2)}</span>
      </div>
      <span className={`inline-block text-[9px] px-2 py-0.5 rounded font-mono font-bold tracking-widest border ${statusColor}`}>
        {statusLabel}
      </span>
    </div>
  );
}

export default function ScheduleBoard({ compact = false, showHeader = true }: { compact?: boolean; showHeader?: boolean }) {
  const [data, setData] = useState<GamesResponse>({ games: [], date: "" });
  const [loading, setLoading] = useState(true);
  const [goalieMap, setGoalieMap] = useState<Record<number, GameGoalies>>({});
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    fetch(`/api/games?days=${compact ? 3 : 7}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.games) {
          setData(json);
          const futureGames = (json.games as NHLGame[]).filter(
            (g) => g.gameState === "FUT" || g.gameState === "LIVE" || g.gameState === "PRE"
          );
          Promise.allSettled(
            futureGames.map((g) =>
              fetch(`/api/goalies?gameId=${g.id}`)
                .then((r) => r.json())
                .then((data: GameGoalies) => ({ gameId: g.id, data }))
             )
          ).then((results) => {
            const map: Record<number, GameGoalies> = {};
            for (const r of results) {
              if (r.status === "fulfilled") map[r.value.gameId] = r.value.data;
            }
            setGoalieMap(map);
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [compact]);

  const sections = useMemo<Section[]>(() => {
    const grouped = new Map<string, NHLGame[]>();
    const today = startOfDay(new Date()).getTime();
    const ACTIVE = new Set(["FUT", "LIVE", "PRE"]);

    for (const game of data.games) {
      if (!ACTIVE.has(game.gameState)) continue;
      const date = new Date(game.startTimeUTC);
      const normalized = startOfDay(date).getTime();
      if (normalized < today) continue;

      if (teamFilter !== "ALL") {
        if (game.awayTeam.abbrev !== teamFilter && game.homeTeam.abbrev !== teamFilter) continue;
      }

      const key = dayKey(date);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(game);
    }

    return Array.from(grouped.entries()).map(([key, games]) => ({
      key,
      title: sectionTitleFor(parseDateKey(key)),
      games,
    }));
  }, [data.games, teamFilter]);

  return (
    <section className="rounded-3xl bg-dark-card border border-dark-border/80 p-5 lg:p-6 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)]">
      {showHeader && (
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap border-b border-dark-border/40 pb-4">
          <div>
            <h2 className="text-text-platinum font-heading font-black text-2xl tracking-tight">NHL Schedule</h2>
            <p className="text-xs text-text-platinum/50 font-sans mt-1">{compact ? "Today, tomorrow, and next up" : "Today, tomorrow, and the rest of the week"}</p>
          </div>
          <div className="flex items-center gap-2">
            {data.meta?.oddsConnected ? (
              <span className="text-[10px] px-2 py-1 rounded border border-accent-green/30 bg-accent-green/10 text-accent-green font-mono font-bold tracking-widest uppercase">Live Odds</span>
            ) : (
              <span className="text-[10px] px-2 py-1 rounded border border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow font-mono font-bold tracking-widest uppercase">Schedule Only</span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      {!compact && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* League filter */}
          <div className="flex rounded-lg bg-dark-bg/50 border border-dark-border p-1">
            <div className="px-5 py-1.5 text-xs font-bold font-sans rounded-md bg-accent-blue text-dark-bg shadow-[0_0_10px_-2px_rgba(74,158,255,0.4)]">NHL</div>
            {["NBA", "NFL", "MLB"].map((l) => (
              <div key={l} className="px-5 py-1.5 text-xs font-semibold font-sans text-text-platinum/40 cursor-not-allowed">{l}</div>
            ))}
          </div>

          {/* Team filter */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-4 py-[7px] rounded-lg bg-dark-bg/50 border border-dark-border text-xs font-semibold text-text-platinum/80 hover:border-text-platinum/30 hover:text-white transition-colors"
            >
              {teamFilter === "ALL" ? "All Teams" : teamFilter}
              <ChevronDown size={14} className="text-text-platinum/50" />
            </button>
            {showDropdown && (
              <div className="absolute z-50 mt-2 w-48 max-h-64 overflow-y-auto rounded-xl bg-dark-surface border border-dark-border/80 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] py-1 scrollbar-hide">
                <button
                  onClick={() => { setTeamFilter("ALL"); setShowDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${teamFilter === "ALL" ? "text-accent-blue font-bold bg-accent-blue/10" : "text-text-platinum/70 hover:bg-dark-bg/80 hover:text-white font-semibold"}`}
                >
                  All Teams
                </button>
                {NHL_TEAMS.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTeamFilter(t); setShowDropdown(false); }}
                    className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${teamFilter === t ? "text-accent-blue font-bold bg-accent-blue/10" : "text-text-platinum/70 hover:bg-dark-bg/80 hover:text-white font-semibold"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-6 w-24 bg-dark-border rounded animate-pulse" />
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-dark-border/40 animate-pulse border border-dark-border/50" />)}
          </div>
        </div>
      ) : sections.length === 0 ? (
        <div className="text-center py-10 bg-dark-bg/30 rounded-2xl border border-dark-border/30">
          <p className="text-text-platinum/60 text-sm font-semibold">No upcoming NHL games found{teamFilter !== "ALL" ? ` for ${teamFilter}` : ""}.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.slice(0, compact ? 3 : 7).map((section) => (
            <div key={section.key}>
              <div className="flex items-end justify-between mb-4 border-b border-dark-border/30 pb-2 pl-1">
                <h3 className="text-[13px] uppercase font-mono tracking-widest font-bold text-text-platinum/80">{section.title}</h3>
                <span className="text-[10px] font-mono text-text-platinum/40">{section.games.length} game{section.games.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {section.games.map((game) => (
                  <Link key={game.id} href={`/matchup/${game.id}`} className="block group">
                    <div className="rounded-2xl border border-dark-border/80 bg-gradient-to-br from-dark-surface/80 to-dark-bg p-5 hover:border-accent-blue/50 hover:shadow-[0_8px_30px_-15px_rgba(74,158,255,0.15)] transition-all duration-300 relative overflow-hidden">
                      {game.gameState === "LIVE" && (
                        <div className="absolute top-0 right-0 left-0 h-0.5 bg-gradient-to-r from-transparent via-accent-green to-transparent opacity-80" />
                      )}
                      
                      <div className="flex items-center justify-between mb-5 gap-3">
                        <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/50 flex items-center gap-2">
                          {game.gameState === "LIVE" ? (
                            <span className="flex items-center gap-1.5 text-accent-green font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                              LIVE
                            </span>
                          ) : (
                            formatGameTime(game.startTimeUTC)
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-accent-blue uppercase tracking-widest font-bold opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                          Matchup <ChevronRight size={12} strokeWidth={3} />
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                        <div className="flex items-center gap-3 min-w-0">
                          <TeamLogo team={game.awayTeam.abbrev} logo={game.awayTeam.logo} size={36} color="#334155" />
                          <div className="min-w-0">
                            <div className="text-text-platinum font-heading font-bold text-lg leading-tight truncate group-hover:text-white transition-colors">{game.awayTeam.name || game.awayTeam.abbrev}</div>
                            <div className="text-[11px] font-mono text-text-platinum/40 uppercase mt-0.5">{game.awayTeam.abbrev}</div>
                          </div>
                        </div>

                        <div className="text-center px-2">
                          <div className="text-[10px] text-text-platinum/30 font-mono uppercase tracking-widest">VS</div>
                        </div>

                        <div className="flex items-center gap-3 min-w-0 justify-end text-right">
                          <div className="min-w-0">
                            <div className="text-text-platinum font-heading font-bold text-lg leading-tight truncate group-hover:text-white transition-colors">{game.homeTeam.name || game.homeTeam.abbrev}</div>
                            <div className="text-[11px] font-mono text-text-platinum/40 uppercase mt-0.5">{game.homeTeam.abbrev}</div>
                          </div>
                          <TeamLogo team={game.homeTeam.abbrev} logo={game.homeTeam.logo} size={36} color="#334155" />
                        </div>
                      </div>

                      {(game.bestMoneyline?.away || game.bestMoneyline?.home) && (
                        <>
                          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-xl bg-dark-bg/60 border border-dark-border/50 px-4 py-2.5 flex justify-between items-center group/odds hover:border-accent-blue/30 transition-colors">
                              <span className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 group-hover/odds:text-text-platinum/60 transition-colors">Away ML</span>
                              <span className="font-mono font-bold text-text-platinum">{game.bestMoneyline?.away?.odds ?? "-"}</span>
                            </div>
                            <div className="rounded-xl bg-dark-bg/60 border border-dark-border/50 px-4 py-2.5 flex justify-between items-center group/odds hover:border-accent-blue/30 transition-colors">
                              <span className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 group-hover/odds:text-text-platinum/60 transition-colors">Home ML</span>
                              <span className="font-mono font-bold text-text-platinum">{game.bestMoneyline?.home?.odds ?? "-"}</span>
                            </div>
                          </div>
                          {/* Win Probability */}
                          <div className="mt-2.5 flex items-center justify-between px-1">
                            <span className="text-[10px] font-mono text-text-platinum/50 flex items-center gap-1.5">
                              {game.awayTeam.abbrev}{" "}
                              <span className="text-text-platinum font-bold">
                                {game.bestMoneyline?.away?.odds != null
                                  ? `${Math.round(computeWinProb(game.bestMoneyline.away.odds) * 100)}%`
                                  : "—"}
                              </span>
                            </span>
                            <span className="text-accent-champagne/80 uppercase tracking-widest font-mono text-[8px] font-bold">Win Prob</span>
                            <span className="text-[10px] font-mono text-text-platinum/50 flex items-center gap-1.5 flex-row-reverse">
                              {game.homeTeam.abbrev}{" "}
                              <span className="text-text-platinum font-bold">
                                {game.bestMoneyline?.home?.odds != null
                                  ? `${Math.round(computeWinProb(game.bestMoneyline.home.odds) * 100)}%`
                                  : "—"}
                              </span>
                            </span>
                          </div>
                        </>
                      )}

                      {(goalieMap[game.id]?.away || goalieMap[game.id]?.home) && (
                        <div className="mt-5 pt-4 border-t border-dark-border/40">
                          <div className="text-[9px] uppercase font-mono tracking-widest text-text-platinum/30 mb-3 text-center">Starting Goalies</div>
                          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                            <GoalieInfo goalie={goalieMap[game.id]?.away ?? null} />
                            <div className="w-[1px] h-full bg-dark-border/30 mx-auto"></div>
                            <div className="text-right flex flex-col items-end">
                              <GoalieInfo goalie={goalieMap[game.id]?.home ?? null} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ChevronDown({ className, size }: { className?: string, size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}
