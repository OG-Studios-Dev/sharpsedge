"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import LeagueDropdown from "@/components/LeagueDropdown";
import EmptyStateCard from "@/components/EmptyStateCard";
import TeamLogo from "@/components/TeamLogo";
import PageHeader from "@/components/PageHeader";
import LockedFeature from "@/components/LockedFeature";
import { OddsGameSkeleton } from "@/components/LoadingSkeleton";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import type { GolfDashboardData } from "@/lib/types";
import type { AggregatedBookOdds, AggregatedOdds, AggregatedSport } from "@/lib/books/types";
import { getStaggerStyle } from "@/lib/stagger-style";
import type { MarketHistoryRail } from "@/lib/market-snapshot-history";

type Tab = "Best Lines" | "Movement" | "Sharp";

type AggregatedResponse = {
  generatedAt: string;
  sports: Record<AggregatedSport, AggregatedOdds[]>;
  games: AggregatedOdds[];
  meta: {
    ttlMinutes: number;
    sports: AggregatedSport[];
    sourceSummary?: {
      bookCount?: number;
      books?: string[];
    };
    freshness?: {
      staleSourceCount?: number;
      maxSourceAgeMinutes?: number | null;
    };
  };
};

type HistoryResponse = {
  gameId: string;
  history: MarketHistoryRail | null;
};

function formatOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatLine(line?: number | null) {
  if (typeof line !== "number" || !Number.isFinite(line)) return "—";
  return line > 0 ? `+${line}` : `${line}`;
}

