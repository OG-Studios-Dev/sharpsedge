import { getCanonicalTeamName, isKnownSportTeam, normalizeTeamName } from "@/lib/books/team-mappings";
import type { BookEventOdds } from "@/lib/books/types";
import { decimalToAmerican, makeEmptyBookOdds, toNumber } from "@/lib/books/utils";

function outcomeName(outcome: any) {
  return String(outcome?.description || outcome?.name || outcome?.runnerName || outcome?.label || outcome?.participant || "").trim();
}

function marketName(value: any) {
  return String(value || "").toLowerCase();
}

export function buildMLBF5BookEventOdds(input: {
  sport: "MLB";
  book: string;
  homeName: string;
  awayName: string;
  commenceTime: string | null;
  sourceEventId: string;
  lastUpdated?: string | null;
  moneyline?: { home?: number | null; away?: number | null } | null;
  total?: { line?: number | null; overOdds?: number | null; underOdds?: number | null } | null;
}): BookEventOdds | null {
  const homeAbbrev = normalizeTeamName(input.homeName, input.sport);
  const awayAbbrev = normalizeTeamName(input.awayName, input.sport);
  if (!isKnownSportTeam(homeAbbrev, input.sport) || !isKnownSportTeam(awayAbbrev, input.sport)) return null;

  const odds = makeEmptyBookOdds(input.book, input.lastUpdated || new Date().toISOString());
  odds.homeML = input.moneyline?.home ?? null;
  odds.awayML = input.moneyline?.away ?? null;
  odds.total = input.total?.line ?? null;
  odds.overOdds = input.total?.overOdds ?? null;
  odds.underOdds = input.total?.underOdds ?? null;

  return {
    gameId: `MLB:${awayAbbrev}@${homeAbbrev}:${input.commenceTime || "na"}:f5`,
    sourceEventId: input.sourceEventId,
    sport: input.sport,
    book: input.book,
    homeTeam: getCanonicalTeamName(homeAbbrev, input.sport),
    awayTeam: getCanonicalTeamName(awayAbbrev, input.sport),
    homeAbbrev,
    awayAbbrev,
    commenceTime: input.commenceTime,
    odds,
  };
}

export function extractBovadaMLBF5Odds(event: any): BookEventOdds[] {
  const competitors = Array.isArray(event?.competitors) ? event.competitors : [];
  const home = competitors.find((entry: any) => entry?.home === true || entry?.type === "HOME") ?? competitors[0];
  const away = competitors.find((entry: any) => entry?.home === false || entry?.type === "AWAY") ?? competitors[1];
  const homeName = String(home?.name || "").trim();
  const awayName = String(away?.name || "").trim();
  if (!homeName || !awayName) return [];

  const outputs: BookEventOdds[] = [];
  for (const displayGroup of event?.displayGroups || []) {
    for (const market of displayGroup?.markets || []) {
      const description = marketName(market?.description || market?.type);
      const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
      if (!description.includes("first 5") && !description.includes("1st 5")) continue;

      if (description.includes("moneyline") || description.includes("money line")) {
        const moneyline: { home?: number | null; away?: number | null } = {};
        for (const outcome of outcomes) {
          const name = normalizeTeamName(outcomeName(outcome), "MLB");
          const price = toNumber(outcome?.price?.american ?? outcome?.american);
          if (name && homeName && name === normalizeTeamName(homeName, "MLB")) moneyline.home = price;
          if (name && awayName && name === normalizeTeamName(awayName, "MLB")) moneyline.away = price;
        }
        const built = buildMLBF5BookEventOdds({
          sport: "MLB",
          book: "Bovada",
          homeName,
          awayName,
          commenceTime: String(event?.startTime || event?.startTimeUTC || "").trim() || null,
          sourceEventId: String(event?.id || `${awayName}@${homeName}`),
          lastUpdated: String(event?.updatedAt || new Date().toISOString()),
          moneyline,
        });
        if (built) outputs.push(built);
      }

      if (description.includes("total")) {
        const total: { line?: number | null; overOdds?: number | null; underOdds?: number | null } = {};
        for (const outcome of outcomes) {
          const label = outcomeName(outcome).toLowerCase();
          total.line = total.line ?? toNumber(outcome?.price?.handicap ?? outcome?.handicap ?? outcome?.point);
          const price = toNumber(outcome?.price?.american ?? outcome?.american);
          if (label.includes("over")) total.overOdds = price;
          if (label.includes("under")) total.underOdds = price;
        }
        const built = buildMLBF5BookEventOdds({
          sport: "MLB",
          book: "Bovada",
          homeName,
          awayName,
          commenceTime: String(event?.startTime || event?.startTimeUTC || "").trim() || null,
          sourceEventId: String(event?.id || `${awayName}@${homeName}`),
          lastUpdated: String(event?.updatedAt || new Date().toISOString()),
          total,
        });
        if (built) outputs.push(built);
      }
    }
  }
  return outputs;
}

export function extractPointsBetMLBF5Odds(event: any): BookEventOdds[] {
  const homeName = String(event?.homeTeam || event?.homeTeamName || event?.home || "").trim();
  const awayName = String(event?.awayTeam || event?.awayTeamName || event?.away || "").trim();
  if (!homeName || !awayName) return [];

  const moneyline: { home?: number | null; away?: number | null } = {};
  const total: { line?: number | null; overOdds?: number | null; underOdds?: number | null } = {};

  for (const market of event?.fixedOddsMarkets || []) {
    const name = marketName(market?.name || market?.eventClass || market?.groupByHeader || market?.header);
    if (!name.includes("first 5") && !name.includes("1st 5")) continue;
    const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];

    if (name.includes("moneyline") || name.includes("match result")) {
      for (const outcome of outcomes) {
        const normalized = normalizeTeamName(outcomeName(outcome), "MLB");
        const american = decimalToAmerican(toNumber(outcome?.price));
        if (normalized === normalizeTeamName(homeName, "MLB")) moneyline.home = american;
        if (normalized === normalizeTeamName(awayName, "MLB")) moneyline.away = american;
      }
    }

    if (name.includes("total") || name.includes("over/under")) {
      for (const outcome of outcomes) {
        const label = outcomeName(outcome).toLowerCase();
        total.line = total.line ?? toNumber(outcome?.points ?? outcome?.line);
        const american = decimalToAmerican(toNumber(outcome?.price));
        if (label.includes("over")) total.overOdds = american;
        if (label.includes("under")) total.underOdds = american;
      }
    }
  }

  const outputs: BookEventOdds[] = [];
  if (moneyline.home != null || moneyline.away != null) {
    const built = buildMLBF5BookEventOdds({
      sport: "MLB",
      book: "PointsBet",
      homeName,
      awayName,
      commenceTime: String(event?.startsAt || event?.startTime || "").trim() || null,
      sourceEventId: String(event?.key || event?.id || `${awayName}@${homeName}`),
      lastUpdated: String(event?.updatedAt || new Date().toISOString()),
      moneyline,
    });
    if (built) outputs.push(built);
  }
  if (total.line != null || total.overOdds != null || total.underOdds != null) {
    const built = buildMLBF5BookEventOdds({
      sport: "MLB",
      book: "PointsBet",
      homeName,
      awayName,
      commenceTime: String(event?.startsAt || event?.startTime || "").trim() || null,
      sourceEventId: String(event?.key || event?.id || `${awayName}@${homeName}`),
      lastUpdated: String(event?.updatedAt || new Date().toISOString()),
      total,
    });
    if (built) outputs.push(built);
  }
  return outputs;
}
