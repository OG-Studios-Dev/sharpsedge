import { buildAggregatedGameId, getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import type { AggregatedSport, BookEventOdds } from "@/lib/books/types";
import { isoNow, makeEmptyBookOdds, normalizeAmericanOdds, parseSpreadDetails, toNumber } from "@/lib/books/utils";

const ESPN_ENDPOINTS: Partial<Record<AggregatedSport, string>> = {
  NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  NHL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
  MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
};

function dateStamp(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function parseEvent(event: any, sport: AggregatedSport): BookEventOdds | null {
  const competition = event?.competitions?.[0];
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const home = competitors.find((entry: any) => entry?.homeAway === "home") ?? competitors[0];
  const away = competitors.find((entry: any) => entry?.homeAway === "away") ?? competitors[1];
  const oddsData = competition?.odds?.[0];

  const homeName = String(home?.team?.displayName || home?.team?.shortDisplayName || home?.team?.name || "").trim();
  const awayName = String(away?.team?.displayName || away?.team?.shortDisplayName || away?.team?.name || "").trim();
  const homeAbbrev = normalizeTeamName(homeName || home?.team?.abbreviation || "", sport);
  const awayAbbrev = normalizeTeamName(awayName || away?.team?.abbreviation || "", sport);

  if (!isKnownSportTeam(homeAbbrev, sport) || !isKnownSportTeam(awayAbbrev, sport)) {
    return null;
  }

  const book = String(oddsData?.provider?.name || "DraftKings").trim() || "DraftKings";
  const lastUpdated = String(oddsData?.provider?.lastUpdated || oddsData?.lastUpdated || isoNow());
  const spreadFromDetails = parseSpreadDetails(String(oddsData?.details || ""), homeName, awayName);
  const homeSpread = toNumber(oddsData?.homeTeamOdds?.spread) ?? spreadFromDetails?.homeSpread ?? null;
  const awaySpread = toNumber(oddsData?.awayTeamOdds?.spread) ?? spreadFromDetails?.awaySpread ?? null;
  const total = toNumber(oddsData?.overUnder);
  const overOdds = normalizeAmericanOdds(
    oddsData?.overOdds
    ?? oddsData?.over?.odds
    ?? oddsData?.overOutcome?.odds
    ?? oddsData?.overUnderOdds?.over,
  );
  const underOdds = normalizeAmericanOdds(
    oddsData?.underOdds
    ?? oddsData?.under?.odds
    ?? oddsData?.underOutcome?.odds
    ?? oddsData?.overUnderOdds?.under,
  );

  const odds = {
    ...makeEmptyBookOdds(book, lastUpdated),
    homeML: normalizeAmericanOdds(oddsData?.homeTeamOdds?.moneyLine),
    awayML: normalizeAmericanOdds(oddsData?.awayTeamOdds?.moneyLine),
    spread: homeSpread,
    spreadOdds: normalizeAmericanOdds(oddsData?.homeTeamOdds?.spreadOdds),
    homeSpread,
    homeSpreadOdds: normalizeAmericanOdds(oddsData?.homeTeamOdds?.spreadOdds),
    awaySpread,
    awaySpreadOdds: normalizeAmericanOdds(oddsData?.awayTeamOdds?.spreadOdds),
    total,
    overOdds,
    underOdds,
  };

  if (
    odds.homeML === null
    && odds.awayML === null
    && odds.homeSpread === null
    && odds.total === null
  ) {
    return null;
  }

  const commenceTime = String(event?.date || competition?.date || "").trim() || null;

  return {
    gameId: buildAggregatedGameId(sport, homeAbbrev, awayAbbrev, commenceTime),
    sourceEventId: String(event?.id || competition?.id || `${awayAbbrev}@${homeAbbrev}`),
    sport,
    book,
    homeTeam: getCanonicalTeamName(homeAbbrev, sport),
    awayTeam: getCanonicalTeamName(awayAbbrev, sport),
    homeAbbrev,
    awayAbbrev,
    commenceTime,
    odds,
  };
}

export async function fetchOdds(sport: AggregatedSport): Promise<BookEventOdds[]> {
  const endpoint = ESPN_ENDPOINTS[sport];
  if (!endpoint) return [];

  try {
    const responses = await Promise.all(
      [0, 1].map(async (offset) => {
        const res = await fetch(`${endpoint}?dates=${dateStamp(offset)}`, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`ESPN ${sport} error ${res.status}`);
        return await res.json();
      }),
    );

    return responses
      .flatMap((payload: any) => payload?.events || [])
      .map((event: any) => parseEvent(event, sport))
      .filter((entry: BookEventOdds | null): entry is BookEventOdds => Boolean(entry));
  } catch {
    return [];
  }
}
