export function resolvePlayerPropMarket(
  league: "NHL" | "NBA" | "MLB",
  propType: string,
) {
  const normalized = propType.toLowerCase().trim();

  if (league === "NHL") {
    if (normalized === "points") return "player_points";
    if (normalized === "assists") return "player_assists";
    if (normalized === "goals") return "player_goals";
    if (normalized === "shots on goal" || normalized === "shots") return "player_shots_on_goal";
    return null;
  }

  if (league === "NBA") {
    if (normalized === "points") return "player_points";
    if (normalized === "rebounds") return "player_rebounds";
    if (normalized === "assists") return "player_assists";
    if (normalized === "3-pointers made" || normalized === "3pm") return "player_threes";
    return null;
  }

  if (normalized === "hits") return "batter_hits";
  if (normalized === "total bases") return "batter_total_bases";
  if (normalized === "home runs" || normalized === "hrs") return "batter_home_runs";
  if (normalized === "strikeouts" || normalized === "strikeouts (k)" || normalized === "k") return "pitcher_strikeouts";
  return null;
}
