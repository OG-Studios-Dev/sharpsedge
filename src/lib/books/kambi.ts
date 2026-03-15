import { buildAggregatedGameId, getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import type { AggregatedSport, BookEventOdds } from "@/lib/books/types";
import { decimalToAmerican, isoNow, makeEmptyBookOdds, toNumber } from "@/lib/books/utils";

const BASE_URL = "https://eu-offering-api.kambicdn.com/offering/v2018/ub/listView";

const PATHS: Partial<Record<AggregatedSport, string>> = {
  NBA: "/basketball/nba.json?lang=en_US&market=US",
  NHL: "/ice_hockey/nhl.json?lang=en_US&market=US",
  MLB: "/baseball/mlb.json?lang=en_US&market=US",
  PGA: "/golf.json?lang=en_US&market=US",
};

function normalizeKambiLine(value: unknown) {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) > 50 ? parsed / 1000 : parsed;
}

function buildEventMap(payload: any) {
  const map = new Map<number, any>();
  for (const event of payload?.events || []) {
    if (typeof event?.id === "number") map.set(event.id, event);
  }
  for (const event of Object.values(payload?.eventsById || {}) as any[]) {
    const typed = event as { id?: number };
    if (typeof typed?.id === "number") map.set(typed.id, event);
  }
  return map;
}

function getEventName(event: any, side: "home" | "away") {
  return String(
    event?.[side === "home" ? "homeName" : "awayName"]
    || event?.[side === "home" ? "home" : "away"]
    || event?.competitors?.[side]?.name
    || "",
  ).trim();
}

function getOutcomeLabel(outcome: any) {
  return String(outcome?.label || outcome?.name || outcome?.participant || outcome?.description || "").trim();
}

function parseOffer(odds: ReturnType<typeof makeEmptyBookOdds>, offer: any, homeAbbrev: string, awayAbbrev: string, sport: AggregatedSport) {
  const offerName = String(
    offer?.betOfferType?.name
    || offer?.criterion?.label
    || offer?.name
    || "",
  ).toLowerCase();
  const outcomes = Array.isArray(offer?.outcomes) ? offer.outcomes : [];
  const line = normalizeKambiLine(
    offer?.criterion?.value
    ?? offer?.line
    ?? outcomes.find((outcome: any) => outcome?.line != null)?.line
    ?? outcomes.find((outcome: any) => outcome?.points != null)?.points,
  );

  if ((offerName.includes("match") || offerName.includes("moneyline")) && outcomes.length >= 2) {
    for (const outcome of outcomes) {
      const label = getOutcomeLabel(outcome);
      const normalized = normalizeTeamName(label, sport);
      const american = decimalToAmerican(toNumber(outcome?.odds) !== null ? Number(outcome.odds) / 1000 : null);
      if (normalized === homeAbbrev) odds.homeML = american;
      if (normalized === awayAbbrev) odds.awayML = american;
    }
  }

  if ((offerName.includes("handicap") || offerName.includes("spread")) && outcomes.length >= 2) {
    for (const outcome of outcomes) {
      const label = getOutcomeLabel(outcome);
      const normalized = normalizeTeamName(label, sport);
      const outcomeLine = normalizeKambiLine(outcome?.line ?? outcome?.points ?? line);
      const american = decimalToAmerican(toNumber(outcome?.odds) !== null ? Number(outcome.odds) / 1000 : null);
      if (normalized === homeAbbrev) {
        odds.spread = outcomeLine;
        odds.spreadOdds = american;
        odds.homeSpread = outcomeLine;
        odds.homeSpreadOdds = american;
      }
      if (normalized === awayAbbrev) {
        odds.awaySpread = outcomeLine;
        odds.awaySpreadOdds = american;
      }
    }
  }

  if ((offerName.includes("over/under") || offerName.includes("total")) && outcomes.length >= 2) {
    for (const outcome of outcomes) {
      const label = getOutcomeLabel(outcome).toLowerCase();
      const american = decimalToAmerican(toNumber(outcome?.odds) !== null ? Number(outcome.odds) / 1000 : null);
      const outcomeLine = normalizeKambiLine(outcome?.line ?? outcome?.points ?? line);
      if (label.includes("over")) {
        odds.total = outcomeLine ?? odds.total;
        odds.overOdds = american;
      }
      if (label.includes("under")) {
        odds.total = outcomeLine ?? odds.total;
        odds.underOdds = american;
      }
    }
  }
}

function parseEvent(entry: any, eventMap: Map<number, any>, sport: AggregatedSport): BookEventOdds | null {
  const eventId = typeof entry?.event?.id === "number" ? entry.event.id : typeof entry?.eventId === "number" ? entry.eventId : null;
  const event = (eventId !== null ? eventMap.get(eventId) : null) || entry?.event || entry;
  const homeName = getEventName(event, "home");
  const awayName = getEventName(event, "away");
  const homeAbbrev = normalizeTeamName(homeName, sport);
  const awayAbbrev = normalizeTeamName(awayName, sport);

  if (!isKnownSportTeam(homeAbbrev, sport) || !isKnownSportTeam(awayAbbrev, sport)) {
    return null;
  }

  const lastUpdated = String(entry?.updatedAt || event?.start || isoNow());
  const odds = makeEmptyBookOdds("Kambi", lastUpdated);

  for (const offer of entry?.betOffers || []) {
    parseOffer(odds, offer, homeAbbrev, awayAbbrev, sport);
  }

  if (
    odds.homeML === null
    && odds.awayML === null
    && odds.homeSpread === null
    && odds.total === null
  ) {
    return null;
  }

  const commenceTime = String(event?.start || entry?.event?.start || "").trim() || null;

  return {
    gameId: buildAggregatedGameId(sport, homeAbbrev, awayAbbrev, commenceTime),
    sourceEventId: String(eventId ?? event?.id ?? `${awayAbbrev}@${homeAbbrev}`),
    sport,
    book: "Kambi",
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
    if (!res.ok) throw new Error(`Kambi ${sport} error ${res.status}`);
    const payload = await res.json();
    const eventMap = buildEventMap(payload);
    const entries = Array.isArray(payload?.events)
      ? payload.events
      : Array.isArray(payload?.eventGroups)
        ? payload.eventGroups.flatMap((group: any) => group?.events || [])
        : [];

    return entries
      .map((entry: any) => parseEvent(entry, eventMap, sport))
      .filter((entry: BookEventOdds | null): entry is BookEventOdds => Boolean(entry));
  } catch {
    return [];
  }
}
