import { MLB_TEAM_NAME_MAP } from "@/lib/mlb-mappings";
import { NBA_TEAM_NAME_MAP } from "@/lib/nba-mappings";
import { NHL_TEAM_NAME_MAP } from "@/lib/nhl-mappings";
import type { AggregatedSport } from "@/lib/books/types";

const NFL_TEAM_NAME_MAP: Record<string, string[]> = {
  ARI: ["Arizona Cardinals", "Arizona", "Cards"],
  ATL: ["Atlanta Falcons", "Atlanta", "Falcons"],
  BAL: ["Baltimore Ravens", "Baltimore", "Ravens"],
  BUF: ["Buffalo Bills", "Buffalo", "Bills"],
  CAR: ["Carolina Panthers", "Carolina", "Panthers"],
  CHI: ["Chicago Bears", "Chicago", "Bears"],
  CIN: ["Cincinnati Bengals", "Cincinnati", "Bengals"],
  CLE: ["Cleveland Browns", "Cleveland", "Browns"],
  DAL: ["Dallas Cowboys", "Dallas", "Cowboys"],
  DEN: ["Denver Broncos", "Denver", "Broncos"],
  DET: ["Detroit Lions", "Detroit", "Lions"],
  GB: ["Green Bay Packers", "Green Bay", "Packers"],
  HOU: ["Houston Texans", "Houston", "Texans"],
  IND: ["Indianapolis Colts", "Indianapolis", "Colts"],
  JAX: ["Jacksonville Jaguars", "Jacksonville", "Jaguars"],
  KC: ["Kansas City Chiefs", "Kansas City", "Chiefs", "K.C. Chiefs"],
  LAC: ["Los Angeles Chargers", "LA Chargers", "L.A. Chargers", "Chargers"],
  LAR: ["Los Angeles Rams", "LA Rams", "L.A. Rams", "Rams"],
  LV: ["Las Vegas Raiders", "Las Vegas", "Raiders"],
  MIA: ["Miami Dolphins", "Miami", "Dolphins"],
  MIN: ["Minnesota Vikings", "Minnesota", "Vikings"],
  NE: ["New England Patriots", "New England", "Patriots"],
  NO: ["New Orleans Saints", "New Orleans", "Saints"],
  NYG: ["New York Giants", "NY Giants", "Giants"],
  NYJ: ["New York Jets", "NY Jets", "Jets"],
  PHI: ["Philadelphia Eagles", "Philadelphia", "Eagles"],
  PIT: ["Pittsburgh Steelers", "Pittsburgh", "Steelers"],
  SEA: ["Seattle Seahawks", "Seattle", "Seahawks"],
  SF: ["San Francisco 49ers", "San Francisco", "49ers", "Niners"],
  TB: ["Tampa Bay Buccaneers", "Tampa Bay", "Bucs", "Buccaneers"],
  TEN: ["Tennessee Titans", "Tennessee", "Titans"],
  WSH: ["Washington Commanders", "Washington", "Commanders"],
};

const EXTRA_ALIASES: Partial<Record<AggregatedSport, Record<string, string[]>>> = {
  NHL: {
    LAK: ["LA Kings"],
    NJD: ["NJ Devils"],
    SJS: ["SJ Sharks", "San Jose"],
    STL: ["STL Blues"],
    TBL: ["TB Lightning", "Tampa"],
    VGK: ["Vegas", "VGK Golden Knights"],
  },
  NBA: {
    BKN: ["BK Nets"],
    GSW: ["GS Warriors", "GSW"],
    LAC: ["LA Clippers"],
    LAL: ["LA Lakers"],
    NOP: ["NO Pelicans"],
    NYK: ["NY Knicks"],
    OKC: ["OKC Thunder"],
    PHX: ["PHX Suns"],
    POR: ["POR Trail Blazers"],
    SAS: ["SA Spurs"],
  },
  MLB: {
    ATH: ["Athletics"],
    CHC: ["CHI Cubs"],
    CWS: ["CHI White Sox"],
    KC: ["KC Royals"],
    SD: ["SD Padres"],
    SF: ["SF Giants"],
    TB: ["TB Rays", "Tampa"],
    WSH: ["WSH Nationals"],
  },
  NFL: {
    GB: ["GB Packers"],
    KC: ["KC Chiefs"],
    LV: ["Oakland Raiders"],
    NO: ["NO Saints"],
    SF: ["SF 49ers"],
    TB: ["TB Buccaneers", "TB Bucs"],
  },
};

