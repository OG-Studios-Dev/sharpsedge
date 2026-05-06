"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, ChevronDown, Flag } from "lucide-react";
import { usePicks, useNBAPicks, useMLBPicks, useGolfPicks } from "@/hooks/usePicks";
import { usePickHistory } from "@/hooks/usePickHistory";
import { useLeague } from "@/hooks/useLeague";
import type { AIPick, GolfDashboardData, GolfTournament } from "@/lib/types";
import { normalizeSportsLeague } from "@/lib/insights";
import { computePickRecord, computePickWinRateStats } from "@/lib/pick-record";
import type { PickHistoryRecord } from "@/lib/supabase-types";
import LeagueDropdown from "@/components/LeagueDropdown";
import TeamLogo from "@/components/TeamLogo";
import PlayerAvatar from "@/components/PlayerAvatar";
import EmptyStateCard from "@/components/EmptyStateCard";
import BookBadge from "@/components/BookBadge";
import PageHeader from "@/components/PageHeader";
import { PickCardSkeleton } from "@/components/LoadingSkeleton";
import { describeBookSavings, hasAlternateBookLines, resolveSelectedBookOdds, sortBookOddsForDisplay } from "@/lib/book-odds";
import { getPlayerTrendHrefFromPick } from "@/lib/player-trend";
import { APP_TIME_ZONE, MLB_TIME_ZONE, NBA_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { useAppChrome } from "@/components/AppChromeProvider";
import { createDraftFromAIPick } from "@/lib/my-picks";
import { getStaggerStyle } from "@/lib/stagger-style";
import {
  formatGolfUpdatedAt,
  getGolfBadgeTone,
  getGolfPredictionSourceLabel,
  getGolfTournamentBadgeLabel,
} from "@/lib/golf-ui";

function ResultPill({ result }: { result: AIPick["result"] }) {
  const styles: Record<AIPick["result"], string> = {
    pending: "border-gray-500 text-gray-400",
    win: "border-accent-green text-accent-green bg-accent-green/10",
    loss: "border-accent-red text-accent-red bg-accent-red/10",
    push: "border-accent-yellow text-accent-yellow bg-accent-yellow/10",
  };

  return <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${styles[result]}`}>{result}</span>;
}

function displayHitRate(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${Math.round(pct)}%`;
}

function displayEdge(val: number): string {
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function todayKeyForLeague(league: string) {
  const timeZone = league === "NBA"
    ? NBA_TIME_ZONE
    : league === "MLB"
      ? MLB_TIME_ZONE
      : APP_TIME_ZONE;

  return getDateKey(new Date(), timeZone);
}

function resolveGolfTournament(dashboard: GolfDashboardData | null): GolfTournament | null {
  if (dashboard?.leaderboard?.tournament) return dashboard.leaderboard.tournament;
  const schedule = dashboard?.schedule ?? [];
  return schedule.find((tournament) => tournament.current)
    ?? schedule.find((tournament) => tournament.status === "upcoming")
    ?? schedule[0]
    ?? null;
}

function buildGolfBannerCopy(dashboard: GolfDashboardData | null, tournament: GolfTournament | null) {
  const leaderboardPlayers = dashboard?.leaderboard?.players.length ?? 0;
  const predictions = dashboard?.predictions;
  const datagolf = predictions?.dataSources?.datagolf;
  const predictionSource = getGolfPredictionSourceLabel(predictions);

  if (!tournament) return "Tournament status pending while the PGA feed loads.";
  if (tournament.status === "completed") {
    return leaderboardPlayers > 0
      ? `Final leaderboard posted for ${leaderboardPlayers} players.`
      : "This event is complete.";
  }
  if (leaderboardPlayers > 0 && datagolf?.ready) {
    const cacheTime = datagolf.lastScrape ? ` · cache ${formatGolfUpdatedAt(datagolf.lastScrape)}` : "";
    return `Live board for ${leaderboardPlayers} players. ${predictionSource} matched ${datagolf.matchedPlayers}/${datagolf.totalPlayers} players${cacheTime}.`;
  }
  if (leaderboardPlayers > 0) {
    return `Live board for ${leaderboardPlayers} players. ${datagolf?.reason ?? "DataGolf cache is not ready, so picks are using the ESPN fallback model."}`;
  }
  return "Waiting for ESPN to post the field or live leaderboard before the tournament picks board can fully unlock.";
}

type PastFilter = "all" | "win" | "loss" | "push";
type HistoryItem = {
  id: string;
  date: string;
  league: string;
  team: string;
  opponent: string;
  pickLabel: string;
  hitRate: number;
  edge: number;
  odds: number;
  result: AIPick["result"];
  units: number;
  teamColor?: string;
};

type LearningResultsSummary = {
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  winRate: number | null;
  roi: number | null;
};

type LearningResultsPayload = {
  ok: boolean;
  locked: boolean;
  league: string;
  modelVersion: string;
  latestDate: string | null;
  earliestDate: string | null;
  overall: LearningResultsSummary;
  settled: LearningResultsSummary;
  disclosure: string;
};

const SPORT_ICONS: Record<string, { label: string }> = {
  All: { label: "All" },
  NHL: { label: "NHL" },
  NBA: { label: "NBA" },
  MLB: { label: "MLB" },
  PGA: { label: "PGA" },
};

function oddsToProfit(odds: number, units: number): number {
  if (odds >= 100) return Math.round((odds / 100) * units * 100) / 100;
  if (odds <= -100) return Math.round((100 / Math.abs(odds)) * units * 100) / 100;
  return units;
}

function computeHistoryRecord(items: HistoryItem[]) {
  return items.reduce((record, item) => {
    const odds = typeof item.odds === "number" && item.odds !== 0 ? item.odds : -110;
    if (item.result === "win") {
      record.wins += 1;
      record.profitUnits += oddsToProfit(odds, item.units);
    } else if (item.result === "loss") {
      record.losses += 1;
      record.profitUnits -= item.units;
    } else if (item.result === "push") {
      record.pushes += 1;
    } else {
      record.pending += 1;
    }
    return record;
  }, { wins: 0, losses: 0, pushes: 0, pending: 0, profitUnits: 0 });
}

function formatUnits(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function LearningModelResultsBar({
  results,
  loading,
  officialWinPct,
}: {
  results: LearningResultsPayload | null;
  loading: boolean;
  officialWinPct: number;
}) {
  const summary = results?.overall ?? null;
  const winRate = summary?.winRate ?? null;
  const delta = winRate != null && Number.isFinite(officialWinPct) ? Number((winRate - officialWinPct).toFixed(1)) : null;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-500/25 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(16,19,27,0.95),rgba(11,14,20,0.95))]">
      <div className="border-b border-emerald-500/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Goose Learning Picks</p>
            <p className="mt-1 text-xs text-gray-400">Results only · picks stay locked</p>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-300">
            Add-on
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 px-4 py-4">
          <div className="h-8 rounded-xl bg-dark-border/40 animate-pulse" />
          <div className="h-3 rounded-full bg-dark-border/30 animate-pulse" />
        </div>
      ) : !summary || summary.total === 0 ? (
        <div className="px-4 py-4">
          <p className="text-sm font-semibold text-white">Learning results are warming up.</p>
          <p className="mt-1 text-xs text-gray-500">Once the shadow model logs settled picks, this bar will show the premium record without exposing the plays.</p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <div className="flex items-center gap-5 overflow-x-auto">
            <div className="text-center"><p className="text-lg font-bold text-emerald-400">{summary.wins}</p><p className="text-[10px] uppercase text-gray-500">W</p></div>
            <div className="text-center"><p className="text-lg font-bold text-red-400">{summary.losses}</p><p className="text-[10px] uppercase text-gray-500">L</p></div>
            <div className="text-center"><p className="text-lg font-bold text-yellow-400">{summary.pushes}</p><p className="text-[10px] uppercase text-gray-500">Push</p></div>
            <div className="text-center"><p className="text-lg font-bold text-gray-400">{summary.pending}</p><p className="text-[10px] uppercase text-gray-500">Pending</p></div>
            <div className="ml-auto flex items-center gap-4">
              <div className="text-right">
                <p className="text-lg font-bold text-white">{winRate != null ? `${winRate.toFixed(1)}%` : "—"}</p>
                <p className="text-[10px] uppercase text-gray-500">Win % · {summary.settled}</p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${summary.units > 0 ? "text-emerald-400" : summary.units < 0 ? "text-red-400" : "text-gray-400"}`}>{formatUnits(summary.units)}</p>
                <p className="text-[10px] uppercase text-gray-500">Net Units</p>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-dark-border/60 bg-dark-bg/50 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-gray-400">Vs official AI record</span>
              <span className={delta == null ? "text-gray-500" : delta >= 0 ? "text-emerald-300" : "text-red-300"}>
                {delta == null ? "Pending comparison" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dark-border/60">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-accent-blue" style={{ width: `${Math.max(6, Math.min(100, winRate ?? 0))}%` }} />
            </div>
            <p className="mt-2 text-[10px] text-gray-500">Latest shadow day: {results?.latestDate ?? "—"}. No learning-model pick details are shown.</p>
          </div>

          <Link href="/upgrade" className="tap-button mt-3 inline-flex w-full justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors hover:border-emerald-300/60 hover:text-white">
            Unlock Learning Model add-on →
          </Link>
        </div>
      )}
    </div>
  );
}

function mapLocalPickToHistoryItem(date: string, pick: AIPick): HistoryItem {
  return {
    id: pick.id,
    date,
    league: pick.league || "NHL",
    team: pick.team,
    opponent: pick.opponent,
    pickLabel: pick.pickLabel,
    hitRate: pick.hitRate,
    edge: pick.edge,
    odds: pick.odds,
    result: pick.result,
    units: pick.units,
    teamColor: pick.teamColor,
  };
}

function mapRecordToHistoryItem(record: PickHistoryRecord): HistoryItem {
  return {
    id: record.id,
    date: record.date,
    league: record.league,
    team: record.team,
    opponent: record.opponent || "TBD",
    pickLabel: record.pick_label,
    hitRate: typeof record.hit_rate === "number" ? record.hit_rate : 0,
    edge: typeof record.edge === "number" ? record.edge : 0,
    odds: typeof record.odds === "number" ? record.odds : -110,
    result: record.result,
    units: typeof record.units === "number" && Number.isFinite(record.units) ? record.units : 1,
  };
}

function PickCard({ pick, isExpanded, onToggle }: { pick: AIPick; isExpanded: boolean; onToggle: () => void }) {
  const { openAddPickModal } = useAppChrome();
  const bookOdds = sortBookOddsForDisplay(pick.bookOdds || [], pick.line);
  const selectedBookOdds = resolveSelectedBookOdds(bookOdds, {
    book: pick.book,
    odds: pick.odds,
    line: pick.line,
  });
  const savings = describeBookSavings(bookOdds, {
    book: selectedBookOdds?.book ?? pick.book,
    odds: selectedBookOdds?.odds ?? pick.odds,
    line: selectedBookOdds?.line ?? pick.line,
  });
  const topBooks = bookOdds.slice(0, 3);
  const showOddsLine = hasAlternateBookLines(bookOdds);
  const showBookOdds = Boolean((selectedBookOdds?.book ?? pick.book) && (selectedBookOdds?.book ?? pick.book) !== "Model Line");
  const trendHref = getPlayerTrendHrefFromPick(pick);
  const cardTone = isExpanded ? "border-accent-blue/40 ring-1 ring-accent-blue/20" : "border-dark-border";

  return (
    <div className={`tap-card rounded-2xl border bg-dark-surface p-4 space-y-3 transition-all ${cardTone}`}>
      <div className="flex items-start gap-3">
        <div
          onClick={onToggle}
          className="flex-1 min-w-0 cursor-pointer rounded-xl text-left transition-colors hover:bg-dark-bg/20"
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggle();
            }
          }}
        >
          <div className="flex items-center gap-3">
            {pick.type === "player" ? (
              <PlayerAvatar name={pick.playerName || pick.team} team={pick.team} league={pick.league} playerId={pick.playerId} size={32} teamColor={pick.teamColor} />
            ) : (
              <TeamLogo team={pick.team} size={32} color={pick.teamColor} sport={pick.league ?? undefined} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-white font-semibold text-sm truncate">{pick.type === "player" ? pick.playerName : pick.team}</p>
                {pick.league && <span className="text-[9px] text-gray-600 uppercase shrink-0">{pick.league}</span>}
              </div>
              <p className="text-gray-500 text-xs">{pick.isAway ? "@" : "vs"} {pick.opponent}</p>
            </div>
          </div>

          <p className="mt-3 text-accent-blue font-medium text-sm">{pick.pickLabel}</p>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] bg-accent-green/10 text-accent-green rounded-full px-2 py-0.5 font-medium">{displayHitRate(pick.hitRate)} hit</span>
            <span className="text-[10px] bg-accent-blue/10 text-accent-blue rounded-full px-2 py-0.5 font-medium">{displayEdge(pick.edge)} edge</span>
            {typeof pick.odds === "number" && (
              <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${showBookOdds ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-dark-bg/70 text-gray-300"}`}>
                {showBookOdds ? `${selectedBookOdds?.book ?? pick.book} ` : ""}{formatAmericanOdds(selectedBookOdds?.odds ?? pick.odds)}
              </span>
            )}
            <span className="ml-auto text-[10px] text-gray-500 font-medium">1u</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-gray-600 text-[10px]">Tap to see reasoning ↓</p>
            {trendHref && (
              <Link href={trendHref} onClick={(event) => event.stopPropagation()} className="text-[10px] font-semibold text-accent-blue">
                Player trend →
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <ResultPill result={pick.result} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAddPickModal(createDraftFromAIPick(pick))}
              className="tap-button inline-flex h-10 w-10 items-center justify-center rounded-xl border border-dark-border bg-dark-bg/70 text-sm font-semibold text-accent-blue"
              aria-label={`Add ${pick.pickLabel} to My Picks`}
            >
              +
            </button>
            <button onClick={onToggle} className="tap-button inline-flex min-h-[44px] items-center gap-1 rounded-full border border-dark-border bg-dark-bg/70 px-3 text-[11px] font-semibold text-gray-300">
              AI
              <ChevronDown size={12} className={`text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-dark-border/50 space-y-3">
          {pick.reasoning && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-blue">Why this pick</p>
              <p className="text-gray-300 text-xs leading-relaxed">{pick.reasoning}</p>
            </div>
          )}

          <div className="rounded-xl border border-dark-border/40 bg-dark-bg/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="meta-label text-accent-blue">Best Price</p>
                {selectedBookOdds ? (
                  <p className="mt-1 text-xs text-gray-300">{selectedBookOdds.book} {formatAmericanOdds(selectedBookOdds.odds)}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">No live book pricing available</p>
                )}
              </div>
              {selectedBookOdds && (
                <BookBadge book={selectedBookOdds.book} odds={selectedBookOdds.odds} line={selectedBookOdds.line} highlight showLine={showOddsLine} />
              )}
            </div>

            {topBooks.length > 0 && (
              <div className="mt-3 overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex w-max gap-2">
                  {topBooks.map((offer) => {
                    const isBest = selectedBookOdds
                      ? offer.book === selectedBookOdds.book && offer.odds === selectedBookOdds.odds && offer.line === selectedBookOdds.line
                      : false;

                    return <BookBadge key={`${offer.book}-${offer.line}-${offer.odds}`} book={offer.book} odds={offer.odds} line={offer.line} highlight={isBest} showLine={showOddsLine} />;
                  })}
                </div>
              </div>
            )}

            {savings && (
              <p className="mt-2 text-[11px] text-emerald-300">{savings.best.book} saves you {savings.centsPerDollar}c per dollar vs {savings.comparison.book}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PicksPage() {
  const searchParams = useSearchParams();
  const [league, setLeague] = useLeague();
  const sportLeague = (league as string) === "Soccer" ? "All" : normalizeSportsLeague(league);
  const [viewMode, setViewMode] = useState<"ai" | "my">("ai");
  const [pastFilter, setPastFilter] = useState<PastFilter>("all");
  const [expandedPickId, setExpandedPickId] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [recordSport, setRecordSport] = useState(sportLeague === "All" ? "All" : sportLeague);
  const [golfDashboard, setGolfDashboard] = useState<GolfDashboardData | null>(null);
  const [learningResults, setLearningResults] = useState<LearningResultsPayload | null>(null);
  const [learningResultsLoading, setLearningResultsLoading] = useState(false);

  const { todayPicks: nhlToday, allPicks: nhlAll, loadingPicks: nhlLoading, picksError: nhlPicksError, stalePickCount: nhlStalePickCount, clearStalePicks: clearNHLStalePicks } = usePicks();
  const { todayPicks: nbaToday, allPicks: nbaAll, loadingPicks: nbaLoading, picksError: nbaPicksError, stalePickCount: nbaStalePickCount, clearStalePicks: clearNBAStalePicks } = useNBAPicks();
  const { todayPicks: mlbToday, allPicks: mlbAll, loadingPicks: mlbLoading, picksError: mlbPicksError, stalePickCount: mlbStalePickCount, clearStalePicks: clearMLBStalePicks } = useMLBPicks();
  const { todayPicks: golfToday, allPicks: golfAll, loadingPicks: golfLoading, picksError: golfPicksError, stalePickCount: golfStalePickCount, clearStalePicks: clearGolfStalePicks } = useGolfPicks();
  const { picks: historyPicks = [] } = usePickHistory();

  useEffect(() => {
    if (sportLeague !== "PGA") return undefined;
    let cancelled = false;

    fetch("/api/golf/dashboard")
      .then((response) => response.ok ? response.json() : null)
      .then((payload: GolfDashboardData | null) => {
        if (!cancelled) setGolfDashboard(payload);
      })
      .catch(() => {
        if (!cancelled) setGolfDashboard(null);
      });

    return () => {
      cancelled = true;
    };
  }, [sportLeague]);

  useEffect(() => {
    if (sportLeague === "PGA" || sportLeague === "NFL" || sportLeague === "EPL" || sportLeague === "Serie A") {
      setLearningResults(null);
      setLearningResultsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const resultLeague = sportLeague === "All" ? "ALL" : sportLeague;
    setLearningResultsLoading(true);

    fetch(`/api/goose-learning/results?league=${encodeURIComponent(resultLeague)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload: LearningResultsPayload | null) => {
        if (!cancelled) setLearningResults(payload?.ok ? payload : null);
      })
      .catch(() => {
        if (!cancelled) setLearningResults(null);
      })
      .finally(() => {
        if (!cancelled) setLearningResultsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sportLeague]);

  const todayKey = todayKeyForLeague(sportLeague);
  const activeToday = sportLeague === "NBA"
    ? nbaToday
    : sportLeague === "MLB"
      ? mlbToday
      : sportLeague === "PGA"
        ? golfToday
        : sportLeague === "All"
          ? [...nhlToday, ...nbaToday, ...mlbToday]
          : nhlToday;

  const activeAll: Record<string, AIPick[]> = {};
  const mergeStore = (store: Record<string, AIPick[]>) => {
    for (const [date, picks] of Object.entries(store)) {
      if (!activeAll[date]) activeAll[date] = [];
      activeAll[date].push(...picks);
    }
  };

  if (sportLeague === "NHL" || sportLeague === "All") mergeStore(nhlAll);
  if (sportLeague === "NBA" || sportLeague === "All") mergeStore(nbaAll);
  if (sportLeague === "MLB" || sportLeague === "All") mergeStore(mlbAll);
  if (sportLeague === "PGA") mergeStore(golfAll);

  const activeStalePickCount = sportLeague === "NBA"
    ? nbaStalePickCount
    : sportLeague === "MLB"
      ? mlbStalePickCount
      : sportLeague === "PGA"
        ? golfStalePickCount
        : sportLeague === "All"
          ? nhlStalePickCount + nbaStalePickCount + mlbStalePickCount
          : nhlStalePickCount;

  const loading = sportLeague === "NBA"
    ? nbaLoading
    : sportLeague === "MLB"
      ? mlbLoading
      : sportLeague === "PGA"
        ? golfLoading
        : sportLeague === "All"
          ? (nhlLoading || nbaLoading || mlbLoading)
          : nhlLoading;

  const picksError = sportLeague === "NBA"
    ? nbaPicksError
    : sportLeague === "MLB"
      ? mlbPicksError
      : sportLeague === "PGA"
        ? golfPicksError
        : sportLeague === "All"
          ? [nhlPicksError, nbaPicksError, mlbPicksError].filter(Boolean).join(" · ") || null
          : nhlPicksError;

  const golfTournament = resolveGolfTournament(golfDashboard);
  const golfBannerCopy = buildGolfBannerCopy(golfDashboard, golfTournament);
  const showWelcome = searchParams.get("welcome") === "1";

  const nhlFlat = Object.values(nhlAll).flat();
  const nbaFlat = Object.values(nbaAll).flat();
  const mlbFlat = Object.values(mlbAll).flat();
  const golfFlat = Object.values(golfAll).flat();

  const filteredHistoryRecords = useMemo(() => (
    sportLeague === "All"
      ? historyPicks.filter((pick) => pick.league !== "PGA")
      : historyPicks.filter((pick) => pick.league === sportLeague)
  ), [historyPicks, sportLeague]);

  const remoteHistoryItems = useMemo(() => filteredHistoryRecords.map(mapRecordToHistoryItem), [filteredHistoryRecords]);
  const fallbackHistoryItems = useMemo(() => Object.entries(activeAll).flatMap(([date, picks]) => picks.map((pick) => mapLocalPickToHistoryItem(date, pick))), [activeAll]);
  const historyItems = remoteHistoryItems.length > 0 ? remoteHistoryItems : fallbackHistoryItems;

  const activeRecord = computeHistoryRecord(historyItems);
  const nhlRec = remoteHistoryItems.length > 0 ? computeHistoryRecord(historyPicks.filter((pick) => pick.league === "NHL").map(mapRecordToHistoryItem)) : computePickRecord(nhlFlat);
  const nbaRec = remoteHistoryItems.length > 0 ? computeHistoryRecord(historyPicks.filter((pick) => pick.league === "NBA").map(mapRecordToHistoryItem)) : computePickRecord(nbaFlat);
  const mlbRec = remoteHistoryItems.length > 0 ? computeHistoryRecord(historyPicks.filter((pick) => pick.league === "MLB").map(mapRecordToHistoryItem)) : computePickRecord(mlbFlat);
  const golfRec = remoteHistoryItems.length > 0 ? computeHistoryRecord(historyPicks.filter((pick) => pick.league === "PGA").map(mapRecordToHistoryItem)) : computePickRecord(golfFlat);

  const recordMap: Record<string, typeof activeRecord> = { All: activeRecord, NHL: nhlRec, NBA: nbaRec, MLB: mlbRec, PGA: golfRec };
  const displayRecord = recordMap[recordSport] || activeRecord;
  const currentSeasonRecord = sportLeague === "All" ? displayRecord : activeRecord;
  const currentSeasonWinStats = computePickWinRateStats(currentSeasonRecord);

  const pastHistoryItems = useMemo(() => historyItems.filter((item) => item.date !== todayKey), [historyItems, todayKey]);
  const pastDates = useMemo(() => Array.from(new Set(pastHistoryItems.map((item) => item.date))).sort((a, b) => b.localeCompare(a)), [pastHistoryItems]);
  const historyByDate = useMemo(() => pastHistoryItems.reduce<Record<string, HistoryItem[]>>((groups, item) => {
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
    return groups;
  }, {}), [pastHistoryItems]);
  const runningUnitsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    let running = 0;
    for (const date of [...pastDates].sort()) {
      running += computeHistoryRecord(historyByDate[date] || []).profitUnits;
      totals[date] = running;
    }
    return totals;
  }, [historyByDate, pastDates]);

  function filterHistoryPicks(picks: HistoryItem[]) {
    if (pastFilter === "all") return picks;
    return picks.filter((p) => p.result === pastFilter);
  }

  function handleClearStalePicks() {
    if (sportLeague === "NBA") return clearNBAStalePicks();
    if (sportLeague === "MLB") return clearMLBStalePicks();
    if (sportLeague === "PGA") return clearGolfStalePicks();
    if (sportLeague === "All") {
      clearNHLStalePicks();
      clearNBAStalePicks();
      clearMLBStalePicks();
      return;
    }
    clearNHLStalePicks();
  }

  if (sportLeague === "NFL") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Picks" subtitle="Today’s strongest plays, with reasoning and record tracking." right={<LeagueDropdown active={sportLeague} onChange={setLeague} />} />
        <EmptyStateCard eyebrow="NFL" title="NFL picks launch Week 1" body="The offseason build keeps NFL visible through schedule, standings, and odds. Pick generation turns on when weekly props and sides are posting consistently." ctaLabel="Open Schedule" ctaHref="/schedule" />
      </div>
    );
  }

  if (sportLeague === "EPL" || sportLeague === "Serie A") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Picks" subtitle="Today’s strongest plays, with reasoning and record tracking." right={<LeagueDropdown active={sportLeague} onChange={setLeague} />} />
        <EmptyStateCard eyebrow={sportLeague} title="Soccer picks are not live yet" body="This release includes schedule, league tables, 1X2 pricing, and team trends for soccer. Pick cards are intentionally disabled until the team-level models are finalized." ctaLabel="Open Trends" ctaHref="/trends" />
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24 lg:px-0">
      <PageHeader
        title="Picks"
        subtitle={viewMode === "ai" ? "Today's strongest plays, with reasoning and record tracking." : "Track your personal picks, units, and settled history."}
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      />

      <div className="px-4 pt-4 lg:px-0">
        {showWelcome && (
          <div className="mb-4 rounded-3xl border border-accent-blue/30 bg-[radial-gradient(circle_at_top_left,rgba(74,158,255,0.18),transparent_34%),linear-gradient(180deg,rgba(21,24,33,0.95),rgba(16,19,27,0.95))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-blue">Welcome to Goosalytics</p>
            <h2 className="mt-2 text-xl font-bold text-white">Start here: today&apos;s best AI picks.</h2>
            <p className="mt-1 text-sm text-gray-400">Open a card for the reasoning, compare the odds, then use My Picks to track your own card and units.</p>
          </div>
        )}
        <div className="mb-4 inline-flex rounded-2xl border border-dark-border bg-dark-surface/70 p-1">
          <button type="button" onClick={() => setViewMode("ai")} className={`tap-button rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${viewMode === "ai" ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30" : "text-gray-400"}`}>
            AI Picks
          </button>
          <button type="button" onClick={() => setViewMode("my")} className={`tap-button rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${viewMode === "my" ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30" : "text-gray-400"}`}>
            My Picks
          </button>
        </div>
      </div>

      {viewMode === "ai" ? (
        <>
          <div className="mb-6 grid gap-4 px-4 pt-0 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:px-0">
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 transition-colors hover:border-accent-blue/30 lg:sticky lg:top-24">
              {sportLeague === "All" && (
                <div className="mb-3 flex items-center gap-1.5">
                  {Object.entries(SPORT_ICONS).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRecordSport(key)}
                      className={`tap-button flex items-center justify-center min-w-[40px] h-9 px-2 rounded-xl text-[11px] font-semibold transition-all ${recordSport === key ? "bg-accent-blue/20 border border-accent-blue/50 text-accent-blue shadow-lg shadow-accent-blue/10" : "bg-dark-bg/40 border border-dark-border/40 text-gray-500 hover:border-gray-500 hover:text-white"}`}
                      aria-label={`Show ${key} record`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <Link href="/picks/history" className="tap-button block rounded-xl">
                <div className="mb-3 flex items-center justify-between">
                  <p className="section-heading">{sportLeague === "All" ? (recordSport === "All" ? "Combined" : recordSport) : sportLeague} Season Record</p>
                  <span className="text-[10px] font-medium text-accent-blue">View History →</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center"><p className="text-accent-green font-bold text-lg">{currentSeasonRecord.wins}</p><p className="text-gray-500 text-[10px] uppercase">W</p></div>
                  <div className="text-center"><p className="text-accent-red font-bold text-lg">{currentSeasonRecord.losses}</p><p className="text-gray-500 text-[10px] uppercase">L</p></div>
                  <div className="text-center"><p className="text-accent-yellow font-bold text-lg">{currentSeasonRecord.pushes}</p><p className="text-gray-500 text-[10px] uppercase">Push</p></div>
                  <div className="text-center"><p className="text-gray-400 font-bold text-lg">{currentSeasonRecord.pending}</p><p className="text-gray-500 text-[10px] uppercase">Pending</p></div>
                  <div className="ml-auto flex items-center gap-4">
                    <div className="text-right"><p className="font-bold text-lg text-white">{Math.round(currentSeasonWinStats.winPct)}%</p><p className="text-gray-500 text-[10px] uppercase">Win % · {currentSeasonWinStats.settled}</p></div>
                    <div className="text-right"><p className={`font-bold text-lg ${currentSeasonRecord.profitUnits > 0 ? "text-accent-green" : currentSeasonRecord.profitUnits < 0 ? "text-accent-red" : "text-gray-400"}`}>{currentSeasonRecord.profitUnits > 0 ? "+" : ""}{(currentSeasonRecord.profitUnits || 0).toFixed(2)}u</p><p className="text-gray-500 text-[10px] uppercase">Net Units</p></div>
                  </div>
                </div>
              </Link>

              {activeStalePickCount > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-dark-border/40 pt-3">
                  <p className="text-[11px] text-amber-400">{activeStalePickCount} legacy pending pick{activeStalePickCount === 1 ? "" : "s"} missing a valid game ID.</p>
                  <button onClick={handleClearStalePicks} className="tap-button rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase text-amber-300">Clear stale picks</button>
                </div>
              )}

              {sportLeague !== "PGA" && (
                <LearningModelResultsBar
                  results={learningResults}
                  loading={learningResultsLoading}
                  officialWinPct={currentSeasonWinStats.winPct}
                />
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="section-heading">Today&apos;s AI Picks</p>
                <span className="text-[10px] text-gray-500">{sportLeague === "PGA" ? "12 tournament picks · 1u each" : "3 picks · 1u each"}</span>
              </div>

              {loading ? (
                <div className="space-y-3"><PickCardSkeleton /><PickCardSkeleton /><PickCardSkeleton /></div>
              ) : picksError && activeToday.length === 0 ? (
                <EmptyStateCard eyebrow="Picks unavailable" title="AI picks feed did not load" body={picksError} />
              ) : activeToday.length === 0 ? (
                <EmptyStateCard eyebrow="AI Picks" title={`No ${sportLeague === "All" ? "" : `${sportLeague} `}picks today`} body={sportLeague === "PGA" ? golfBannerCopy : "Check back when games are scheduled to see today's top AI picks."} />
              ) : (
                <div className="space-y-3">
                  {activeToday.map((pick, index) => (
                    <div key={pick.id} className="stagger-in" style={getStaggerStyle(index)}>
                      <PickCard pick={pick} isExpanded={expandedPickId === pick.id} onToggle={() => setExpandedPickId(expandedPickId === pick.id ? null : pick.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sportLeague === "PGA" && (
            <div className="mt-6 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300"><Flag size={12} className="shrink-0" />{golfTournament?.name ?? "PGA Tour"}</p>
                    {golfTournament ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getGolfBadgeTone(golfTournament)}`}>{getGolfTournamentBadgeLabel(golfTournament, golfDashboard?.leaderboard ?? undefined)}</span> : null}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-white">{golfTournament?.dates ?? "Current tournament dates pending"}</p>
                </div>
                <Link href={golfTournament ? `/golf/tournament/${golfTournament.id}` : "/golf"} className="tap-button inline-flex items-center gap-1.5 rounded-2xl border border-emerald-500/50 bg-emerald-600/90 px-4 py-2 text-sm font-semibold text-white transition-all shadow-lg hover:bg-emerald-500/90 hover:shadow-emerald-500/25">
                  <span>{golfTournament ? "View Tournament" : "View Golf"}</span>
                  <span className="h-4 w-4">→</span>
                </Link>
              </div>
              <p className="mt-2 text-xs text-emerald-200/80">{golfBannerCopy}</p>
            </div>
          )}

          {pastHistoryItems.length > 0 && (
            <>
              <div className="mb-3 mt-4 flex items-center justify-between">
                <p className="section-heading">Pick History</p>
                <div className="flex gap-1">
                  {(["all", "win", "loss", "push"] as PastFilter[]).map((f) => (
                    <button key={f} onClick={() => setPastFilter(f)} className={`tap-button rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase transition-colors ${pastFilter === f ? f === "win" ? "bg-accent-green/20 border-accent-green text-accent-green" : f === "loss" ? "bg-accent-red/20 border-accent-red text-accent-red" : f === "push" ? "bg-accent-yellow/20 border-accent-yellow text-accent-yellow" : "bg-dark-surface border-accent-blue text-accent-blue" : "border-dark-border text-gray-500"}`}>{f === "all" ? "All" : f === "win" ? "Won" : f === "loss" ? "Lost" : "Push"}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 px-4 lg:px-0">
                {pastDates.map((date, index) => {
                  const dayPicks = historyByDate[date] || [];
                  const filtered = filterHistoryPicks(dayPicks);
                  if (!filtered.length) return null;
                  const dailyRecord = computeHistoryRecord(dayPicks);
                  const dailyWinPct = (dailyRecord.wins + dailyRecord.losses) > 0 ? Math.round((dailyRecord.wins / (dailyRecord.wins + dailyRecord.losses)) * 100) : null;
                  const dailyUnits = dailyRecord.profitUnits;
                  const runningUnits = runningUnitsByDate[date] ?? dailyUnits;

                  return (
                    <div key={date} className="stagger-in overflow-hidden rounded-2xl border border-dark-border/70 bg-dark-surface/40" style={getStaggerStyle(index)}>
                      <button type="button" onClick={() => setExpandedDate(expandedDate === date ? null : date)} className="tap-button flex w-full items-center justify-between bg-dark-bg/40 px-4 py-2.5">
                        <div className="text-left">
                          <p className="text-xs font-semibold text-gray-300">{formatDate(date)}</p>
                          <p className="mt-0.5 text-[10px] text-gray-500">Running total {runningUnits > 0 ? "+" : ""}{runningUnits.toFixed(2)}u</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-bold uppercase">
                          <span className="text-emerald-400">{dailyRecord.wins}W</span>
                          <span className="text-red-400">{dailyRecord.losses}L</span>
                          {dailyRecord.pushes > 0 && <span className="text-yellow-400">{dailyRecord.pushes}P</span>}
                          {dailyRecord.pending > 0 && <span className="inline-flex items-center gap-0.5 text-gray-500">{dailyRecord.pending}<Clock size={10} /></span>}
                          <span className={dailyUnits >= 0 ? "text-emerald-400" : "text-red-400"}>{dailyUnits >= 0 ? "+" : ""}{dailyUnits.toFixed(2)}u</span>
                          {dailyWinPct !== null && <span className={dailyWinPct >= 50 ? "text-emerald-400" : "text-red-400"}>{dailyWinPct}%</span>}
                          <ChevronDown size={12} className={`text-gray-500 transition-transform ${expandedDate === date ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {expandedDate === date && (
                        <div className="divide-y divide-dark-border/30 border-t border-dark-border/40">
                          {filtered.map((pick) => (
                            <div key={pick.id} className={`flex items-center gap-3 px-4 py-3 ${pick.result === "win" ? "border-l-2 border-l-emerald-500" : pick.result === "loss" ? "border-l-2 border-l-red-500" : pick.result === "push" ? "border-l-2 border-l-yellow-500" : "border-l-2 border-l-gray-600"}`}>
                              <TeamLogo team={pick.team} size={24} color={pick.teamColor} sport={pick.league ?? undefined} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-xs font-medium text-white">{pick.pickLabel}</p>
                                  {pick.league && <span className="shrink-0 text-[9px] uppercase text-gray-600">{pick.league}</span>}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                  <p className="text-[10px] text-gray-500">{pick.team} vs {pick.opponent}</p>
                                  <span className="text-[9px] text-gray-600">{displayHitRate(pick.hitRate)} hit · {displayEdge(pick.edge)} edge</span>
                                  {typeof pick.odds === "number" && Number.isFinite(pick.odds) && pick.odds !== 0 && <span className="rounded bg-dark-bg/60 px-1.5 py-0.5 text-[9px] text-gray-500">{formatAmericanOdds(pick.odds)}</span>}
                                  <span className="rounded bg-dark-bg/60 px-1.5 py-0.5 text-[9px] text-gray-500">{pick.units}u</span>
                                </div>
                              </div>
                              {pick.result === "win" ? <span className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">W ✓</span> : pick.result === "loss" ? <span className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">L ✗</span> : pick.result === "push" ? <span className="rounded-lg bg-yellow-500/10 px-2.5 py-1 text-xs font-bold text-yellow-400">P</span> : <span className="inline-flex items-center gap-0.5 rounded-lg bg-gray-500/10 px-2.5 py-1 text-xs font-bold text-gray-500"><Clock size={11} /></span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="space-y-4 px-4 py-4 lg:px-0">
          <section className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="section-heading">My Picks</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Backend-backed personal picks are next</h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-400">I pulled the broken half-merged version out of this page so the picks surface stays legit while we wire the real locked-picks flow.</p>
              </div>
              <span className="inline-flex rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-blue">In Progress</span>
            </div>
          </section>

          <EmptyStateCard
            eyebrow="My Picks"
            title="Locked personal picks are being wired properly"
            body="Priority is integrity: saved picks must lock odds, line, book, and snapshot in the database before grading. AI Picks stays live while My Picks is rebuilt on top of the new backend foundation."
          />
        </div>
      )}
    </main>
  );
}
