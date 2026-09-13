import type { MarketPriceMarketType, MarketSnapshotPriceRecord } from "@/lib/market-snapshot-store";
import type { OddsEvent } from "@/lib/types";
import { getDateKey } from "@/lib/date-utils";
import { filterPropEventsByHorizon, getDailyPlayerPropOddsEvents } from "@/lib/props-cache";
import { inferGoose2MarketType } from "@/lib/goose2/taxonomy";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeParticipantId(name: string) {
  return slugify(name);
}

function canonicalGameId(input: { sport: string; awayTeam: string; homeTeam: string; commenceTime: string | null }) {
  const parsed = input.commenceTime ? new Date(input.commenceTime) : null;
  const commenceHour = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 13) : "unknown-time";
  return `cg:${input.sport.toLowerCase()}:${slugify(input.awayTeam)}@${slugify(input.homeTeam)}:${commenceHour}`;
}

function normalizeDateKey(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed) return fallback;
  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = trimmed.length === 10 ? numeric * 1000 : numeric;
      return getDateKey(new Date(millis));
    }
    return fallback;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return getDateKey(parsed);
}

type PersistedOddsApiEvent = {
  odds_api_event_id?: string | null;
  commence_time?: string | null;
  home_team?: string | null;
  away_team?: string | null;
};

type PropBoardEvent = {
  gameId: string;
  oddsApiEventId?: string | null;
  commenceTime: string | null;
  homeTeam: string;
  awayTeam: string;
};

export function attachPersistedOddsApiEventIds(events: PropBoardEvent[], persisted: PersistedOddsApiEvent[]) {
  const byMatchup = new Map<string, string>();
  for (const row of persisted) {
    const id = String(row.odds_api_event_id || "").trim();
    if (!id) continue;
    const date = normalizeDateKey(row.commence_time, "");
    const key = `${String(row.away_team || "").trim().toLowerCase()}@${String(row.home_team || "").trim().toLowerCase()}:${date}`;
    if (!byMatchup.has(key)) byMatchup.set(key, id);
  }
  for (const event of events) {
    if (event.oddsApiEventId) continue;
    const date = normalizeDateKey(event.commenceTime, "");
    const key = `${event.awayTeam.trim().toLowerCase()}@${event.homeTeam.trim().toLowerCase()}:${date}`;
    event.oddsApiEventId = byMatchup.get(key) ?? null;
  }
  return events;
}

