"use client";

import { useState } from "react";
import { TeamTrend } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import { formatOdds } from "@/lib/edge-engine";
import TrendIndicatorDots from "./TrendIndicatorDots";
import TrendSplitBars from "./TrendSplitBars";
import BookBadge from "./BookBadge";
import { describeBookSavings, hasAlternateBookLines, resolveSelectedBookOdds, sortBookOddsForDisplay } from "@/lib/book-odds";

export default function TeamTrendCard({ trend }: { trend: TeamTrend }) {
  const [expanded, setExpanded] = useState(false);
  const bookOdds = sortBookOddsForDisplay(trend.bookOdds || []);
  const selectedBookOdds = resolveSelectedBookOdds(bookOdds, {
    book: trend.book,
    odds: trend.odds,
  });
  const savings = describeBookSavings(bookOdds, {
    book: selectedBookOdds?.book ?? trend.book,
    odds: selectedBookOdds?.odds ?? trend.odds,
    line: selectedBookOdds?.line,
  });
  const showOddsLine = hasAlternateBookLines(bookOdds);

  return (
    <div className="mx-3 my-3 overflow-hidden rounded-[24px] border border-dark-border/80 bg-dark-card shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_-15px_rgba(74,158,255,0.15)] group relative">
      <div className="absolute top-0 left-0 right-0 h-1 transition-opacity duration-300 opacity-80 group-hover:opacity-100" style={{ background: trend.teamColor }} />

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full text-left"
      >
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            <TeamLogo team={trend.team} color={trend.teamColor} size={36} />
            
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-heading font-bold text-text-platinum group-hover:text-white transition-colors">
                    {trend.team}
                  </div>
                  <div className="mt-0.5 text-[11px] font-sans text-text-platinum/50 font-semibold border border-dark-border/50 px-1.5 rounded inline-block bg-dark-bg/50">
                    {trend.team} {trend.isAway ? "@" : "vs"} {trend.opponent}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-accent-blue/10 border border-accent-blue/20 text-accent-blue px-2.5 py-0.5 font-mono text-[12px] font-bold shadow-[inset_0_0_10px_rgba(74,158,255,0.05)]">
                      {trend.betType}
                    </span>
                    <span className="rounded bg-dark-bg/50 border border-dark-border px-2 py-0.5 font-mono text-[11px] font-semibold text-text-platinum/70">
                      {trend.odds === -110 ? "Model" : formatOdds(trend.odds)}
                    </span>
                    {selectedBookOdds ? (
                      <BookBadge
                        book={selectedBookOdds.book}
                        odds={selectedBookOdds.odds}
                        line={selectedBookOdds.line}
                        highlight
                        showLine={showOddsLine}
                      />
                    ) : trend.book ? (
                      <span className="rounded px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-text-platinum/40">
                        {trend.book}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-2">
              <TrendIndicatorDots indicators={trend.indicators} />
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-dark-border/50 px-4 pb-4 pt-3 space-y-4">
          <div className="rounded-xl border border-dark-border/50 bg-dark-bg/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Best Lines</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {bookOdds.length > 0 ? "Available books for this team market" : "No live book comparison for this market"}
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

          <div className="mt-5 border-t border-dark-border/40 pt-4">
            <TrendSplitBars accentColor={trend.teamColor} splits={trend.splits} />
          </div>
        </div>
      )}
    </div>
  );
}
