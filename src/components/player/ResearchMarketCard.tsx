"use client";

import { BookOdds } from "@/lib/types";

type ResearchMarketCardProps = {
  oddsComparison?: BookOdds[];
  statLabel: string;
  direction: "Over" | "Under";
  line: number;
  opponent?: string;
  nextGameDisplay?: string | null;
};

function formatOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return "--";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatLine(line: number) {
  return Number.isFinite(line) ? line.toFixed(1) : "--";
}

export default function ResearchMarketCard({
  oddsComparison = [],
  statLabel,
  direction,
  line,
  opponent,
  nextGameDisplay,
}: ResearchMarketCardProps) {
  const best = oddsComparison[0] || null;
  const consensus = oddsComparison.length
    ? Math.round(oddsComparison.reduce((sum, book) => sum + (book.odds || 0), 0) / oddsComparison.length)
    : null;

  return (
    <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Research Snapshot</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{direction} {formatLine(line)} {statLabel}</h2>
          <p className="mt-1 text-sm text-gray-300">{nextGameDisplay || (opponent ? `Next matchup vs ${opponent}` : "Use this page to pressure test the current line.")}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">Best book</p>
          <p className="mt-1 text-base font-semibold text-emerald-50">{best?.book || "No market"}</p>
          <p className="text-sm text-emerald-100/80">{formatOdds(best?.odds)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-dark-bg/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Books found</p>
          <p className="mt-2 text-xl font-semibold text-white">{oddsComparison.length}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-dark-bg/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Consensus odds</p>
          <p className="mt-2 text-xl font-semibold text-white">{formatOdds(consensus)}</p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-dark-bg/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Target line</p>
          <p className="mt-2 text-xl font-semibold text-white">{formatLine(line)}</p>
        </div>
      </div>

      {oddsComparison.length ? (
        <div className="mt-4 space-y-2">
          {oddsComparison.slice(0, 5).map((book) => (
            <div key={`${book.book}-${book.line}-${book.odds}`} className="flex items-center justify-between rounded-2xl border border-white/8 bg-dark-bg/60 px-3 py-3 text-sm text-gray-200">
              <div>
                <p className="font-semibold text-white">{book.book}</p>
                <p className="text-xs text-gray-400">Line {formatLine(book.line)}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-white">{formatOdds(book.odds)}</p>
                <p className="text-xs text-gray-400">{Math.round((book.impliedProbability || 0) * 100)}% implied</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-dark-bg/40 px-3 py-4 text-sm text-gray-400">
          No current book prices were found for this market, but the hit-rate and matchup tools still work.
        </div>
      )}
    </section>
  );
}
