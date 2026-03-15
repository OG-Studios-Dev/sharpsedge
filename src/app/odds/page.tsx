"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import LeagueSwitcher from "@/components/LeagueSwitcher";
import EmptyStateCard from "@/components/EmptyStateCard";
import TeamLogo from "@/components/TeamLogo";
import { useLeague } from "@/hooks/useLeague";
import { normalizeSportsLeague } from "@/lib/insights";
import type { GolfDashboardData } from "@/lib/types";
import type { AggregatedBookOdds, AggregatedOdds, AggregatedSport } from "@/lib/books/types";

type Tab = "Best Lines" | "Movement" | "Sharp";

type AggregatedResponse = {
  generatedAt: string;
  sports: Record<AggregatedSport, AggregatedOdds[]>;
  games: AggregatedOdds[];
  meta: {
    ttlMinutes: number;
    sports: AggregatedSport[];
  };
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setAggregated(null);
    setGolfData(null);

    async function load() {
      try {
        if (sportLeague === "PGA") {
          const response = await fetch("/api/golf/dashboard");
          const data = await response.json();
          if (!cancelled) setGolfData(data);
          return;
        }

        const response = await fetch("/api/odds/aggregated");
        const data = await response.json();
        if (!cancelled) setAggregated(data);
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

  return (
    <div className="mx-auto max-w-6xl">
      <header className="sticky top-0 z-40 border-b border-dark-border bg-dark-bg/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg" />
          <LeagueSwitcher active={sportLeague} onChange={setLeague} />
        </div>
        <p className="pb-1 text-center text-sm font-semibold text-gray-300">Lines</p>

        <div className="flex overflow-x-auto border-b border-dark-border scrollbar-hide">
          {(["Best Lines", "Movement", "Sharp"] as Tab[]).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`relative flex-1 min-w-[96px] py-3 text-center text-sm font-medium transition-colors ${
                tab === item ? "text-white" : "text-gray-500"
              }`}
            >
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
            title="Fetching live book comparisons"
            body="Pulling moneylines, spreads, and totals from every connected free sportsbook feed."
          />
        ) : sportLeague === "PGA" ? (
          <GolfBoard tab={tab} golfData={golfData} />
        ) : tab !== "Best Lines" ? (
          <EmptyStateCard
            eyebrow={tab}
            title="Coming soon"
            body={tab === "Movement"
              ? "Line movement needs historical snapshots. This tab will light up once polling is enabled."
              : "Sharp screening will layer on top of the multi-book feed once we persist sharper-book deltas over time."}
          />
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
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Multi-book board</p>
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

            {displayedGames.map((game) => (
              <div key={game.gameId} className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                        {game.sport}
                      </span>
                      <span className="text-xs text-gray-500">{formatCommenceTime(game.commenceTime)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <TeamLogo team={game.awayAbbrev} size={28} color="#475569" />
                      <div>
                        <p className="text-sm font-semibold text-white">{game.awayTeam}</p>
                        <p className="text-xs text-gray-500">{game.awayAbbrev}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <TeamLogo team={game.homeAbbrev} size={28} color="#475569" />
                      <div>
                        <p className="text-sm font-semibold text-white">{game.homeTeam}</p>
                        <p className="text-xs text-gray-500">{game.homeAbbrev}</p>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 max-w-full shrink-0">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-gray-500">Best prices</p>
                    <BestLineSummary game={game} />
                  </div>
                </div>

                <div className="mt-4">
                  <BookGrid game={game} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
