import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDateKey } from "@/lib/date-utils";
import { isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";
import type { OddsEvent } from "@/lib/types";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const DATA_DIR = path.join(process.cwd(), "data");

export const NHL_PLAYER_PROP_MARKETS = "player_points,player_shots_on_goal,player_assists,player_goals";
export const NBA_PLAYER_PROP_MARKETS = "player_points,player_rebounds,player_assists,player_threes";
export const MLB_PLAYER_PROP_MARKETS = "pitcher_strikeouts,batter_hits,batter_total_bases,batter_home_runs";
export const NFL_PLAYER_PROP_MARKETS = "player_pass_yds,player_pass_tds,player_rush_yds,player_rush_attempts,player_reception_yds,player_receptions,player_anytime_td";

type PropsLeague = "NHL" | "NBA" | "MLB" | "NFL";
type PropOddsSource = "cache" | "fresh" | "quota-blocked";

type QuotaSnapshot = {
  checkedAt: string;
  remaining: number | null;
  used: number | null;
  lastCost: number | null;
};

type LeaguePropsCache = {
  blockedAt: string | null;
  fetchedAt: string | null;
  events: Record<string, OddsEvent | null>;
};

type DailyPropsCacheFile = {
  date: string;
  quota: QuotaSnapshot | null;
  leagues: Record<PropsLeague, LeaguePropsCache>;
};

type DailyPropOddsResult = {
  events: Map<string, OddsEvent | null>;
  source: PropOddsSource;
  quota: QuotaSnapshot | null;
  requestedCount: number;
  availableCount: number;
};

const inMemoryDailyPropsCache = new Map<string, DailyPropsCacheFile>();

const SPORT_CONFIG: Record<PropsLeague, { sportKey: string; markets: string }> = {
  NHL: {
    sportKey: "icehockey_nhl",
    markets: NHL_PLAYER_PROP_MARKETS,
  },
  NBA: {
    sportKey: "basketball_nba",
    markets: NBA_PLAYER_PROP_MARKETS,
  },
  MLB: {
    sportKey: "baseball_mlb",
    markets: MLB_PLAYER_PROP_MARKETS,
  },
  NFL: {
    sportKey: "americanfootball_nfl",
    markets: NFL_PLAYER_PROP_MARKETS,
  },
};

function emptyLeagueCache(): LeaguePropsCache {
  return {
    blockedAt: null,
    fetchedAt: null,
    events: {},
  };
}

function buildEmptyCache(date: string): DailyPropsCacheFile {
  return {
    date,
    quota: null,
    leagues: {
      NHL: emptyLeagueCache(),
      NBA: emptyLeagueCache(),
      MLB: emptyLeagueCache(),
      NFL: emptyLeagueCache(),
    },
  };
}

function getCachePath(date: string) {
  return path.join(DATA_DIR, `daily-props-${date}.json`);
}

function parseHeaderNumber(value: string | null) {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEventIds(eventIds: Array<string | undefined | null>) {
  return Array.from(new Set(
    eventIds
      .map((eventId) => String(eventId || "").trim())
      .filter(Boolean)
      .filter((eventId) => !isSyntheticAggregatedEventId(eventId)),
  ));
}

function normalizeDailyPropsCache(date: string, parsed?: Partial<DailyPropsCacheFile> | null) {
  if (!parsed || parsed.date !== date) return buildEmptyCache(date);

  return {
    date,
    quota: parsed.quota ?? null,
    leagues: {
      NHL: {
        blockedAt: parsed.leagues?.NHL?.blockedAt ?? null,
        fetchedAt: parsed.leagues?.NHL?.fetchedAt ?? null,
        events: parsed.leagues?.NHL?.events ?? {},
      },
      NBA: {
        blockedAt: parsed.leagues?.NBA?.blockedAt ?? null,
        fetchedAt: parsed.leagues?.NBA?.fetchedAt ?? null,
        events: parsed.leagues?.NBA?.events ?? {},
      },
      MLB: {
        blockedAt: parsed.leagues?.MLB?.blockedAt ?? null,
        fetchedAt: parsed.leagues?.MLB?.fetchedAt ?? null,
        events: parsed.leagues?.MLB?.events ?? {},
      },
      NFL: {
        blockedAt: parsed.leagues?.NFL?.blockedAt ?? null,
        fetchedAt: parsed.leagues?.NFL?.fetchedAt ?? null,
        events: parsed.leagues?.NFL?.events ?? {},
      },
    },
  } satisfies DailyPropsCacheFile;
}

async function readDailyPropsCache(date: string) {
  const inMemory = inMemoryDailyPropsCache.get(date);
  if (inMemory) return normalizeDailyPropsCache(date, inMemory);

  try {
    const raw = await readFile(getCachePath(date), "utf8");
    const parsed = JSON.parse(raw) as Partial<DailyPropsCacheFile> | null;
    const normalized = normalizeDailyPropsCache(date, parsed);
    inMemoryDailyPropsCache.set(date, normalized);
    return normalized;
  } catch {
    const empty = buildEmptyCache(date);
    inMemoryDailyPropsCache.set(date, empty);
    return empty;
  }
}

async function writeDailyPropsCache(cache: DailyPropsCacheFile) {
  inMemoryDailyPropsCache.set(cache.date, cache);

  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(getCachePath(cache.date), JSON.stringify(cache, null, 2), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("EROFS") || message.toLowerCase().includes("read-only")) {
      console.warn("[props-cache] filesystem cache unavailable, using in-memory cache", { message });
      return;
    }
    throw error;
  }
}

async function probeOddsApiQuota() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return null;
  }

  try {
    const response = await fetch(`${ODDS_API_BASE}/sports/?apiKey=${apiKey}`, {
      cache: "no-store",
    });

    return {
      checkedAt: new Date().toISOString(),
      remaining: parseHeaderNumber(response.headers.get("x-requests-remaining")),
      used: parseHeaderNumber(response.headers.get("x-requests-used")),
      lastCost: parseHeaderNumber(response.headers.get("x-requests-last")),
    } satisfies QuotaSnapshot;
  } catch (error) {
    console.warn("[props-cache] quota probe failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchPropOddsEvent(league: PropsLeague, eventId: string) {
  const apiKey = process.env.ODDS_API_KEY;
  const config = SPORT_CONFIG[league];

  if (!apiKey || apiKey === "your_key_here") {
    return {
      eventId,
      data: null,
      quota: null,
    };
  }

  try {
    const url = `${ODDS_API_BASE}/sports/${config.sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${config.markets}&oddsFormat=american`;
    const response = await fetch(url, {
      next: { revalidate: 900 },
    });

    const quota = {
      checkedAt: new Date().toISOString(),
      remaining: parseHeaderNumber(response.headers.get("x-requests-remaining")),
      used: parseHeaderNumber(response.headers.get("x-requests-used")),
      lastCost: parseHeaderNumber(response.headers.get("x-requests-last")),
    } satisfies QuotaSnapshot;

    if (!response.ok) {
      console.warn("[props-cache] event fetch failed", {
        league,
        eventId,
        status: response.status,
      });
      return { eventId, data: null, quota };
    }

    const data = await response.json() as OddsEvent;
    return {
      eventId,
      data: Array.isArray(data?.bookmakers) && data.bookmakers.length > 0 ? data : null,
      quota,
    };
  } catch (error) {
    console.warn("[props-cache] event fetch error", {
      league,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      eventId,
      data: null,
      quota: null,
    };
  }
}

function buildResult(eventIds: string[], source: PropOddsSource, cache: DailyPropsCacheFile, league: PropsLeague): DailyPropOddsResult {
  const leagueCache = cache.leagues[league];
  const events = new Map<string, OddsEvent | null>();

  for (const eventId of eventIds) {
    events.set(eventId, leagueCache.events[eventId] ?? null);
  }

  return {
    events,
    source,
    quota: cache.quota,
    requestedCount: eventIds.length,
    availableCount: Array.from(events.values()).filter(Boolean).length,
  };
}

export async function getDailyPlayerPropOddsEvents(
  league: PropsLeague,
  eventIds: Array<string | undefined | null>,
): Promise<DailyPropOddsResult> {
  const normalizedIds = normalizeEventIds(eventIds);
  if (!normalizedIds.length) {
    return {
      events: new Map(),
      source: "cache",
      quota: null,
      requestedCount: 0,
      availableCount: 0,
    };
  }

  const date = getDateKey();
  const cache = await readDailyPropsCache(date);
  const leagueCache = cache.leagues[league];
  const missingIds = normalizedIds.filter((eventId) => !(eventId in leagueCache.events));

  if (missingIds.length === 0) {
    return buildResult(normalizedIds, "cache", cache, league);
  }

  if (leagueCache.blockedAt) {
    return buildResult(normalizedIds, "quota-blocked", cache, league);
  }

  if (leagueCache.fetchedAt) {
    return buildResult(normalizedIds, "cache", cache, league);
  }

  // quota probe disabled — costs 1 req/call; check manually via /api/odds/health if needed
  // cache.quota = await probeOddsApiQuota();
  const remainingQuota = cache.quota?.remaining;
  if (remainingQuota !== null && remainingQuota !== undefined && remainingQuota < 50) {
    leagueCache.blockedAt = new Date().toISOString();
    await writeDailyPropsCache(cache);
    return buildResult(normalizedIds, "quota-blocked", cache, league);
  }

  const responses = await Promise.all(missingIds.map((eventId) => fetchPropOddsEvent(league, eventId)));
  for (const response of responses) {
    leagueCache.events[response.eventId] = response.data;
    if (response.quota && response.quota.remaining !== null) {
      cache.quota = response.quota;
    }
  }

  leagueCache.fetchedAt = new Date().toISOString();
  leagueCache.blockedAt = null;
  await writeDailyPropsCache(cache);

  return buildResult(normalizedIds, "fresh", cache, league);
}

export async function getDailyPlayerPropOddsEvent(league: PropsLeague, eventId?: string | null) {
  if (!eventId) return null;
  const result = await getDailyPlayerPropOddsEvents(league, [eventId]);
  return result.events.get(eventId) ?? null;
}
