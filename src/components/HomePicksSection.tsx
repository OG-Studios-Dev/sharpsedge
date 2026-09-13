"use client";

import { useState } from "react";
import Link from "next/link";
import { usePicks, useNBAPicks, useNFLPicks, useMLBPicks, useGolfPicks } from "@/hooks/usePicks";
import { usePickHistory } from "@/hooks/usePickHistory";
import TeamLogo from "./TeamLogo";
import PlayerAvatar from "./PlayerAvatar";
import LeagueLogo from "./LeagueLogo";
import { AIPick } from "@/lib/types";
import { computePickRecord, computePickWinRateStats } from "@/lib/pick-record";
import { computePickHistorySummary } from "@/lib/pick-history";
import { getTeamHref, getPlayerHref } from "@/lib/drill-down";
import { formatPickMatchupLabel, isSyntheticGameMarketTeam } from "@/lib/pick-display";

function displayHitRate(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${Math.round(pct)}%`;
}

function ResultPill({ result }: { result: string }) {
  if (result === "win") return <span className="text-[10px] font-bold text-emerald-400 uppercase">WIN ✓</span>;
  if (result === "loss") return <span className="text-[10px] font-bold text-red-400 uppercase">LOSS ✗</span>;
  if (result === "push") return <span className="text-[10px] font-bold text-yellow-400 uppercase">PUSH</span>;
  return <span className="text-[10px] text-gray-500 uppercase">Pending</span>;
}

function RecordBar({ wins, losses, pushes, pending, profitUnits, label, hideWinRate = false }: {
  wins: number; losses: number; pushes: number; pending: number; profitUnits: number; label?: string; hideWinRate?: boolean;
}) {
  const unitColor = profitUnits > 0 ? "text-emerald-400" : profitUnits < 0 ? "text-red-400" : "text-gray-400";
  const { settled, winPct } = computePickWinRateStats({ wins, losses });
  const roundedWinPct = Math.round(winPct);
  return (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-xl border border-dark-border/50 bg-dark-bg/60 px-2.5 py-2 scrollbar-hide sm:gap-3 sm:px-3">
      {label && <span className="text-[10px] text-gray-500 font-semibold uppercase shrink-0">{label}</span>}
      <div className="text-center min-w-[24px] shrink-0">
        <p className="text-emerald-400 font-bold text-sm">{wins}</p>
        <p className="text-[9px] text-gray-500 uppercase">W</p>
      </div>
      <div className="text-center min-w-[24px] shrink-0">
        <p className="text-red-400 font-bold text-sm">{losses}</p>
        <p className="text-[9px] text-gray-500 uppercase">L</p>
      </div>
      <div className="text-center min-w-[24px] shrink-0">
        <p className="text-yellow-400 font-bold text-sm">{pushes}</p>
        <p className="text-[9px] text-gray-500 uppercase">P</p>
      </div>
      <div className="text-center min-w-[24px] shrink-0">
        <p className="text-gray-400 font-bold text-sm">{pending}</p>
        <p className="text-[9px] text-gray-500 uppercase">PD</p>
      </div>
      <div className="ml-auto flex items-center gap-2 shrink-0 pl-1">
        {!hideWinRate && (
          <div className="text-right">
            <p className="font-bold text-sm text-white">{roundedWinPct}%</p>
            <p className="text-[9px] text-gray-500 uppercase">{settled}</p>
          </div>
        )}
        <div className="text-right">
          <p className={`font-bold text-sm ${unitColor}`}>
            {profitUnits > 0 ? "+" : ""}{(profitUnits || 0).toFixed(2)}u
          </p>
          <p className="text-[9px] text-gray-500 uppercase">Net</p>
        </div>
      </div>
    </div>
  );
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function OddsPill({ odds }: { odds?: number }) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return (
    <span className="text-[10px] rounded-full bg-dark-bg/70 text-gray-300 px-2 py-0.5 font-medium shrink-0">
      {formatAmericanOdds(odds)}
    </span>
  );
}

function formatPickDetail(pick: AIPick): string {
  const matchup = formatPickMatchupLabel(pick);
  return matchup ? `${matchup} — ${pick.pickLabel}` : pick.pickLabel;
}

function PickRow({ pick }: { pick: AIPick }) {
  const isSyntheticTeam = isSyntheticGameMarketTeam(pick.team);
  const teamHref = getTeamHref(pick.team, pick.league);
  const drillHref = isSyntheticTeam
    ? `/picks?league=${pick.league || "NFL"}`
    : pick.type === "player" && pick.playerId
    ? getPlayerHref(pick.playerId)
    : teamHref;

  return (
    <Link href={drillHref} className="flex items-start gap-3 py-3 border-b border-dark-border/40 last:border-0 group sm:items-center sm:py-2.5">
      {pick.type === "player" ? (
        <PlayerAvatar name={pick.playerName || pick.team} team={pick.team} league={pick.league} playerId={pick.playerId} size={30} teamColor={pick.teamColor} />
      ) : isSyntheticTeam ? (
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-dark-border bg-dark-bg/70">
          <LeagueLogo league={pick.league || "NFL"} size={18} />
        </span>
      ) : (
        <TeamLogo team={pick.team} size={30} color={pick.teamColor} sport={pick.league ?? undefined} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-white text-[13px] sm:text-xs font-semibold truncate group-hover:text-emerald-300 transition-colors">
            {pick.type === "player" ? pick.playerName : formatPickMatchupLabel(pick) || pick.team}
          </p>
          {pick.league && (
            <span className="inline-flex items-center gap-1 text-[9px] text-gray-500 uppercase shrink-0"><LeagueLogo league={pick.league} size={12} />{pick.league}</span>
          )}
        </div>
        <p className="text-accent-blue text-xs sm:text-[11px] truncate mt-0.5">{pick.type === "player" ? formatPickDetail(pick) : pick.pickLabel}</p>
        <div className="flex items-center gap-2 mt-1.5 sm:hidden">
          <span className="text-[10px] text-gray-500">{displayHitRate(pick.hitRate)} hit</span>
          <OddsPill odds={pick.odds} />
          <ResultPill result={pick.result} />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-2 shrink-0 pl-2">
        <span className="text-[10px] text-gray-500">{displayHitRate(pick.hitRate)} hit</span>
        <OddsPill odds={pick.odds} />
        <ResultPill result={pick.result} />
      </div>
    </Link>
  );
}

function computeRecord(picks: AIPick[]) {
  return computePickRecord(picks);
}

const SPORT_ICONS: Record<string, { icon: string; label: string }> = {
  All: { icon: "🏆", label: "All" },
  NHL: { icon: "NHL", label: "NHL" },
  NBA: { icon: "NBA", label: "NBA" },
  NFL: { icon: "NFL", label: "NFL" },
  MLB: { icon: "MLB", label: "MLB" },
  PGA: { icon: "PGA", label: "PGA" },
};

export default function HomePicksSection({ league = "All" }: { league?: string }) {
  const nhl = usePicks();
  const nba = useNBAPicks();
  const nfl = useNFLPicks();
  const mlb = useMLBPicks();
  const golf = useGolfPicks();
  const { picks: historyPicks } = usePickHistory();

  const allNHLPicks = Object.values(nhl.allPicks).flat();
  const allNBAPicks = Object.values(nba.allPicks).flat();
  const allNFLPicks = Object.values(nfl.allPicks).flat();
  const allMLBPicks = Object.values(mlb.allPicks).flat();
  const allGolfPicks = Object.values(golf.allPicks).flat();
  const allPicks = [...allNHLPicks, ...allNBAPicks, ...allNFLPicks, ...allMLBPicks];
  const nonGolfHistoryPicks = historyPicks.filter((pick) => pick.league !== "PGA");

  const localNhlRecord = computeRecord(allNHLPicks);
  const localNbaRecord = computeRecord(allNBAPicks);
  const localNflRecord = computeRecord(allNFLPicks);
  const localMlbRecord = computeRecord(allMLBPicks);
  const localAllRecord = computeRecord(allPicks);
  const localGolfRecord = computeRecord(allGolfPicks);
  const hasRemoteHistory = historyPicks.length > 0;

  const nhlRecord = hasRemoteHistory
    ? computePickHistorySummary(historyPicks.filter((pick) => pick.league === "NHL"))
    : localNhlRecord;
  const nbaRecord = hasRemoteHistory
    ? computePickHistorySummary(historyPicks.filter((pick) => pick.league === "NBA"))
    : localNbaRecord;
  const nflRecord = hasRemoteHistory
    ? computePickHistorySummary(historyPicks.filter((pick) => pick.league === "NFL"))
    : localNflRecord;
  const mlbRecord = hasRemoteHistory
    ? computePickHistorySummary(historyPicks.filter((pick) => pick.league === "MLB"))
    : localMlbRecord;
  const allRecord = hasRemoteHistory
    ? computePickHistorySummary(nonGolfHistoryPicks)
    : localAllRecord;
  const golfRecord = hasRemoteHistory
    ? computePickHistorySummary(historyPicks.filter((pick) => pick.league === "PGA"))
    : localGolfRecord;

  const [recordSport, setRecordSport] = useState(league === "All" ? "All" : league);
  const recordMap: Record<string, typeof allRecord> = {
    All: allRecord,
    NHL: nhlRecord,
    NBA: nbaRecord,
    NFL: nflRecord,
    MLB: mlbRecord,
    PGA: golfRecord,
  };
  const displayRecord = recordMap[recordSport] || allRecord;

  // Which today picks to show
  const displayPicks =
    league === "NBA"
      ? nba.todayPicks
      : league === "NFL"
      ? nfl.todayPicks
      : league === "MLB"
      ? mlb.todayPicks
      : league === "PGA"
      ? golf.todayPicks
      : league === "All"
      ? [...nhl.todayPicks, ...nba.todayPicks, ...nfl.todayPicks, ...mlb.todayPicks]
      : nhl.todayPicks;

  const loadingPicks =
    league === "NBA"
      ? nba.loadingPicks
      : league === "NFL"
      ? nfl.loadingPicks
      : league === "MLB"
      ? mlb.loadingPicks
      : league === "PGA"
      ? golf.loadingPicks
      : league === "All"
      ? nhl.loadingPicks || nba.loadingPicks || nfl.loadingPicks || mlb.loadingPicks
      : nhl.loadingPicks;

  const picksError =
    league === "NBA"
      ? nba.picksError
      : league === "NFL"
      ? nfl.picksError
      : league === "MLB"
      ? mlb.picksError
      : league === "PGA"
      ? golf.picksError
      : league === "All"
      ? [nhl.picksError, nba.picksError, nfl.picksError, mlb.picksError].filter(Boolean).join(" · ") || null
      : nhl.picksError;

  const record =
    league === "NBA" ? nbaRecord : league === "NFL" ? nflRecord : league === "MLB" ? mlbRecord : league === "PGA" ? golfRecord : league === "All" ? allRecord : nhlRecord;
  const mobileDisplayPicks = league === "PGA" ? displayPicks.slice(0, 5) : displayPicks;
  const displayLearningPicks = league === "NFL" ? nfl.learningPicks.slice(0, 3) : [];

  return (
    <section className="rounded-2xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">{league === "PGA" ? "TOURNAMENT AI PICKS" : "Goose's AI Picks"}</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {league === "PGA"
              ? "PGA · 12 tournament picks · 1 unit each"
              : league === "NFL"
              ? "NFL · this week’s qualified picks · 1 unit each"
              : `${league === "All" ? "All Sports" : league} · qualified picks only · 1 unit each`}
          </p>
        </div>
        <Link href="/picks" className="text-xs text-accent-blue font-medium">View all →</Link>
      </div>

      {/* Record bar with sport icon filter */}
      {league === "All" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            {Object.entries(SPORT_ICONS).map(([key, { icon }]) => (
              <button
                key={key}
                type="button"
                onClick={() => setRecordSport(key)}
                className={`tap-button flex items-center justify-center w-9 h-9 rounded-xl text-base transition-all ${
                  recordSport === key
                    ? "bg-accent-blue/20 border border-accent-blue/50 scale-110 shadow-lg shadow-accent-blue/10"
                    : "bg-dark-bg/40 border border-dark-border/40 hover:border-gray-500"
                }`}
                aria-label={`Show ${key} record`}
              >
                {key === "All" ? <span>{icon}</span> : <LeagueLogo league={key} size={18} />}
              </button>
            ))}
          </div>
          <RecordBar {...displayRecord} label={recordSport === "All" ? "All Sports" : recordSport} />
        </div>
      ) : (
        <RecordBar {...record} hideWinRate={league === "PGA"} />
      )}

      {/* Picks */}
      <div className="mt-3">
        {loadingPicks ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-dark-border/40 animate-pulse" />
            ))}
          </div>
        ) : picksError && displayPicks.length === 0 && displayLearningPicks.length === 0 ? (
          <div className="rounded-2xl border border-accent-red/30 bg-accent-red/10 px-4 py-3">
            <p className="text-sm font-semibold text-accent-red">Picks feed unavailable</p>
            <p className="mt-1 text-xs text-gray-400">{picksError}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayPicks.length === 0 ? (
              <div className="rounded-xl border border-dark-border/50 bg-dark-bg/35 px-3 py-3 text-center">
                <p className="text-gray-300 text-xs font-medium">
                  {league === "PGA"
                    ? "No PGA tournament picks available"
                    : league === "NFL"
                    ? "No official NFL pick cleared both gates this week"
                    : "No qualified picks on the current slate"}
                </p>
                <p className="text-gray-600 text-[10px] mt-1">
                  {league === "PGA"
                    ? "The board will populate when ESPN posts a PGA field or live leaderboard for the current event."
                    : league === "NFL"
                    ? "Nothing gets forced. Hit rate and measured edge must both qualify."
                    : "Check back once games are posted"}
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                <div className="sm:hidden">
                  {mobileDisplayPicks.map((pick) => (
                    <PickRow key={pick.id} pick={pick} />
                  ))}
                  {league === "PGA" && displayPicks.length > mobileDisplayPicks.length ? (
                    <Link href="/picks" className="mt-3 inline-flex text-xs font-medium text-accent-blue">
                      View all {displayPicks.length} tournament picks →
                    </Link>
                  ) : null}
                </div>
                <div className="hidden sm:block">
                  {displayPicks.map((pick) => (
                    <PickRow key={pick.id} pick={pick} />
                  ))}
                </div>
              </div>
            )}

            {displayLearningPicks.length > 0 ? (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-violet-300">Goose Learning · shadow only</p>
                    <p className="text-[9px] text-gray-600">Model training picks — never counted as official releases</p>
                  </div>
                  <Link href="/picks?league=NFL" className="shrink-0 text-[10px] font-medium text-violet-300">View →</Link>
                </div>
                {displayLearningPicks.map((pick) => (
                  <PickRow key={`learning-${pick.id}`} pick={pick} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