function formatCommenceTime(value?: string | null) {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return parsed.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortBookName(book: string) {
  const map: Record<string, string> = {
    DraftKings: "DK",
    FanDuel: "FD",
    BetMGM: "MGM",
    Caesars: "CZR",
    PointsBet: "PB",
    Bovada: "BOV",
    Pinnacle: "PIN",
    Kambi: "KMB",
    BetRivers: "BR",
    Unibet: "UNI",
  };
  return map[book] || book.slice(0, 4).toUpperCase();
}

function isBestMoneyline(bookOdds: number | null, best: AggregatedOdds["bestHome"] | AggregatedOdds["bestAway"], book: string) {
  return typeof bookOdds === "number" && best?.odds === bookOdds && best.book === book;
}

function isBestSpread(
  odds: number | null,
  line: number | null,
  best: AggregatedOdds["bestHomeSpread"] | AggregatedOdds["bestAwaySpread"],
  book: string,
) {
  return typeof odds === "number" && typeof line === "number" && best?.odds === odds && best.line === line && best.book === book;
}

function isBestTotal(
  odds: number | null,
  line: number | null,
  best: AggregatedOdds["bestOver"] | AggregatedOdds["bestUnder"],
  book: string,
) {
  return typeof odds === "number" && typeof line === "number" && best?.odds === odds && best.line === line && best.book === book;
}

function Cell({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 text-xs ${active ? "text-emerald-300 font-semibold" : "text-gray-300"}`}>
      {children}
    </td>
  );
}

function BookGrid({ game }: { game: AggregatedOdds }) {
  const books = useMemo(() => {
    return [...game.books].sort((left, right) => {
      const leftBestCount = Number(isBestMoneyline(left.awayML, game.bestAway, left.book))
        + Number(isBestMoneyline(left.homeML, game.bestHome, left.book))
        + Number(isBestSpread(left.awaySpreadOdds, left.awaySpread, game.bestAwaySpread, left.book))
        + Number(isBestSpread(left.homeSpreadOdds, left.homeSpread, game.bestHomeSpread, left.book))
        + Number(isBestTotal(left.overOdds, left.total, game.bestOver, left.book))
        + Number(isBestTotal(left.underOdds, left.total, game.bestUnder, left.book));
      const rightBestCount = Number(isBestMoneyline(right.awayML, game.bestAway, right.book))
        + Number(isBestMoneyline(right.homeML, game.bestHome, right.book))
        + Number(isBestSpread(right.awaySpreadOdds, right.awaySpread, game.bestAwaySpread, right.book))
        + Number(isBestSpread(right.homeSpreadOdds, right.homeSpread, game.bestHomeSpread, right.book))
        + Number(isBestTotal(right.overOdds, right.total, game.bestOver, right.book))
        + Number(isBestTotal(right.underOdds, right.total, game.bestUnder, right.book));
      return rightBestCount - leftBestCount || left.book.localeCompare(right.book);
    });
  }, [game]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-dark-border/60 bg-dark-bg/30">
      <table className="min-w-full">
        <thead className="border-b border-dark-border/60 bg-dark-bg/50">
          <tr className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
            <th className="px-3 py-2 text-left">Book</th>
            <th className="px-3 py-2 text-left">{game.awayAbbrev} ML</th>
            <th className="px-3 py-2 text-left">{game.homeAbbrev} ML</th>
            <th className="px-3 py-2 text-left">{game.awayAbbrev} Spread</th>
            <th className="px-3 py-2 text-left">{game.homeAbbrev} Spread</th>
            <th className="px-3 py-2 text-left">Over</th>
            <th className="px-3 py-2 text-left">Under</th>
          </tr>
        </thead>
        <tbody>
          {books.map((book: AggregatedBookOdds) => (
            <tr key={`${game.gameId}-${book.book}`} className="border-b border-dark-border/30 last:border-b-0">
              <Cell>
                <span className="rounded-full border border-dark-border bg-dark-surface/80 px-2 py-1 text-[10px] font-semibold text-white">
                  {shortBookName(book.book)}
                </span>
              </Cell>
              <Cell active={isBestMoneyline(book.awayML, game.bestAway, book.book)}>{formatOdds(book.awayML)}</Cell>
              <Cell active={isBestMoneyline(book.homeML, game.bestHome, book.book)}>{formatOdds(book.homeML)}</Cell>
              <Cell active={isBestSpread(book.awaySpreadOdds, book.awaySpread, game.bestAwaySpread, book.book)}>
                {book.awaySpread != null && book.awaySpreadOdds != null ? `${formatLine(book.awaySpread)} (${formatOdds(book.awaySpreadOdds)})` : "—"}
              </Cell>
              <Cell active={isBestSpread(book.homeSpreadOdds, book.homeSpread, game.bestHomeSpread, book.book)}>
                {book.homeSpread != null && book.homeSpreadOdds != null ? `${formatLine(book.homeSpread)} (${formatOdds(book.homeSpreadOdds)})` : "—"}
              </Cell>
              <Cell active={isBestTotal(book.overOdds, book.total, game.bestOver, book.book)}>
                {book.total != null && book.overOdds != null ? `${book.total} (${formatOdds(book.overOdds)})` : "—"}
              </Cell>
              <Cell active={isBestTotal(book.underOdds, book.total, game.bestUnder, book.book)}>
                {book.total != null && book.underOdds != null ? `${book.total} (${formatOdds(book.underOdds)})` : "—"}
              </Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestLineSummary({ game }: { game: AggregatedOdds }) {
  const items = [
    game.bestAway ? `${game.awayAbbrev} ${formatOdds(game.bestAway.odds)} ${shortBookName(game.bestAway.book)}` : null,
    game.bestHome ? `${game.homeAbbrev} ${formatOdds(game.bestHome.odds)} ${shortBookName(game.bestHome.book)}` : null,
    game.bestOver ? `O${game.bestOver.line} ${formatOdds(game.bestOver.odds)} ${shortBookName(game.bestOver.book)}` : null,
    game.bestUnder ? `U${game.bestUnder.line} ${formatOdds(game.bestUnder.odds)} ${shortBookName(game.bestUnder.book)}` : null,
  ].filter(Boolean) as string[];

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}


function formatHistoryTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDelta(value: number | null, kind: "odds" | "line") {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "—";
  if (kind === "odds") return `${value > 0 ? "+" : ""}${Math.round(value)}¢`;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function MovementTab({ games, movementHistory }: { games: AggregatedOdds[]; movementHistory: Record<string, MarketHistoryRail | null> }) {
  // Build per-game line comparison cards showing highest/lowest for each market
  const gameCards = games
    .filter((g) => (g.books || []).length >= 2)
    .map((game) => {
      const books = game.books || [];
      type LineRow = { market: string; high: { odds: string; book: string }; low: { odds: string; book: string }; spread: number };
      const lines: LineRow[] = [];

      // Away ML
      const awayMLs = books.map(b => ({ ml: b.awayML, book: b.book })).filter(b => b.ml != null) as Array<{ ml: number; book: string }>;
      if (awayMLs.length >= 2) {
        const best = awayMLs.reduce((a, b) => a.ml > b.ml ? a : b);
        const worst = awayMLs.reduce((a, b) => a.ml < b.ml ? a : b);
        if (best.ml !== worst.ml) {
          lines.push({
            market: `${game.awayAbbrev} ML`,
            high: { odds: formatOdds(best.ml), book: shortBookName(best.book) },
            low: { odds: formatOdds(worst.ml), book: shortBookName(worst.book) },
            spread: best.ml - worst.ml,
          });
        }
      }

      // Home ML
      const homeMLs = books.map(b => ({ ml: b.homeML, book: b.book })).filter(b => b.ml != null) as Array<{ ml: number; book: string }>;
      if (homeMLs.length >= 2) {
        const best = homeMLs.reduce((a, b) => a.ml > b.ml ? a : b);
        const worst = homeMLs.reduce((a, b) => a.ml < b.ml ? a : b);
        if (best.ml !== worst.ml) {
          lines.push({
            market: `${game.homeAbbrev} ML`,
            high: { odds: formatOdds(best.ml), book: shortBookName(best.book) },
            low: { odds: formatOdds(worst.ml), book: shortBookName(worst.book) },
            spread: best.ml - worst.ml,
          });
        }
      }

      // Totals (O/U line)
      const totals = books.map(b => ({ total: b.total, overOdds: b.overOdds, underOdds: b.underOdds, book: b.book })).filter(b => b.total != null) as Array<{ total: number; overOdds: number | null; underOdds: number | null; book: string }>;
      if (totals.length >= 2) {
        const unique = Array.from(new Set(totals.map(t => t.total)));
        if (unique.length > 1) {
          const highest = totals.reduce((a, b) => a.total > b.total ? a : b);
          const lowest = totals.reduce((a, b) => a.total < b.total ? a : b);
          lines.push({
            market: "Total O/U",
            high: { odds: String(highest.total), book: shortBookName(highest.book) },
            low: { odds: String(lowest.total), book: shortBookName(lowest.book) },
            spread: highest.total - lowest.total,
          });
        }
      }

      // Spreads
      const spreads = books.map(b => ({ spread: b.homeSpread, odds: b.homeSpreadOdds, book: b.book })).filter(b => b.spread != null) as Array<{ spread: number; odds: number | null; book: string }>;
      if (spreads.length >= 2) {
        const unique = Array.from(new Set(spreads.map(s => s.spread)));
        if (unique.length > 1) {
          const highest = spreads.reduce((a, b) => a.spread > b.spread ? a : b);
          const lowest = spreads.reduce((a, b) => a.spread < b.spread ? a : b);
          lines.push({
            market: "Spread",
            high: { odds: `${highest.spread > 0 ? "+" : ""}${highest.spread}`, book: shortBookName(highest.book) },
            low: { odds: `${lowest.spread > 0 ? "+" : ""}${lowest.spread}`, book: shortBookName(lowest.book) },
            spread: Math.abs(highest.spread - lowest.spread),
          });
        }
      }

      if (lines.length === 0) return null;

      const maxSpread = Math.max(...lines.map(l => l.spread));
      return { game, lines, maxSpread };
    })
    .filter(Boolean)
    .sort((a, b) => b!.maxSpread - a!.maxSpread) as Array<{ game: AggregatedOdds; lines: Array<{ market: string; high: { odds: string; book: string }; low: { odds: string; book: string }; spread: number }>; maxSpread: number }>;

  if (gameCards.length === 0) {
    return (
      <EmptyStateCard
        eyebrow="Movement"
        title="No significant line movement detected"
        body="Line movement alerts appear when odds shift significantly across sportsbooks. Check back closer to game time."
      />
    );
  }

  const historicalCards = gameCards
    .map(({ game }) => ({ game, history: movementHistory[game.gameId] ?? null }))
    .filter((entry) => entry.history && entry.history.deltas.length > 0) as Array<{ game: AggregatedOdds; history: MarketHistoryRail }>;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-dark-border bg-dark-surface/60 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Movement scope</p>
        <p className="mt-1 text-sm text-gray-300">Cross-book price differences are always live below. Opening vs latest snapshot movement only appears when the same game already has at least two archived captures.</p>
      </div>

      {historicalCards.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1">Snapshot history — opening vs latest</p>
          {historicalCards.map(({ game, history }) => (
            <div key={`${game.gameId}-history`} className="rounded-xl border border-accent-blue/20 bg-accent-blue/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-accent-blue/10">
                <div>
                  <span className="text-sm font-bold text-white">{game.awayAbbrev} @ {game.homeAbbrev}</span>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Open {formatHistoryTime(history.openingCapturedAt)} · Latest {formatHistoryTime(history.latestCapturedAt)} · {history.capturedSnapshots} snapshots
                  </p>
                </div>
                <span className="text-[10px] text-accent-blue">{history.booksTracked.length} books tracked</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-xs text-gray-300">{history.freshnessNote}</p>
                <p className="text-[11px] text-amber-200">{history.limitationNote}</p>
                <div className="space-y-2">
                  {history.deltas.map((delta) => (
                    <div key={`${delta.book}-${delta.marketType}-${delta.outcome}`} className="rounded-xl border border-dark-border/40 bg-dark-bg/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-white">{delta.book} · {delta.outcome} {delta.marketType === "moneyline" ? "ML" : delta.marketType === "spread" ? "Spread" : "Total"}</p>
                        <div className="flex gap-2 text-[11px]">
                          <span className="text-gray-400">Odds {formatDelta(delta.oddsDelta, "odds")}</span>
                          {delta.marketType !== "moneyline" && <span className="text-gray-400">Line {formatDelta(delta.lineDelta, "line")}</span>}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Opening {delta.marketType === "moneyline" ? formatOdds(delta.openingOdds) : `${delta.openingLine ?? "—"} (${formatOdds(delta.openingOdds)})`} → Latest {delta.marketType === "moneyline" ? formatOdds(delta.latestOdds) : `${delta.latestLine ?? "—"} (${formatOdds(delta.latestOdds)})`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1">Live cross-book comparison — highest vs lowest right now</p>
      {gameCards.map(({ game, lines }) => (
        <div key={game.gameId} className="rounded-xl border border-dark-border bg-dark-surface/70 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border/50">
            <span className="text-sm font-bold text-white">{game.awayAbbrev} @ {game.homeAbbrev}</span>
            <span className="text-[10px] text-gray-500">{game.books.length} books</span>
          </div>
          <div className="divide-y divide-dark-border/30">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-1.5">
              <span className="text-[9px] text-gray-600 uppercase">Market</span>
              <span className="text-[9px] text-gray-600 uppercase text-right w-[90px]">▲ Highest</span>
              <span className="text-[9px] text-gray-600 uppercase text-right w-[90px]">▼ Lowest</span>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 items-center">
                <span className="text-xs text-gray-300 font-medium">{line.market}</span>
                <div className="text-right w-[90px]">
                  <span className="text-xs font-semibold text-emerald-400">{line.high.odds}</span>
                  <span className="text-[9px] text-gray-500 ml-1">{line.high.book}</span>
                </div>
                <div className="text-right w-[90px]">
                  <span className="text-xs font-semibold text-accent-red">{line.low.odds}</span>
                  <span className="text-[9px] text-gray-500 ml-1">{line.low.book}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SharpTab({ games }: { games: AggregatedOdds[] }) {
  // Detect sharp signals: when Pinnacle (sharpest book) disagrees with soft books
  const signals = games.flatMap((game) => {
    const items: Array<{ game: string; signal: string; detail: string; confidence: "high" | "medium" }> = [];
    const books = game.books || [];
    const pinnacle = books.find(b => b.book.toLowerCase().includes("pinnacle"));
    const softBooks = books.filter(b => !b.book.toLowerCase().includes("pinnacle"));

    if (!pinnacle || softBooks.length === 0) return items;

    // Compare Pinnacle ML vs average soft book ML
    if (pinnacle.awayML != null) {
      const softAwayMLs = softBooks.map(b => b.awayML).filter((v): v is number => v != null);
      if (softAwayMLs.length > 0) {
        const avgSoft = softAwayMLs.reduce((a, b) => a + b, 0) / softAwayMLs.length;
        const diff = pinnacle.awayML - avgSoft;
        if (Math.abs(diff) >= 15) {
          items.push({
            game: `${game.awayAbbrev} @ ${game.homeAbbrev}`,
            signal: diff > 0 ? `🧠 Sharp on ${game.awayAbbrev}` : `🧠 Sharp against ${game.awayAbbrev}`,
            detail: `Pinnacle ${formatOdds(pinnacle.awayML)} vs market avg ${formatOdds(Math.round(avgSoft))} (${Math.abs(Math.round(diff))}¢ edge)`,
            confidence: Math.abs(diff) >= 25 ? "high" : "medium",
          });
        }
      }
    }

    if (pinnacle.homeML != null) {
      const softHomeMLs = softBooks.map(b => b.homeML).filter((v): v is number => v != null);
      if (softHomeMLs.length > 0) {
        const avgSoft = softHomeMLs.reduce((a, b) => a + b, 0) / softHomeMLs.length;
        const diff = pinnacle.homeML - avgSoft;
        if (Math.abs(diff) >= 15) {
          items.push({
            game: `${game.awayAbbrev} @ ${game.homeAbbrev}`,
            signal: diff > 0 ? `🧠 Sharp on ${game.homeAbbrev}` : `🧠 Sharp against ${game.homeAbbrev}`,
            detail: `Pinnacle ${formatOdds(pinnacle.homeML)} vs market avg ${formatOdds(Math.round(avgSoft))} (${Math.abs(Math.round(diff))}¢ edge)`,
            confidence: Math.abs(diff) >= 25 ? "high" : "medium",
          });
        }
      }
    }

    return items;
  }).sort((a, b) => (a.confidence === "high" ? 0 : 1) - (b.confidence === "high" ? 0 : 1));

  // Also show best value plays (biggest difference between best and worst odds)
  const valuePlays = games.flatMap((game) => {
    const books = game.books || [];
    if (books.length < 2) return [];
    const items: Array<{ game: string; side: string; best: string; worst: string; edge: number }> = [];

    const awayMLs = books.map(b => ({ ml: b.awayML, book: b.book })).filter(b => b.ml != null) as Array<{ ml: number; book: string }>;
    if (awayMLs.length >= 2) {
      const best = awayMLs.reduce((a, b) => a.ml > b.ml ? a : b);
      const worst = awayMLs.reduce((a, b) => a.ml < b.ml ? a : b);
      const edge = best.ml - worst.ml;
      if (edge >= 10) {
        items.push({
          game: `${game.awayAbbrev} @ ${game.homeAbbrev}`,
          side: game.awayAbbrev || "Away",
          best: `${shortBookName(best.book)} ${formatOdds(best.ml)}`,
          worst: `${shortBookName(worst.book)} ${formatOdds(worst.ml)}`,
          edge,
        });
      }
    }

    return items;
  }).sort((a, b) => b.edge - a.edge).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Sharp Signals */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mb-2">🧠 Sharp Book Signals — Pinnacle vs Market</p>
        {signals.length === 0 ? (
          <div className="rounded-xl border border-dark-border bg-dark-surface/70 px-4 py-3">
            <p className="text-xs text-gray-400">No sharp discrepancies detected. Pinnacle is in line with soft books.</p>
          </div>
        ) : signals.map((s, i) => (
          <div key={i} className={`rounded-xl border px-4 py-3 mb-2 ${
            s.confidence === "high" ? "border-accent-blue/30 bg-accent-blue/5" : "border-dark-border bg-dark-surface/70"
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">{s.game}</span>
              <span className={`text-[10px] font-bold ${s.confidence === "high" ? "text-accent-blue" : "text-gray-400"}`}>
                {s.confidence === "high" ? "STRONG" : "LEAN"}
              </span>
            </div>
            <p className="text-xs text-accent-blue mt-1">{s.signal}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.detail}</p>
          </div>
        ))}
      </div>

      {/* Value Plays */}
      {valuePlays.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider px-1 mb-2">💰 Best Value — Biggest Book Spreads</p>
          {valuePlays.map((v, i) => (
            <div key={i} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{v.game}</span>
                <span className="text-[10px] font-bold text-emerald-400">SAVE {v.edge}¢</span>
              </div>
              <p className="text-xs text-gray-300 mt-1">{v.side}: Best {v.best} vs Worst {v.worst}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function GolfBoard({ tab, golfData }: { tab: Tab; golfData: GolfDashboardData | null }) {
  if (tab !== "Best Lines") {
    return (
      <EmptyStateCard
        eyebrow={tab}
        title="Coming soon"
        body="Golf line movement and sharper matchup screening will sit on top of the live tournament board once snapshot storage is enabled."
      />
    );
  }

  if (!golfData?.odds || (golfData.odds.outrights.length === 0 && golfData.odds.h2h.length === 0)) {
    return (
      <EmptyStateCard
        eyebrow="PGA Odds"
        title="No golf odds available right now"
        body="This view will populate when the current tournament has posted outrights or head-to-head markets."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Tournament board</p>
        <h3 className="mt-1 text-lg font-semibold text-white">{golfData.leaderboard?.tournament.name || golfData.odds.tournament}</h3>
        <p className="mt-1 text-sm text-gray-400">
          {golfData.meta.oddsConnected ? "Outrights and head-to-head matchups loaded from the tournament feed." : "Odds feed unavailable for the current PGA event."}
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
  );
}

export default function OddsPage() {
  const [league, setLeague] = useLeague();
  const sportLeague = normalizeSportsLeague(league);
  const [tab, setTab] = useState<Tab>("Best Lines");
  const [aggregated, setAggregated] = useState<AggregatedResponse | null>(null);
  const [golfData, setGolfData] = useState<GolfDashboardData | null>(null);
  const [movementHistory, setMovementHistory] = useState<Record<string, MarketHistoryRail | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAggregated(null);
    setGolfData(null);
    setMovementHistory({});

    async function load() {
      try {
        if (sportLeague === "PGA") {
          const response = await fetch("/api/golf/dashboard");
          const data = await response.json();
          if (!cancelled) setGolfData(data);
          return;
        }

        const response = await fetch("/api/odds/aggregated");
        const data = await response.json() as AggregatedResponse;
        if (!cancelled) {
          setAggregated(data);

          const visibleGames = sportLeague === "All"
            ? data.games.filter((game) => game.sport !== "PGA")
            : data.sports[sportLeague as AggregatedSport] || [];

          const historyEntries = await Promise.all(
            visibleGames.slice(0, 12).map(async (game) => {
              try {
                const historyResponse = await fetch(`/api/odds/aggregated/history?gameId=${encodeURIComponent(game.gameId)}`);
                if (!historyResponse.ok) return [game.gameId, null] as const;
                const payload = await historyResponse.json() as HistoryResponse;
                return [game.gameId, payload.history] as const;
              } catch {
                return [game.gameId, null] as const;
              }
            }),
          );

          if (!cancelled) {
            setMovementHistory(Object.fromEntries(historyEntries));
          }
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sportLeague]);

  const displayedGames = useMemo(() => {
    if (!aggregated) return [];
    if (sportLeague === "All") {
      return aggregated.games.filter((game) => game.sport !== "PGA");
    }
    return aggregated.sports[sportLeague as AggregatedSport] || [];
  }, [aggregated, sportLeague]);

  if (sportLeague === "EPL" || sportLeague === "Serie A") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Lines & Odds"
          subtitle="Best prices, movement, and sharper-book context."
          right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
        />

        <EmptyStateCard
          eyebrow={sportLeague}
          title="Soccer lines live on the schedule board"
          body="This release surfaces soccer odds directly on each match card in 1X2 format. The cross-book aggregated odds board is still limited to the sports already wired into the free-feed aggregator."
          ctaLabel="Open Schedule"
          ctaHref="/schedule"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Lines & Odds"
        subtitle="Best prices, movement, and sharper-book context."
        right={<LeagueDropdown active={sportLeague} onChange={setLeague} />}
      >
        <div className="flex overflow-x-auto border-b border-dark-border scrollbar-hide">
          {(["Best Lines", "Movement", "Sharp"] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`tap-button relative flex-1 min-w-[96px] py-3 text-center text-sm font-medium transition-colors ${
                tab === item ? "text-white" : "text-gray-500"
              }`}
            >
              {item}
              {tab === item && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-blue" />}
            </button>
          ))}
        </div>
      </PageHeader>

      <LockedFeature feature="odds_board">
        <div className="space-y-4 px-4 py-4 lg:px-0">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="stagger-in" style={getStaggerStyle(index)}>
                  <OddsGameSkeleton />
                </div>
              ))}
            </div>
          ) : sportLeague === "PGA" ? (
            <GolfBoard tab={tab} golfData={golfData} />
          ) : tab === "Movement" ? (
            <LockedFeature feature="line_movement" compact>
              <MovementTab games={displayedGames} movementHistory={movementHistory} />
            </LockedFeature>
          ) : tab === "Sharp" ? (
            <LockedFeature feature="sharp_alerts" compact>
              <SharpTab games={displayedGames} />
            </LockedFeature>
          ) : displayedGames.length === 0 ? (
            <EmptyStateCard
              eyebrow="Best Lines"
              title="No aggregated odds available right now"
              body="This view fills from the live sportsbook feeds. If books have not posted markets yet, the board stays empty."
            />
          ) : (
            <div className="space-y-4">
              {aggregated?.generatedAt && (
                <div className="rounded-2xl border border-dark-border bg-dark-surface/60 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="section-heading">Multi-Book Board</p>
                      <p className="mt-1 text-sm text-gray-300">
                        {displayedGames.length} game{displayedGames.length === 1 ? "" : "s"} cached for {aggregated.meta.ttlMinutes} minutes
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Updated {new Date(aggregated.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              )}

              {displayedGames.map((game, index) => (
                <div key={game.gameId} className="stagger-in" style={getStaggerStyle(index)}>
                  <div className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                            {game.sport}
                          </span>
                          <span className="text-xs text-gray-500">{formatCommenceTime(game.commenceTime)}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <TeamLogo team={game.awayAbbrev} size={28} color="#475569" sport={game.sport} />
                          <div>
                            <p className="card-title">{game.awayTeam}</p>
                            <p className="text-xs text-gray-500">{game.awayAbbrev}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <TeamLogo team={game.homeAbbrev} size={28} color="#475569" sport={game.sport} />
                          <div>
                            <p className="card-title">{game.homeTeam}</p>
                            <p className="text-xs text-gray-500">{game.homeAbbrev}</p>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 max-w-full shrink-0">
                        <p className="mb-2 section-heading">Best Prices</p>
                        <BestLineSummary game={game} />
                      </div>
                    </div>

                    <div className="mt-4">
                      <BookGrid game={game} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </LockedFeature>
    </div>
  );
}
