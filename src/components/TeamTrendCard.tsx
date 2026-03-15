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
    <div className="mx-3 my-3 h-full overflow-hidden rounded-[26px] border border-dark-border bg-[linear-gradient(180deg,rgba(21,24,33,0.96)_0%,rgba(12,16,24,0.98)_100%)] shadow-[0_14px_40px_rgba(0,0,0,0.22)] lg:mx-0 lg:my-0">
      <div className="h-1 w-full" style={{ background: trend.teamColor }} />

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          <TeamLogo team={trend.team} color={trend.teamColor} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white">{trend.team}</div>
                <div className="mt-1 text-[12px] text-gray-500">
                  {trend.team} {trend.isAway ? "@" : "vs"} {trend.opponent}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2.5 py-1 text-[11px] font-semibold text-gray-200">
                    {trend.betType}
                  </span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
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
                    <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2.5 py-1 text-[11px] text-gray-400">
                      {trend.book}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TrendIndicatorDots indicators={trend.indicators} size="sm" />
                <span className={`text-[10px] text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
              </div>
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

          <TrendSplitBars accentColor={trend.teamColor} splits={trend.splits} />
        </div>
      )}
    </div>
  );
}
