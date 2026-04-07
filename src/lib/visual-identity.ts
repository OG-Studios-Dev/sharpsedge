import type { League } from "@/lib/types";

export const LEAGUE_LOGOS: Partial<Record<League, string>> = {
  NHL: "https://assets.nhle.com/logos/nhl/svg/NHL_light.svg",
  NBA: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  MLB: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  NFL: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  PGA: "/logos/pga.jpg",
  EPL: "/logos/epl.jpg",
  "Serie A": "/logos/serie-a.jpg",
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

/**
 * Returns an ESPN CDN team logo URL for a given league + team abbreviation.
 * Returns null if the league is unsupported.
 */
// Soccer team logo map — ESPN numeric IDs (EPL + Serie A)
const SOCCER_ESPN_LOGO: Record<string, string> = {
  // Serie A
  MIL: "103", ROMA: "104", ATA: "105", BOL: "107", CAG: "2925", COMO: "2572",
  CRE: "4050", FIO: "109", GEN: "3263", VER: "119", INT: "110", JUV: "111",
  LAZ: "112", LEC: "113", NAP: "114", PAR: "115", PIS: "3956", SAS: "3997",
  TOR: "239", UDI: "118",
  // EPL
  BOU: "349", ARS: "359", AVL: "362", BRE: "337", BHA: "331", BUR: "379",
  CHE: "363", CRY: "384", EVE: "368", FUL: "370", LEE: "357", LIV: "364",
  MNC: "382", MAN: "360", NEW: "361", NFO: "393", SUN: "366", TOT: "367",
  WHU: "371", WOL: "380",
};

// ESPN uses non-standard abbreviations for some teams — normalize before building CDN URLs
const NHL_ESPN_ABBREV: Record<string, string> = {
  TBL: "tb", LAK: "la", SJS: "sj", NJD: "nj", CBJ: "cbj", VGK: "vgk",
};
const NBA_ESPN_ABBREV: Record<string, string> = {
  NOP: "no", NOH: "no", BKN: "bkn", CHA: "cha",
};
const MLB_ESPN_ABBREV: Record<string, string> = {
  TBR: "tb", TBL: "tb", KCR: "kc", CWS: "chw", SDP: "sd", SFG: "sf",
};
const NFL_ESPN_ABBREV: Record<string, string> = {
  JAC: "jac", JAX: "jax",
};

export function getTeamLogoUrl(league: string | null | undefined, team: string): string | null {
  if (!league || !team) return null;
  const norm = league.toUpperCase();
  const abbrev = team.toUpperCase();

  if (norm === "NHL") {
    const id = (NHL_ESPN_ABBREV[abbrev] ?? abbrev).toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/nhl/500/${id}.png`;
  }
  if (norm === "NBA") {
    const id = (NBA_ESPN_ABBREV[abbrev] ?? abbrev).toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/nba/500/${id}.png`;
  }
  if (norm === "MLB") {
    const id = (MLB_ESPN_ABBREV[abbrev] ?? abbrev).toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${id}.png`;
  }
  if (norm === "NFL") {
    const id = (NFL_ESPN_ABBREV[abbrev] ?? abbrev).toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${id}.png`;
  }
  if (norm === "PGA" || norm === "GOLF") {
    return "/logos/pga.jpg";
  }
  if (norm === "EPL" || norm === "SERIE A" || norm === "SERIE_A" || norm === "SOCCER") {
    const espnId = SOCCER_ESPN_LOGO[abbrev];
    if (espnId) return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;
  }
  return null;
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
