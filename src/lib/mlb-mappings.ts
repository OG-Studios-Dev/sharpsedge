export const MLB_TEAM_NAME_MAP: Record<string, string[]> = {
  ARI: ["Arizona Diamondbacks", "Arizona", "D-backs", "Diamondbacks"],
  ATL: ["Atlanta Braves", "Atlanta", "Braves"],
  BAL: ["Baltimore Orioles", "Baltimore", "Orioles"],
  BOS: ["Boston Red Sox", "Boston", "Red Sox"],
  CHC: ["Chicago Cubs", "Chicago Cubs", "Cubs"],
  CWS: ["Chicago White Sox", "Chicago White Sox", "White Sox"],
  CIN: ["Cincinnati Reds", "Cincinnati", "Reds"],
  CLE: ["Cleveland Guardians", "Cleveland", "Guardians"],
  COL: ["Colorado Rockies", "Colorado", "Rockies"],
  DET: ["Detroit Tigers", "Detroit", "Tigers"],
  HOU: ["Houston Astros", "Houston", "Astros"],
  KC: ["Kansas City Royals", "Kansas City", "Royals", "K.C. Royals"],
  LAA: ["Los Angeles Angels", "LA Angels", "L.A. Angels", "Angels"],
  LAD: ["Los Angeles Dodgers", "LA Dodgers", "L.A. Dodgers", "Dodgers"],
  MIA: ["Miami Marlins", "Miami", "Marlins"],
  MIL: ["Milwaukee Brewers", "Milwaukee", "Brewers"],
  MIN: ["Minnesota Twins", "Minnesota", "Twins"],
  NYM: ["New York Mets", "NY Mets", "Mets"],
  NYY: ["New York Yankees", "NY Yankees", "Yankees"],
  OAK: ["Athletics", "Oakland Athletics", "Sacramento Athletics", "A's", "As"],
  PHI: ["Philadelphia Phillies", "Philadelphia", "Phillies"],
  PIT: ["Pittsburgh Pirates", "Pittsburgh", "Pirates"],
  SD: ["San Diego Padres", "San Diego", "Padres"],
  SF: ["San Francisco Giants", "San Francisco", "Giants"],
  SEA: ["Seattle Mariners", "Seattle", "Mariners"],
  STL: ["St. Louis Cardinals", "St Louis Cardinals", "St. Louis", "St Louis", "Cardinals"],
  TB: ["Tampa Bay Rays", "Tampa Bay", "Rays"],
  TEX: ["Texas Rangers", "Texas", "Rangers"],
  TOR: ["Toronto Blue Jays", "Toronto", "Blue Jays", "Jays"],
  WSH: ["Washington Nationals", "Washington", "Nationals"],
};

export function normalizeMLBTeamAbbrev(abbrev: string) {
  const raw = String(abbrev || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "ATH") return "OAK";
  return raw;
}

export function findMLBTeamAliases(abbrev: string): string[] {
  const normalized = normalizeMLBTeamAbbrev(abbrev);
  return MLB_TEAM_NAME_MAP[normalized] || [normalized];
}

export function findMLBTeamAbbreviationByName(name: string): string {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return "";

  for (const [abbrev, aliases] of Object.entries(MLB_TEAM_NAME_MAP)) {
    if (aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return abbrev;
    }
  }

  for (const [abbrev, aliases] of Object.entries(MLB_TEAM_NAME_MAP)) {
    if (aliases.some((alias) => normalized.includes(alias.toLowerCase()) || alias.toLowerCase().includes(normalized))) {
      return abbrev;
    }
  }

  return normalizeMLBTeamAbbrev(name.slice(0, 3));
}
