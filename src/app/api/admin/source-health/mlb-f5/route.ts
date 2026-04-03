import { NextResponse } from "next/server";
import { MLB_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getMLBScheduleRange } from "@/lib/mlb-api";
import { getAggregatedOddsEvents } from "@/lib/odds-aggregator";
import { findMLBOddsForGame } from "@/lib/mlb-odds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function hasMarket(event: any, key: string) {
  return Boolean(event?.bookmakers?.some((book: any) => book?.markets?.some((market: any) => market?.key === key)));
}

function marketBooks(event: any, key: string) {
  return (event?.bookmakers || [])
    .filter((book: any) => book?.markets?.some((market: any) => market?.key === key))
    .map((book: any) => String(book?.title || book?.key || "unknown"));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || getDateKey(new Date(), MLB_TIME_ZONE);

  try {
    const [schedule, oddsEvents] = await Promise.all([
      getMLBScheduleRange(date, date),
      getAggregatedOddsEvents("MLB"),
    ]);

    const games = schedule.map((game) => {
      const event = findMLBOddsForGame(oddsEvents as any[], game.homeTeam.abbreviation, game.awayTeam.abbreviation) ?? null;
      const f5MoneylineBooks = event ? marketBooks(event, "h2h_1st_5_innings") : [];
      const f5TotalBooks = event ? marketBooks(event, "totals_1st_5_innings") : [];
      const probablePitcherMissing = !game.awayTeam.probablePitcher?.name || !game.homeTeam.probablePitcher?.name;

      return {
        gameId: game.id,
        matchup: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        oddsEventMatched: Boolean(event),
        probablePitcherMissing,
        f5MoneylinePosted: f5MoneylineBooks.length > 0,
        f5TotalPosted: f5TotalBooks.length > 0,
        f5Books: Array.from(new Set([...f5MoneylineBooks, ...f5TotalBooks])).sort(),
        f5MoneylineBooks,
        f5TotalBooks,
        blocker: !event
          ? "no_matched_odds_event"
          : (f5MoneylineBooks.length === 0 && f5TotalBooks.length === 0)
            ? "no_explicit_f5_market_posted"
            : probablePitcherMissing
              ? "starter_missing"
              : null,
      };
    });

    const withF5 = games.filter((game) => game.f5MoneylinePosted || game.f5TotalPosted).length;
    const noMatchedEvent = games.filter((game) => game.blocker === "no_matched_odds_event").length;
    const noExplicitF5 = games.filter((game) => game.blocker === "no_explicit_f5_market_posted").length;
    const starterMissing = games.filter((game) => game.blocker === "starter_missing").length;

    return NextResponse.json({
      date,
      generatedAt: new Date().toISOString(),
      summary: {
        totalGames: games.length,
        gamesWithAnyF5: withF5,
        noMatchedEvent,
        noExplicitF5,
        starterMissing,
      },
      games,
    });
  } catch (error) {
    return NextResponse.json({
      date,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "mlb_f5_source_health_failed",
    }, { status: 500 });
  }
}