const SPORT_ALIAS_MAPS: Record<Exclude<AggregatedSport, "PGA">, Record<string, string[]>> = {
  NHL: NHL_TEAM_NAME_MAP,
  NBA: NBA_TEAM_NAME_MAP,
  MLB: MLB_TEAM_NAME_MAP,
  NFL: NFL_TEAM_NAME_MAP,
};

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function variantForms(value: string) {
  const base = normalizeToken(value);
  if (!base) return [];

  const variants = new Set<string>([base]);
  variants.add(base.replace(/\bsaint\b/g, "st"));
  variants.add(base.replace(/\bst\b/g, "saint"));
  variants.add(base.replace(/\bforty niners\b/g, "49ers"));
  variants.add(base.replace(/\btrail blazers\b/g, "trailblazers"));
  variants.add(base.replace(/\btrailblazers\b/g, "trail blazers"));
  return Array.from(variants);
}

function buildAliasLookup(sport: Exclude<AggregatedSport, "PGA">) {
  const source = SPORT_ALIAS_MAPS[sport];
  const extra = EXTRA_ALIASES[sport] || {};
  const lookup = new Map<string, string>();

  for (const [abbrev, aliases] of Object.entries(source)) {
    const allAliases = new Set<string>([abbrev, ...aliases, ...(extra[abbrev] || [])]);
    for (const alias of Array.from(allAliases)) {
      for (const variant of variantForms(alias)) {
        lookup.set(variant, abbrev);
      }
    }
  }

  return lookup;
}

const ALIAS_LOOKUPS = {
  NHL: buildAliasLookup("NHL"),
  NBA: buildAliasLookup("NBA"),
  MLB: buildAliasLookup("MLB"),
  NFL: buildAliasLookup("NFL"),
};

export function normalizeTeamName(name: string, sport: AggregatedSport): string {
  if (sport === "PGA") {
    return normalizeToken(name);
  }

  const raw = String(name || "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  if (SPORT_ALIAS_MAPS[sport][upper]) return upper;

  const lookup = ALIAS_LOOKUPS[sport];
  for (const variant of variantForms(raw)) {
    const match = lookup.get(variant);
    if (match) return match;
  }

  return upper;
}

export function getCanonicalTeamName(team: string, sport: AggregatedSport): string {
  if (sport === "PGA") {
    return String(team || "").trim();
  }

  const abbrev = normalizeTeamName(team, sport);
  return SPORT_ALIAS_MAPS[sport][abbrev]?.[0] || String(team || "").trim() || abbrev;
}

export function buildAggregatedGameId(
  sport: AggregatedSport,
  homeTeam: string,
  awayTeam: string,
  commenceTime?: string | null,
) {
  const homeAbbrev = normalizeTeamName(homeTeam, sport);
  const awayAbbrev = normalizeTeamName(awayTeam, sport);
  const dateBucket = (() => {
    const parsed = commenceTime ? new Date(commenceTime) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "na";
    return parsed.toISOString().slice(0, 13);
  })();

  return `${sport}:${awayAbbrev}@${homeAbbrev}:${dateBucket}`;
}

export function isKnownSportTeam(team: string, sport: AggregatedSport) {
  if (sport === "PGA") return Boolean(normalizeToken(team));
  const normalized = normalizeTeamName(team, sport);
  return Boolean(normalized && SPORT_ALIAS_MAPS[sport][normalized]);
}
