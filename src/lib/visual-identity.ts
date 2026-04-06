import type { League } from "@/lib/types";

export const LEAGUE_LOGOS: Partial<Record<League, string>> = {
  NHL: "https://assets.nhle.com/logos/nhl/svg/NHL_light.svg",
  NBA: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  MLB: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  NFL: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  PGA: "https://a.espncdn.com/i/teamlogos/leagues/500/pga.png",
  EPL: "https://a.espncdn.com/i/teamlogos/leagues/500/eng.1.png",
  "Serie A": "https://a.espncdn.com/i/teamlogos/leagues/500/ita.1.png",
  UFC: "https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png",
};

export const LEAGUE_LABELS: Partial<Record<League, string>> = {
  All: "All",
  NHL: "NHL",
  NBA: "NBA",
  MLB: "MLB",
  NFL: "NFL",
  PGA: "PGA",
  LIV: "LIV",
  EPL: "EPL",
  "Serie A": "Serie A",
  WNBA: "WNBA",
  NCAAB: "NCAAB",
  NCAAF: "NCAAF",
  AFL: "AFL",
  UFC: "UFC",
};

export function getLeagueLogo(league?: string | null): string | null {
  if (!league) return null;
  return LEAGUE_LOGOS[league as League] ?? null;
}

export function getLeagueLabel(league?: string | null): string {
  if (!league) return "League";
  return LEAGUE_LABELS[league as League] ?? league;
}

export function getPlayerHeadshot({
  league,
  playerId,
  headshot,
}: {
  league?: string | null;
  playerId?: string | number | null;
  headshot?: string | null;
}): string | null {
  if (headshot) return headshot;
  if (!playerId) return null;

  const normalizedLeague = league?.toUpperCase();
  const id = String(playerId);

  if (normalizedLeague === "NBA") {
    return `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
  }

  if (normalizedLeague === "NFL") {
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
  }

  if (normalizedLeague === "PGA") {
    return `https://a.espncdn.com/i/headshots/golf/players/full/${id}.png`;
  }

  if (normalizedLeague === "MLB") {
    return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`;
  }

  if (normalizedLeague === "NHL") {
    return `https://assets.nhle.com/mugs/nhl/latest/${id}.png`;
  }

  return null;
}
