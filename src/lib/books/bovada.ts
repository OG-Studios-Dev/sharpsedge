import { buildAggregatedGameId, getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import { extractBovadaMLBF5Odds } from "@/lib/books/mlb-f5-augment";
import type { AggregatedSport, BookEventOdds } from "@/lib/books/types";
import { isoNow, makeEmptyBookOdds, normalizeAmericanOdds, toNumber } from "@/lib/books/utils";

const BASE_URL = "https://www.bovada.lv/services/sports/event/coupon/events/A/description";

const PATHS: Partial<Record<AggregatedSport, string>> = {
  NBA: "/basketball/nba?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
  NHL: "/hockey/nhl?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
  MLB: "/baseball/mlb?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
  EPL: "/soccer/english-premier-league?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
  SERIE_A: "/soccer/italian-serie-a?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
  NFL: "/football/nfl?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
  PGA: "/golf?marketFilterId=def&preMatchOnly=true&eventsLimit=50&lang=en",
};

function getTeams(event: any, sport: AggregatedSport) {
  const competitors = Array.isArray(event?.competitors) ? event.competitors : [];
  const home = competitors.find((entry: any) => entry?.home === true || entry?.type === "HOME") ?? competitors[0];
  const away = competitors.find((entry: any) => entry?.home === false || entry?.type === "AWAY") ?? competitors[1];
  const homeName = String(home?.name || "").trim();
  const awayName = String(away?.name || "").trim();

  if (homeName && awayName) {
    return { homeName, awayName };
  }

  const description = String(event?.description || "").trim();
  const match = description.match(/(.+?)\s+@\s+(.+)/);
  if (match) {
    return {
      awayName: match[1].trim(),
      homeName: match[2].trim(),
    };
  }

  const normalizedHome = normalizeTeamName(String(home?.abbreviation || ""), sport);
  const normalizedAway = normalizeTeamName(String(away?.abbreviation || ""), sport);
  if (normalizedHome && normalizedAway) {
    return {
      homeName: getCanonicalTeamName(normalizedHome, sport),
      awayName: getCanonicalTeamName(normalizedAway, sport),
    };
  }

  return null;
}

function findOutcomeName(outcome: any) {
  return String(outcome?.description || outcome?.name || outcome?.competitor || "").trim();
}

function parseEvent(event: any, sport: AggregatedSport): BookEventOdds | null {
  const teams = getTeams(event, sport);
  if (!teams) return null;

  const homeAbbrev = normalizeTeamName(teams.homeName, sport);
  const awayAbbrev = normalizeTeamName(teams.awayName, sport);
  if (!isKnownSportTeam(homeAbbrev, sport) || !isKnownSportTeam(awayAbbrev, sport)) {
    return null;
  }

  const lastUpdated = String(event?.updatedAt || event?.startTime || isoNow());
  const odds = makeEmptyBookOdds("Bovada", lastUpdated);

  for (const displayGroup of event?.displayGroups || []) {
    for (const market of displayGroup?.markets || []) {
      const description = String(market?.description || market?.type || "").toLowerCase();
      const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];

      if (description.includes("moneyline") || description.includes("money line")) {
        for (const outcome of outcomes) {
          const name = findOutcomeName(outcome);
          const price = normalizeAmericanOdds(outcome?.price?.american ?? outcome?.american);
          const normalized = normalizeTeamName(name, sport);
          if (normalized === homeAbbrev) odds.homeML = price;
          if (normalized === awayAbbrev) odds.awayML = price;
        }
      }

      if (
        description.includes("spread")
        || description.includes("run line")
        || description.includes("puck line")
      ) {
        for (const outcome of outcomes) {
          const name = findOutcomeName(outcome);
          const normalized = normalizeTeamName(name, sport);
          const line = toNumber(outcome?.price?.handicap ?? outcome?.handicap ?? outcome?.point);
          const price = normalizeAmericanOdds(outcome?.price?.american ?? outcome?.american);
          if (normalized === homeAbbrev) {
            odds.spread = line;
            odds.spreadOdds = price;
            odds.homeSpread = line;
            odds.homeSpreadOdds = price;
          }
          if (normalized === awayAbbrev) {
            odds.awaySpread = line;
            odds.awaySpreadOdds = price;
          }
        }
      }

      if (description.includes("total")) {
        for (const outcome of outcomes) {
          const label = findOutcomeName(outcome).toLowerCase();
          const line = toNumber(outcome?.price?.handicap ?? outcome?.handicap ?? outcome?.point);
          const price = normalizeAmericanOdds(outcome?.price?.american ?? outcome?.american);
          if (label.includes("over")) {
            odds.total = line ?? odds.total;
            odds.overOdds = price;
          }
          if (label.includes("under")) {
            odds.total = line ?? odds.total;
            odds.underOdds = price;
          }
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

  const commenceTime = String(event?.startTime || event?.startTimeUTC || "").trim() || null;

  return {
    gameId: buildAggregatedGameId(sport, homeAbbrev, awayAbbrev, commenceTime),
    sourceEventId: String(event?.id || event?.link || `${awayAbbrev}@${homeAbbrev}`),
    sport,
    book: "Bovada",
    homeTeam: getCanonicalTeamName(homeAbbrev, sport),
    awayTeam: getCanonicalTeamName(awayAbbrev, sport),
    homeAbbrev,
    awayAbbrev,
    commenceTime,
    odds,
  };
}

export async function fetchOdds(sport: AggregatedSport): Promise<BookEventOdds[]> {
  const path = PATHS[sport];
  if (!path) return [];

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error(`Bovada ${sport} error ${res.status}`);
    const payload = await res.json();
    const events = Array.isArray(payload)
      ? payload.flatMap((entry: any) => entry?.events || [])
      : Array.isArray(payload?.events)
        ? payload.events
        : [];

    return events.flatMap((event: any) => {
      const base = parseEvent(event, sport);
      const extras = sport === "MLB" ? extractBovadaMLBF5Odds(event) : [];
      return [base, ...extras].filter((entry: BookEventOdds | null): entry is BookEventOdds => Boolean(entry));
    });
  } catch {
    return [];
  }
}
