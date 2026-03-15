import { buildAggregatedGameId, getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import type { AggregatedSport, BookEventOdds } from "@/lib/books/types";
import { decimalToAmerican, isoNow, makeEmptyBookOdds, toNumber } from "@/lib/books/utils";

const BASE_URL = "https://api.pointsbet.com/api/v2/competitions";

const PATHS: Partial<Record<AggregatedSport, string>> = {
  NBA: "/7176/events/featured?includeLive=false",
  NHL: "/7160/events/featured?includeLive=false",
  MLB: "/7594/events/featured?includeLive=false",
};

function marketName(market: any) {
  return String(market?.name || market?.eventClass || market?.groupByHeader || market?.header || "").toLowerCase();
}

function outcomeLabel(outcome: any) {
  return String(outcome?.name || outcome?.runnerName || outcome?.description || "").trim();
}

function parseEvent(event: any, sport: AggregatedSport): BookEventOdds | null {
  const homeName = String(event?.homeTeam || event?.homeTeamName || event?.home || "").trim();
  const awayName = String(event?.awayTeam || event?.awayTeamName || event?.away || "").trim();
  const homeAbbrev = normalizeTeamName(homeName, sport);
  const awayAbbrev = normalizeTeamName(awayName, sport);

  if (!isKnownSportTeam(homeAbbrev, sport) || !isKnownSportTeam(awayAbbrev, sport)) {
    return null;
  }

  const odds = makeEmptyBookOdds("PointsBet", String(event?.updatedAt || event?.startsAt || isoNow()));
  for (const market of event?.fixedOddsMarkets || []) {
    const name = marketName(market);
    const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];

    if ((name.includes("moneyline") || name.includes("match result")) && outcomes.length >= 2) {
      for (const outcome of outcomes) {
        const normalized = normalizeTeamName(outcomeLabel(outcome), sport);
        const american = decimalToAmerican(toNumber(outcome?.price));
        if (normalized === homeAbbrev) odds.homeML = american;
        if (normalized === awayAbbrev) odds.awayML = american;
      }
    }

    if ((name.includes("spread") || name.includes("run line") || name.includes("puck line")) && outcomes.length >= 2) {
      for (const outcome of outcomes) {
        const normalized = normalizeTeamName(outcomeLabel(outcome), sport);
        const line = toNumber(outcome?.points ?? outcome?.line);
        const american = decimalToAmerican(toNumber(outcome?.price));
        if (normalized === homeAbbrev) {
          odds.spread = line;
          odds.spreadOdds = american;
          odds.homeSpread = line;
          odds.homeSpreadOdds = american;
        }
        if (normalized === awayAbbrev) {
          odds.awaySpread = line;
          odds.awaySpreadOdds = american;
        }
      }
    }

    if ((name.includes("total") || name.includes("over/under")) && outcomes.length >= 2) {
      for (const outcome of outcomes) {
        const label = outcomeLabel(outcome).toLowerCase();
        const line = toNumber(outcome?.points ?? outcome?.line);
        const american = decimalToAmerican(toNumber(outcome?.price));
        if (label.includes("over")) {
          odds.total = line ?? odds.total;
          odds.overOdds = american;
        }
        if (label.includes("under")) {
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

  const commenceTime = String(event?.startsAt || event?.startTime || "").trim() || null;

  return {
    gameId: buildAggregatedGameId(sport, homeAbbrev, awayAbbrev, commenceTime),
    sourceEventId: String(event?.key || event?.id || `${awayAbbrev}@${homeAbbrev}`),
    sport,
    book: "PointsBet",
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
    if (!res.ok) throw new Error(`PointsBet ${sport} error ${res.status}`);
    const payload = await res.json();
    const events = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [];
    return events
      .map((event: any) => parseEvent(event, sport))
      .filter((entry: BookEventOdds | null): entry is BookEventOdds => Boolean(entry));
  } catch {
    return [];
  }
}