async function restorePersistedNFLOddsApiEventIds(events: PropBoardEvent[]) {
  if (!events.some((event) => !event.oddsApiEventId)) return events;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return events;
  const dates = events.map((event) => normalizeDateKey(event.commenceTime, "")).filter(Boolean).sort();
  if (!dates.length) return events;
  const query = new URLSearchParams({
    select: "odds_api_event_id,commence_time,home_team,away_team,captured_at",
    sport: "eq.NFL",
    odds_api_event_id: "not.is.null",
    commence_time: `gte.${dates[0]}T00:00:00Z`,
    order: "captured_at.desc",
    limit: "1000",
  });
  query.append("commence_time", `lte.${dates[dates.length - 1]}T23:59:59Z`);
  try {
    const response = await fetch(`${url}/rest/v1/market_snapshot_events?${query.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!response.ok) return events;
    return attachPersistedOddsApiEventIds(events, await response.json() as PersistedOddsApiEvent[]);
  } catch {
    return events;
  }
}

function toPropMarketType(propType: string): MarketPriceMarketType | null {
  const inferred = inferGoose2MarketType({ propType });
  return inferred.startsWith("player_prop_") ? inferred as MarketPriceMarketType : null;
}

export function normalizePlayerPropOutcome(
  marketKey: string,
  outcome: { name?: string | null; point?: number | null },
) {
  const name = String(outcome.name || "").trim().toLowerCase();
  if ((name === "over" || name === "under") && typeof outcome.point === "number" && Number.isFinite(outcome.point)) {
    return { direction: name === "over" ? "Over" as const : "Under" as const, line: outcome.point };
  }
  if (marketKey === "player_anytime_td" && (name === "yes" || name === "no")) {
    return { direction: name === "yes" ? "Over" as const : "Under" as const, line: 0.5 };
  }
  return null;
}

function extractPlayerPropRowsFromEvent(input: {
  sport: "NHL" | "NBA" | "MLB" | "NFL";
  snapshotId: string;
  eventSnapshotId: string;
  gameId: string;
  oddsApiEventId: string;
  commenceTime: string | null;
  homeTeam: string;
  awayTeam: string;
  capturedAt: string;
  event: OddsEvent | null;
}): MarketSnapshotPriceRecord[] {
  if (!input.event?.bookmakers?.length) return [];

  const rows: MarketSnapshotPriceRecord[] = [];

  for (const bookmaker of input.event.bookmakers) {
    for (const market of bookmaker.markets || []) {
      const marketType = toPropMarketType(market.key);
      if (!marketType) continue;

      const propType = market.key.replace(/^player_/, "").replace(/_/g, " ");

      for (const outcome of market.outcomes || []) {
        const normalizedOutcome = normalizePlayerPropOutcome(market.key, outcome);
        if (!normalizedOutcome) continue;
        const { direction, line } = normalizedOutcome;
        if (typeof outcome.price !== "number" || !Number.isFinite(outcome.price)) continue;
        const participantName = String(outcome.description || "").trim();
        if (!participantName) continue;

        const cgId = canonicalGameId(input);
        const participantId = normalizeParticipantId(participantName);
        const participantKey = `${marketType}:${participantId}:${direction.toLowerCase()}:${line}`;
        rows.push({
          id: `${input.snapshotId}:${input.gameId}:${slugify(bookmaker.title)}:${marketType}:${slugify(participantName)}:${slugify(direction)}:${line}`,
          snapshotId: input.snapshotId,
          eventSnapshotId: input.eventSnapshotId,
          sport: input.sport,
          gameId: input.gameId,
          canonicalGameId: cgId,
          canonicalMarketKey: `${cgId}:${slugify(bookmaker.title)}:${participantKey}`,
          participantKey,
          oddsApiEventId: input.oddsApiEventId,
          commenceTime: input.commenceTime,
          capturedAt: input.capturedAt,
          book: bookmaker.title,
          marketType,
          outcome: direction,
          odds: outcome.price,
          line,
          source: "player_props_odds_api",
          sourceUpdatedAt: input.capturedAt,
          sourceAgeMinutes: 0,
          captureWindowPhase: "pregame",
          isOpeningCandidate: true,
          isClosingCandidate: false,
          coverageFlags: {},
          sourceLimited: false,
          participantType: "player",
          participantId,
          participantName,
          opponentName: `${input.awayTeam} @ ${input.homeTeam}`,
          propType,
          propMarketKey: market.key,
          context: {
            home_team: input.homeTeam,
            away_team: input.awayTeam,
            bookmaker_key: bookmaker.key,
            market_key: market.key,
          },
        });
      }
    }
  }

  return rows;
}

export async function capturePlayerPropSnapshotRows(input: {
  sportsBoard: Partial<Record<string, Array<{ gameId: string; oddsApiEventId?: string | null; commenceTime: string | null; homeTeam: string; awayTeam: string }>>>;
  snapshotId: string;
  eventSnapshotIdByGameId: Map<string, string>;
  capturedAt: string;
}) {
  const supportedSports = ["NHL", "NBA", "MLB", "NFL"] as const;
  const rows: MarketSnapshotPriceRecord[] = [];
  const capturedDateKey = getDateKey(new Date(input.capturedAt));

  for (const sport of supportedSports) {
    const boardEvents = input.sportsBoard[sport] ?? [];
    const events = sport === "NFL"
      ? filterPropEventsByHorizon(boardEvents, input.capturedAt)
      : boardEvents;
    if (!events.length) continue;
    if (sport === "NFL") await restorePersistedNFLOddsApiEventIds(events);

    const eventsByLookup = new Map<string, Array<typeof events[number]>>();
    const eventIds = Array.from(new Set(
      events
        .map((event) => String(event.oddsApiEventId || "").trim())
        .filter(Boolean),
    ));

    for (const event of events) {
      const dateKey = normalizeDateKey(event.commenceTime, capturedDateKey);
      const keys = [
        `${event.homeTeam}__${event.awayTeam}__${dateKey}`.toLowerCase(),
        `${event.gameId}__${dateKey}`.toLowerCase(),
      ];
      for (const key of keys) {
        const existing = eventsByLookup.get(key) ?? [];
        existing.push(event);
        eventsByLookup.set(key, existing);
      }
    }

    const odds = await getDailyPlayerPropOddsEvents(sport, eventIds);
    const payloadByEvent = new Map<string, OddsEvent>();

    for (const [eventId, eventPayload] of Array.from(odds.events.entries())) {
      if (eventPayload) payloadByEvent.set(eventId, eventPayload);
    }

    for (const eventPayload of Array.from(payloadByEvent.values())) {
      const dateKey = normalizeDateKey(eventPayload.commence_time, capturedDateKey);
      const lookupKeys = [
        `${eventPayload.home_team}__${eventPayload.away_team}__${dateKey}`.toLowerCase(),
      ];
      for (const lookupKey of lookupKeys) {
        const matchedEvents = eventsByLookup.get(lookupKey) ?? [];
        for (const event of matchedEvents) {
          if (event.oddsApiEventId) continue;
          event.oddsApiEventId = eventPayload.id;
        }
      }
    }

    for (const event of events) {
      const oddsApiEventId = event.oddsApiEventId;
      if (!oddsApiEventId) continue;
      const eventPayload = odds.events.get(oddsApiEventId) ?? null;
      const eventSnapshotId = input.eventSnapshotIdByGameId.get(event.gameId);
      if (!eventSnapshotId) continue;

      rows.push(...extractPlayerPropRowsFromEvent({
        sport,
        snapshotId: input.snapshotId,
        eventSnapshotId,
        gameId: event.gameId,
        oddsApiEventId,
        commenceTime: event.commenceTime,
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        capturedAt: input.capturedAt,
        event: eventPayload,
      }));
    }
  }

  return rows;
}

export default {
  attachPersistedOddsApiEventIds,
  normalizePlayerPropOutcome,
};
