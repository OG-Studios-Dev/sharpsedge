import type { AggregatedBookOdds } from "@/lib/books/types";
import type { Goose2MarketType } from "@/lib/goose2/types";

export function inferGoose2MarketType(input: {
  marketType?: string | null;
  sport?: string | null;
  propType?: string | null;
}): Goose2MarketType {
  const market = String(input.marketType || "").toLowerCase();
  const prop = String(input.propType || "").toLowerCase();

  if (market === "moneyline") return "moneyline";
  if (market === "spread") return "spread";
  if (market === "total") return "total";
  if (market === "spread_q1") return "first_quarter_spread";
  if (market === "spread_q3") return "third_quarter_spread";
  if (market === "h2h_1st_5_innings") return "first_five_moneyline";
  if (market === "totals_1st_5_innings") return "first_five_total";

  if (prop.includes("points")) return "player_prop_points";
  if (prop.includes("rebounds")) return "player_prop_rebounds";
  if (prop.includes("assists")) return "player_prop_assists";
  if (prop.includes("shots")) return "player_prop_shots_on_goal";
  if (prop.includes("goals")) return "player_prop_goals";
  if (prop.includes("hits")) return "player_prop_hits";
  if (prop.includes("total bases")) return "player_prop_total_bases";
  if (prop.includes("strikeouts")) return "player_prop_strikeouts";
  if (prop.includes("home runs")) return "player_prop_home_runs";
  if (prop.includes("threes") || prop.includes("3-pointers") || prop.includes("3pm")) return "player_prop_threes";
  if (prop.includes("top 5")) return "golf_top_5";
  if (prop.includes("top 10")) return "golf_top_10";
  if (prop.includes("top 20")) return "golf_top_20";
  if (prop.includes("outright") || prop.includes("winner")) return "golf_outright";
  if (prop.includes("matchup")) return "golf_matchup";

  return "unknown";
}

export function expandBookOddsToCandidateMarkets(book: AggregatedBookOdds) {
  return [
    { marketType: "moneyline", side: "home", line: null, odds: book.homeML },
    { marketType: "moneyline", side: "away", line: null, odds: book.awayML },
    { marketType: "spread", side: "home", line: book.homeSpread, odds: book.homeSpreadOdds },
    { marketType: "spread", side: "away", line: book.awaySpread, odds: book.awaySpreadOdds },
    { marketType: "spread_q1", side: "home", line: book.firstQuarterHomeSpread, odds: book.firstQuarterHomeSpreadOdds },
    { marketType: "spread_q1", side: "away", line: book.firstQuarterAwaySpread, odds: book.firstQuarterAwaySpreadOdds },
    { marketType: "spread_q3", side: "home", line: book.thirdQuarterHomeSpread, odds: book.thirdQuarterHomeSpreadOdds },
    { marketType: "spread_q3", side: "away", line: book.thirdQuarterAwaySpread, odds: book.thirdQuarterAwaySpreadOdds },
    { marketType: "total", side: "over", line: book.total, odds: book.overOdds },
    { marketType: "total", side: "under", line: book.total, odds: book.underOdds },
    { marketType: "h2h_1st_5_innings", side: "home", line: null, odds: book.firstFiveHomeML },
    { marketType: "h2h_1st_5_innings", side: "away", line: null, odds: book.firstFiveAwayML },
    { marketType: "totals_1st_5_innings", side: "over", line: book.firstFiveTotal, odds: book.firstFiveOverOdds },
    { marketType: "totals_1st_5_innings", side: "under", line: book.firstFiveTotal, odds: book.firstFiveUnderOdds },
  ].filter((entry) => typeof entry.odds === "number" && Number.isFinite(entry.odds));
}
