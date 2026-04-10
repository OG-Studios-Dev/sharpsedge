import type { MarketPriceMarketType, MarketSnapshotPriceRecord } from "@/lib/market-snapshot-store";
import type { OddsEvent } from "@/lib/types";
import { getDailyPlayerPropOddsEvents } from "@/lib/props-cache";
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

function toPropMarketType(propType: string): MarketPriceMarketType | null {
  const inferred = inferGoose2MarketType({ propType });
  return inferred.startsWith("player_prop_") ? inferred as MarketPriceMarketType : null;
}

function extractPlayerPropRowsFromEvent(input: {
  sport: "NHL" | "NBA" | "MLB";
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
        const direction = outcome.name === "Under" ? "Under" : outcome.name === "Over" ? "Over" : null;
        if (!direction) continue;
        if (typeof outcome.point !== "number" || !Number.isFinite(outcome.point)) continue;
        if (typeof outcome.price !== "number" || !Number.isFinite(outcome.price)) continue;
        const participantName = String(outcome.description || "").trim();
        if (!participantName) continue;

        rows.push({
          id: `${input.snapshotId}:${input.gameId}:${slugify(bookmaker.title)}:${marketType}:${slugify(participantName)}:${slugify(direction)}:${outcome.point}`,
          snapshotId: input.snapshotId,
          eventSnapshotId: input.eventSnapshotId,
          sport: input.sport,
          gameId: input.gameId,
          oddsApiEventId: input.oddsApiEventId,
          commenceTime: input.commenceTime,
          capturedAt: input.capturedAt,
          book: bookmaker.title,
          marketType,
          outcome: direction,
          odds: outcome.price,
          line: outcome.point,
          source: "player_props_odds_api",
          sourceUpdatedAt: input.capturedAt,
          sourceAgeMinutes: 0,
          participantType: "player",
          participantId: normalizeParticipantId(participantName),
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
  const supportedSports = ["NHL", "NBA", "MLB"] as const;
  const rows: MarketSnapshotPriceRecord[] = [];

  for (const sport of supportedSports) {
    const events = (input.sportsBoard[sport] ?? []).filter((event) => event.oddsApiEventId);
    if (!events.length) continue;

    const odds = await getDailyPlayerPropOddsEvents(sport, events.map((event) => event.oddsApiEventId));

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
