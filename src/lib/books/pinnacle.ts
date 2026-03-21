import { buildAggregatedGameId, getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import type { AggregatedSport, BookEventOdds } from "@/lib/books/types";
import { isoNow, makeEmptyBookOdds, normalizeAmericanOdds, toNumber } from "@/lib/books/utils";

const API_BASE = "https://guest.api.arcadia.pinnacle.com/0.1";
const CONFIG_URL = "https://www.pinnacle.com/config/app.json";

const LEAGUE_IDS: Partial<Record<AggregatedSport, number>> = {
  NBA: 487,
  NHL: 1456,
  MLB: 246,
  NFL: 889,
  EPL: 1980,
  SERIE_A: 2436,
  PGA: 1096,
};

let appKeyCache: { value: string | null; timestamp: number } | null = null;

async function getApiKey() {
  if (appKeyCache && Date.now() - appKeyCache.timestamp < 15 * 60 * 1000) {
    return appKeyCache.value;
  }

  try {
    const res = await fetch(CONFIG_URL, { next: { revalidate: 900 } });
    if (!res.ok) throw new Error(`Pinnacle config error ${res.status}`);
    const payload = await res.json();
    const key = String(payload?.apiKey || payload?.api?.key || "").trim() || null;
    appKeyCache = { value: key, timestamp: Date.now() };
    return key;
  } catch {
    appKeyCache = { value: null, timestamp: Date.now() };
    return null;
  }
}

function headers(apiKey: string): HeadersInit {
  return {
    Accept: "application/json",
    "X-API-Key": apiKey,
  };
}

function getParticipants(matchup: any, sport: AggregatedSport) {
  const participants = Array.isArray(matchup?.participants) ? matchup.participants : [];
  const home = participants.find((entry: any) => entry?.alignment === "home" || entry?.side === "home");
  const away = participants.find((entry: any) => entry?.alignment === "away" || entry?.side === "away");
  const homeName = String(home?.name || "").trim();
  const awayName = String(away?.name || "").trim();
  const homeAbbrev = normalizeTeamName(homeName, sport);
  const awayAbbrev = normalizeTeamName(awayName, sport);
  if (!isKnownSportTeam(homeAbbrev, sport) || !isKnownSportTeam(awayAbbrev, sport)) {
    return null;
  }

  return {
    homeAbbrev,
    awayAbbrev,
  };
}

function parseMarkets(matchup: any, marketsPayload: any, sport: AggregatedSport): BookEventOdds | null {
  const participants = getParticipants(matchup, sport);
  if (!participants) return null;

  const odds = makeEmptyBookOdds("Pinnacle", String(matchup?.lastUpdated || matchup?.startTime || isoNow()));
  const markets = Array.isArray(marketsPayload) ? marketsPayload : Array.isArray(marketsPayload?.markets) ? marketsPayload.markets : [];

  for (const market of markets) {
    const period = Number(market?.period ?? 0);
    if (Number.isFinite(period) && period !== 0) continue;

    const type = String(market?.type || market?.marketType || "").toLowerCase();
    const prices = Array.isArray(market?.prices) ? market.prices : [];

    if (type.includes("moneyline")) {
      for (const price of prices) {
        const designation = String(price?.designation || price?.side || "").toLowerCase();
        const american = normalizeAmericanOdds(price?.price);
        if (designation === "home") odds.homeML = american;
        if (designation === "away") odds.awayML = american;
      }
    }

    if (type.includes("spread")) {
      for (const price of prices) {
        const designation = String(price?.designation || price?.side || "").toLowerCase();
        const line = toNumber(price?.points ?? price?.line);
        const american = normalizeAmericanOdds(price?.price);
        if (designation === "home") {
          odds.spread = line;
          odds.spreadOdds = american;
          odds.homeSpread = line;
          odds.homeSpreadOdds = american;
        }
        if (designation === "away") {
          odds.awaySpread = line;
          odds.awaySpreadOdds = american;
        }
      }
    }

    if (type.includes("total")) {
      for (const price of prices) {
        const designation = String(price?.designation || price?.side || "").toLowerCase();
        const line = toNumber(price?.points ?? price?.line);
        const american = normalizeAmericanOdds(price?.price);
        if (designation === "over") {
          odds.total = line ?? odds.total;
          odds.overOdds = american;
        }
        if (designation === "under") {
          odds.total = line ?? odds.total;
          odds.underOdds = american;
        }
      }
    }
  }

  if (
    odds.homeML === null
    && odds.awayML === null
    && odds.homeSpread === null
    && odds.total === null
  ) {
    return null;
  }

  const commenceTime = String(matchup?.startTime || matchup?.startDate || "").trim() || null;

  return {
    gameId: buildAggregatedGameId(sport, participants.homeAbbrev, participants.awayAbbrev, commenceTime),
    sourceEventId: String(matchup?.id || `${participants.awayAbbrev}@${participants.homeAbbrev}`),
    sport,
    book: "Pinnacle",
    homeTeam: getCanonicalTeamName(participants.homeAbbrev, sport),
    awayTeam: getCanonicalTeamName(participants.awayAbbrev, sport),
    homeAbbrev: participants.homeAbbrev,
    awayAbbrev: participants.awayAbbrev,
    commenceTime,
    odds,
  };
}

export async function fetchOdds(sport: AggregatedSport): Promise<BookEventOdds[]> {
  const leagueId = LEAGUE_IDS[sport];
  if (!leagueId) return [];

  try {
    const apiKey = await getApiKey();
    const hdrs = apiKey ? headers(apiKey) : { Accept: "application/json" };

    const matchupsRes = await fetch(`${API_BASE}/leagues/${leagueId}/matchups`, {
      headers: hdrs,
      next: { revalidate: 900 },
    });
    if (!matchupsRes.ok) throw new Error(`Pinnacle ${sport} matchups error ${matchupsRes.status}`);
    const matchupsPayload = await matchupsRes.json();
    const matchups = (Array.isArray(matchupsPayload) ? matchupsPayload : []).filter(
      (matchup: any) => !matchup?.isLive && matchup?.type === "matchup" && Array.isArray(matchup?.participants) && matchup.participants.length === 2,
    );

    const parsed = await Promise.all(
      matchups.map(async (matchup: any) => {
        try {
          const marketsRes = await fetch(`${API_BASE}/matchups/${matchup.id}/markets/related/straight`, {
            headers: hdrs,
            next: { revalidate: 900 },
          });
          if (!marketsRes.ok) return null;
          const marketsPayload = await marketsRes.json();
          return parseMarkets(matchup, marketsPayload, sport);
        } catch {
          return null;
        }
      }),
    );

    return parsed.filter((entry: BookEventOdds | null): entry is BookEventOdds => Boolean(entry));
  } catch {
    return [];
  }
}
