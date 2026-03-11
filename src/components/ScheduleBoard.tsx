"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NHLGame } from "@/lib/types";
import TeamLogo from "@/components/TeamLogo";

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

function GoalieInfo({ goalie }: { goalie: GoalieStarter | null }) {
  if (!goalie) return <div className="text-[11px] text-gray-600">TBD</div>;
  const statusColor =
    goalie.status === "confirmed" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
    goalie.status === "probable" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" :
    "text-gray-400 border-gray-500/30 bg-gray-500/10";
  const statusLabel = goalie.status === "confirmed" ? "Confirmed ✓" : goalie.status === "probable" ? "Probable" : "TBD";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-white font-medium">{goalie.name}</span>
        {goalie.isBackup && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold uppercase tracking-wider">Backup</span>
        )}
      </div>
      <div className="text-[10px] text-gray-400">
        SV% {goalie.savePct.toFixed(3)} • GAA {goalie.gaa.toFixed(2)}
      </div>
      <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full border ${statusColor}`}>{statusLabel}</span>
    </div>
  );
}

export default function ScheduleBoard({ compact = false }: { compact?: boolean }) {
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
      title: sectionTitleFor(new Date(key)),
      games,
    }));
  }, [data.games, teamFilter]);

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

      {/* Filters */}
      {!compact && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {/* League filter */}
          <div className="flex rounded-lg bg-dark-surface border border-dark-border p-0.5">
            <div className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-accent-blue text-white">NHL</div>
            {["NBA", "NFL", "MLB"].map((l) => (
              <div key={l} className="px-3 py-1.5 text-[11px] text-gray-600 cursor-not-allowed">{l}</div>
            ))}
          </div>

          {/* Team filter */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-surface border border-dark-border text-[11px] font-medium text-gray-300 hover:border-gray-600 transition-colors"
            >
              {teamFilter === "ALL" ? "All Teams" : teamFilter}
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDropdown && (
              <div className="absolute z-50 mt-1 w-44 max-h-60 overflow-y-auto rounded-xl bg-dark-surface border border-dark-border shadow-xl">
                <button
                  onClick={() => { setTeamFilter("ALL"); setShowDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-dark-bg transition-colors ${teamFilter === "ALL" ? "text-accent-blue font-semibold" : "text-gray-300"}`}
                >
                  All Teams
                </button>
                {NHL_TEAMS.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTeamFilter(t); setShowDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-dark-bg transition-colors ${teamFilter === t ? "text-accent-blue font-semibold" : "text-gray-300"}`}
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
        <p className="text-sm text-gray-500">Loading NHL slate...</p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming NHL games found{teamFilter !== "ALL" ? ` for ${teamFilter}` : ""}.</p>
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
                  <Link key={game.id} href={`/matchup/${game.id}`} className="block">
                    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 hover:border-gray-600 transition-colors">
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

                      {(goalieMap[game.id]?.away || goalieMap[game.id]?.home) && (
                        <div className="mt-3 pt-3 border-t border-dark-border/50">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mb-2">Starting Goalies</div>
                          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
                            <GoalieInfo goalie={goalieMap[game.id]?.away ?? null} />
                            <div className="text-[10px] text-gray-600 pt-1">vs</div>
                            <div className="text-right">
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
