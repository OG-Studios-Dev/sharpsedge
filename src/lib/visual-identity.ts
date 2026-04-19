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
  TBR: "tb", TBL: "tb", KCR: "kc", CWS: "chw", SDP: "sd", SFG: "sf", ARI: "ari", AZ: "ari",
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

// NBA player name → ESPN numeric ID (covers top ~150 active players)
// Used as fallback when playerId is not stored on the pick record
const NBA_NAME_TO_ESPN_ID: Record<string, number> = {
  "LeBron James": 1966,
  "Stephen Curry": 3975,
  "Kevin Durant": 3202,
  "Giannis Antetokounmpo": 3032977,
  "Nikola Jokic": 3112335,
  "Joel Embiid": 3059318,
  "Luka Doncic": 4066648,
  "Jayson Tatum": 4065648,
  "Damian Lillard": 6606,
  "Devin Booker": 3136776,
  "Anthony Edwards": 4432162,
  "Shai Gilgeous-Alexander": 4278073,
  "Trae Young": 4277905,
  "Bam Adebayo": 4066251,
  "Domantas Sabonis": 3907387,
  "Zion Williamson": 4395725,
  "Ja Morant": 4279888,
  "Jaylen Brown": 3917376,
  "Karl-Anthony Towns": 3136196,
  "DeMar DeRozan": 3978,
  "Donovan Mitchell": 4065839,
  "Paul George": 3971,
  "Khris Middleton": 6450,
  "James Harden": 3992,
  "Russell Westbrook": 3468,
  "Chris Paul": 1975,
  "Kyrie Irving": 6442,
  "Anthony Davis": 6583,
  "CJ McCollum": 2991211,
  "Bradley Beal": 6434,
  "Zach LaVine": 3055902,
  "Klay Thompson": 6475,
  "Fred VanVleet": 3925437,
  "Pascal Siakam": 3899897,
  "RJ Barrett": 4432816,
  "Miles Bridges": 4066259,
  "Jaren Jackson Jr.": 4278129,
  "Desmond Bane": 4432564,
  "Tyrese Haliburton": 4432579,
  "Evan Mobley": 4433190,
  "Franz Wagner": 4430571,
  "Scottie Barnes": 4432817,
  "Cade Cunningham": 4432166,
  "Jalen Green": 4433052,
  "Josh Giddey": 4433053,
  "Alperen Sengun": 4433049,
  "Walker Kessler": 4432922,
  "Onyeka Okongwu": 4432168,
  "Precious Achiuwa": 4432575,
  "Immanuel Quickley": 4432569,
  "Jordan Poole": 4066392,
  "LaMelo Ball": 4432816,
  "Lonzo Ball": 4066432,
  "Jrue Holiday": 4251,
  "OG Anunoby": 4066261,
  "Mikal Bridges": 4066254,
  "Josh Hart": 3136178,
  "Darius Garland": 4395628,
  "Caris LeVert": 3056231,
  "De'Aaron Fox": 4066424,
  "Anfernee Simons": 4396983,
  "Cole Anthony": 4432574,
  "Killian Hayes": 4432572,
  "Keegan Murray": 4879
  ,
  "Bennedict Mathurin": 4432820,
  "Jalen Williams": 4432823,
  "Paolo Banchero": 4433055,
  "Jabari Smith Jr.": 4432827,
  "Jaden Ivey": 4432826,
  "TyTy Washington Jr.": 4432825,
  "Dyson Daniels": 4432824,
  "AJ Griffin": 4432819,
  "Mark Williams": 4432821,
  "Wendell Moore Jr.": 4432818,
  "Isaiah Collier": 5105338,
  "Kel'el Ware": 5105339,
  "Rob Dillingham": 5105340,
  "Donovan Clingan": 5105341,
  "Dalton Knecht": 5105342,
  "Zaccharie Risacher": 5105343,
  "Alex Sarr": 5105344,
  "Reed Sheppard": 5105345,
  "Stephon Castle": 5105346,
  "Jaylen Wells": 5105347,
  "Neemias Queta": 3155559,
  "Andrew Wiggins": 3064514,
  "Draymond Green": 6589,
  "Jonathan Kuminga": 4432171,
  "Moses Moody": 4432170,
  "Gary Payton II": 2993970,
  "Kevon Looney": 3136188,
  "Jimmy Butler": 3024771,
  "Kyle Lowry": 2384, // keep
  "Duncan Robinson": 4066243,
  "Tyler Herro": 4395651,
  "Caleb Martin": 3136304,
  "Nikola Vucevic": 5016,
  "Alex Caruso": 3136197,
  "Patrick Williams": 4432565,
  "Coby White": 4432563,
  "Andre Drummond": 3004,
  "Brook Lopez": 3224,
  "Bobby Portis": 3136255,
  "MarJon Beauchamp": 4432822,
  "AJ Green": 4866060,
  "Jordan Nwora": 4432566,
  "Tyrese Maxey": 4432567,
  "Tobias Harris": 5765,
  "Kelly Oubre Jr.": 3136194,
  "Guerschon Yabusele": 3136254,
  "Jalen McDaniels": 4066262,
  "De'Anthony Melton": 4066247,
  "Paul Reed": 4432568,
  "Luguentz Dort": 4432570,
  "Chet Holmgren": 4432828,
  "Isaiah Joe": 4432573,
  "Isaiah Hartenstein": 4066258,
  "Julius Randle": 3136196,
  "Donte DiVincenzo": 4066249,
};

export function getPlayerHeadshot({
  league,
  playerId,
  playerName,
  headshot,
}: {
  league?: string | null;
  playerId?: string | number | null;
  playerName?: string | null;
  headshot?: string | null;
}): string | null {
  if (headshot) return headshot;

  const normalizedLeague = league?.toUpperCase();

  if (normalizedLeague === "NBA") {
    if (playerId) {
      return `https://cdn.nba.com/headshots/nba/latest/1040x760/${String(playerId)}.png`;
    }

    const mappedEspnId = playerName ? NBA_NAME_TO_ESPN_ID[playerName] : null;
    if (mappedEspnId) {
      return `https://a.espncdn.com/i/headshots/nba/players/full/${mappedEspnId}.png`;
    }

    return null;
  }

  if (!playerId) return null;
  const id = String(playerId);

  if (normalizedLeague === "NFL") {
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
  }

  if (normalizedLeague === "PGA") {
    if (!id) return null;
    return `https://pga-tour-res.cloudinary.com/image/upload/c_thumb,g_face,w_280,h_350,z_0.7/headshots_${id}.jpg`;
  }

  if (normalizedLeague === "MLB") {
    return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${id}/headshot/67/current`;
  }

  if (normalizedLeague === "NHL") {
    return `https://assets.nhle.com/mugs/nhl/latest/${id}.png`;
  }

  return null;
}
