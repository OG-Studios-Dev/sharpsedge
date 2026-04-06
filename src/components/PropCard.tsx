"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayerProp } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import PlayerAvatar from "./PlayerAvatar";
import LeagueLogo from "./LeagueLogo";
import SavePickButton from "./SavePickButton";
import { formatOdds } from "@/lib/edge-engine";
import { getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import { getTeamHref } from "@/lib/drill-down";
import TrendIndicators from "./TrendIndicators";
import BookBadge from "./BookBadge";
import { describeBookSavings, hasAlternateBookLines, resolveSelectedBookOdds, sortBookOddsForDisplay } from "@/lib/book-odds";
import { useAppChrome } from "@/components/AppChromeProvider";
import { createDraftFromProp } from "@/lib/my-picks";

function EdgeBadge({ edgePct }: { edgePct: number | null | undefined }) {
  if (!edgePct) return null;
  if (edgePct > 0.10)
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold">STRONG</span>;
  if (edgePct > 0.05)
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-semibold">EDGE</span>;
  return null;
}

function displayHitRate(val?: number | null): string {
  if (val == null) return "-";
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct.toFixed(0)}%`;
}

export default function PropCard({ prop, compact = false }: { prop: PlayerProp; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { openAddPickModal } = useAppChrome();
  const hitRate = displayHitRate(prop.hitRate ?? prop.fairProbability);
  const bookOdds = sortBookOddsForDisplay(prop.bookOdds || [], prop.line);
  const selectedBookOdds = resolveSelectedBookOdds(bookOdds, {
    book: prop.book,
    odds: prop.odds,
    line: prop.line,
  });
  const savings = describeBookSavings(bookOdds, {
    book: selectedBookOdds?.book ?? prop.book,
    odds: selectedBookOdds?.odds ?? prop.odds,
    line: selectedBookOdds?.line ?? prop.line,
  });
  const showOddsLine = hasAlternateBookLines(bookOdds);
  const compactEdge = typeof prop.edgePct === "number" ? prop.edgePct : prop.edge;

  if (compact) {
    return (
      <Link
        href={getPlayerTrendHrefFromProp(prop)}
        className="block rounded-2xl border border-dark-border bg-dark-surface/70 p-4 transition hover:border-white/15 hover:bg-dark-surface"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PlayerAvatar name={prop.playerName} team={prop.team} league={prop.league} playerId={prop.playerId} size={24} teamColor={prop.teamColor || "#4a9eff"} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{prop.playerName}</p>
              <p className="mt-1 text-xs text-gray-500">
                <Link href={getTeamHref(prop.team, prop.league)} onClick={(e) => e.stopPropagation()} className="hover:text-gray-300 transition-colors">{prop.team}</Link>
                {prop.isAway ? " @ " : " vs "}
                <Link href={getTeamHref(prop.opponent, prop.league)} onClick={(e) => e.stopPropagation()} className="hover:text-gray-300 transition-colors">{prop.opponent}</Link>
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold text-white">{formatOdds(prop.odds)}</p>
            <p className="mt-1 text-[10px] text-gray-500">{prop.book || "Model"}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <span className="rounded-full border border-dark-border/70 bg-dark-bg/60 px-2.5 py-1">
            {prop.overUnder} {prop.line} {prop.propType}
          </span>
          <span className="rounded-full border border-dark-border/70 bg-dark-bg/60 px-2.5 py-1">
            Hit {hitRate}
          </span>
          <span className={`rounded-full border px-2.5 py-1 ${
            typeof compactEdge === "number" && compactEdge > 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-dark-border/70 bg-dark-bg/60 text-gray-300"
          }`}>
            Edge {compactEdge != null ? `${compactEdge > 0 ? "+" : ""}${(compactEdge * 100).toFixed(1)}%` : "NA"}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div className="tap-card h-full overflow-hidden rounded-2xl border border-dark-border bg-dark-surface/70">
      {/* Compact view — always visible */}
      <div
        className="cursor-pointer p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <PlayerAvatar name={prop.playerName} team={prop.team} league={prop.league} playerId={prop.playerId} size={28} teamColor={prop.teamColor} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="card-title truncate">{prop.playerName}</span>
              <span className="inline-flex items-center gap-1 text-[9px] text-gray-500 uppercase"><LeagueLogo league={prop.league} size={12} />{prop.league}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-gray-400 text-xs">
                {prop.overUnder} {prop.line} {prop.propType}
              </span>
              <span className="text-gray-500 text-xs">{formatOdds(prop.odds)}</span>
              {prop.book && prop.book !== "Model Line" && (
                <span className="text-[9px] text-gray-600 bg-dark-bg/60 rounded px-1 py-0.5">{prop.book}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openAddPickModal(createDraftFromProp(prop));
              }}
              className="tap-button inline-flex h-9 w-9 items-center justify-center rounded-xl border border-dark-border bg-dark-bg/70 text-sm font-semibold text-accent-blue"
              aria-label={`Add ${prop.playerName} to My Picks`}
            >
              +
            </button>
            <EdgeBadge edgePct={prop.edgePct} />
            <span className={`text-sm font-bold ${
              (prop.hitRate ?? 0) >= 70 ? "text-emerald-400" : (prop.hitRate ?? 0) >= 50 ? "text-white" : "text-gray-400"
            }`}>
              {hitRate}
            </span>
            <span className={`text-[10px] text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
          </div>
        </div>

        {/* Mini info row */}
        <div className="flex items-center gap-2 mt-1.5 ml-10">
          <span className="meta-label normal-case tracking-normal">
            <Link href={getTeamHref(prop.team, prop.league)} onClick={(e) => e.stopPropagation()} className="hover:text-gray-300 transition-colors">{prop.team}</Link>
            {prop.isAway ? " @ " : " vs "}
            <Link href={getTeamHref(prop.opponent, prop.league)} onClick={(e) => e.stopPropagation()} className="hover:text-gray-300 transition-colors">{prop.opponent}</Link>
          </span>
          {prop.recentGames && prop.recentGames.length > 0 && (
            <div className="flex gap-0.5">
              {prop.recentGames.slice(0, 5).map((v, i) => (
                <div key={i} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-semibold ${
                  v > prop.line ? "bg-emerald-500/20 text-emerald-400" : "bg-dark-bg text-gray-600"
                }`}>
                  {v}
                </div>
              ))}
            </div>
          )}
          <TrendIndicators indicators={prop.indicators} />
        </div>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="space-y-3 border-t border-dark-border/40 px-4 pb-4 pt-1">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-dark-bg/60 px-2 py-2 text-center">
              <div className="meta-label">L5 Avg</div>
              <div className="mt-0.5 text-xs font-bold text-white">{prop.rollingAverages?.last5?.toFixed(1) ?? "-"}</div>
            </div>
            <div className="rounded-xl bg-dark-bg/60 px-2 py-2 text-center">
              <div className="meta-label">L10 Avg</div>
              <div className="mt-0.5 text-xs font-bold text-white">{prop.rollingAverages?.last10?.toFixed(1) ?? "-"}</div>
            </div>
            <div className="rounded-xl bg-dark-bg/60 px-2 py-2 text-center">
              <div className="meta-label">Hit Rate</div>
              <div className="mt-0.5 text-xs font-bold text-emerald-400">{hitRate}</div>
            </div>
          </div>

          {/* Splits */}
          <div className="rounded-xl border border-dark-border/50 bg-dark-bg/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Best Lines</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {bookOdds.length > 0 ? "Available books for this prop" : "Live book comparison unavailable"}
                </p>
              </div>
              {selectedBookOdds && (
                <BookBadge
                  book={selectedBookOdds.book}
                  odds={selectedBookOdds.odds}
                  line={selectedBookOdds.line}
                  highlight
                  showLine={showOddsLine}
                />
              )}
            </div>

            {bookOdds.length > 0 && (
              <>
                <div className="mt-3 overflow-x-auto pb-1 scrollbar-hide">
                  <div className="flex w-max gap-2">
                    {bookOdds.map((offer) => {
                      const isBest = selectedBookOdds
                        ? offer.book === selectedBookOdds.book && offer.odds === selectedBookOdds.odds && offer.line === selectedBookOdds.line
                        : false;

                      return (
                        <BookBadge
                          key={`${offer.book}-${offer.line}-${offer.odds}`}
                          book={offer.book}
                          odds={offer.odds}
                          line={offer.line}
                          highlight={isBest}
                          showLine={showOddsLine}
                        />
                      );
                    })}
                  </div>
                </div>

                {savings && (
                  <p className="mt-2 text-[11px] text-emerald-300">
                    {savings.best.book} saves you {savings.centsPerDollar}c per dollar vs {savings.comparison.book}
                  </p>
                )}
              </>
            )}
          </div>

          {prop.splits.length > 0 && (
            <div className="space-y-0.5">
              {prop.splits.map((split, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-[11px] text-gray-400 truncate">{split.label}</span>
                  <span className={`text-[11px] font-semibold shrink-0 ${
                    split.total === 0 ? "text-gray-500" : split.hitRate >= 70 ? "text-emerald-400" : "text-white"
                  }`}>
                    {split.total > 0 ? `${Math.round(split.hitRate)}%` : "Soon"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Reasoning */}
          {prop.reasoning && (
            <p className="text-[11px] leading-relaxed text-gray-400">{prop.reasoning}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Link href={getPlayerTrendHrefFromProp(prop)} className="tap-button text-[11px] text-accent-blue font-medium">
              Full analysis →
            </Link>
            <SavePickButton prop={prop} />
          </div>
        </div>
      )}
    </div>
  );
}
