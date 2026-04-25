import type { League } from "@/lib/types";

export const ACTIVE_LEAGUE_STORAGE_KEY = "goosalytics_active_league";
export const DEFAULT_LEAGUE_STORAGE_KEY = "goosalytics_fav_league";
export const DEFAULT_LEAGUE: League = "All";

const VALID_LEAGUES: League[] = [
  "All",
  "NHL",
  "NBA",
  "NFL",
  "MLB",
  "PGA",
  "LIV",
  "Serie A",
  "EPL",
  "WNBA",
  "NCAAB",
  "NCAAF",
  "AFL",
  "UFC",
];

export function normalizeLeague(value: string | null | undefined): League {
  return VALID_LEAGUES.includes(value as League) ? value as League : DEFAULT_LEAGUE;
}

function readStorageLeague(key: string): League | null {
  if (typeof window === "undefined") return null;
  return normalizeLeague(window.localStorage.getItem(key));
}

export function readDefaultLeague(): League {
  return readStorageLeague(DEFAULT_LEAGUE_STORAGE_KEY) ?? DEFAULT_LEAGUE;
}

export function readActiveLeague(): League {
  if (typeof window === "undefined") return DEFAULT_LEAGUE;
  const active = window.localStorage.getItem(ACTIVE_LEAGUE_STORAGE_KEY);
  if (active) return normalizeLeague(active);
  return readDefaultLeague();
}

export function writeActiveLeague(league: League) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_LEAGUE_STORAGE_KEY, league);
  window.dispatchEvent(new StorageEvent("storage", {
    key: ACTIVE_LEAGUE_STORAGE_KEY,
    newValue: league,
  }));
}

export function writeDefaultLeague(league: League, options: { applyActive?: boolean } = {}) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEFAULT_LEAGUE_STORAGE_KEY, league);
  window.dispatchEvent(new StorageEvent("storage", {
    key: DEFAULT_LEAGUE_STORAGE_KEY,
    newValue: league,
  }));

  if (options.applyActive) {
    writeActiveLeague(league);
  }
}
