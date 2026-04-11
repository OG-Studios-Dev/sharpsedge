import { NextRequest, NextResponse } from "next/server";
import { loadSnapshotRowsForBackfill, mapSnapshotRowsToGoose2 } from "@/lib/goose2/snapshot-backfill";
import { bootstrapGoose2ShadowFromSnapshot } from "@/lib/goose2/shadow-pipeline";

export const dynamic = "force-dynamic";

function normalizeParticipantType(value?: string | null) {
  if (value === "team" || value === "player" || value === "golfer" || value === "pairing" || value === "field" || value === "unknown") {
    return value;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      limit?: number;
      sport?: string;
      dry_run?: boolean;
    };

    const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 2000);
    const sport = typeof body.sport === "string" && body.sport.trim() ? body.sport.trim().toUpperCase() : undefined;
    const dryRun = Boolean(body.dry_run);

    const snapshotRows = await loadSnapshotRowsForBackfill({ limit, sport });
    const mapped = mapSnapshotRowsToGoose2(snapshotRows);
    const shadow = await bootstrapGoose2ShadowFromSnapshot({
      id: "backfill-preview",
      capturedAt: snapshotRows.events[0]?.captured_at ?? new Date().toISOString(),
      dateKey: (snapshotRows.events[0]?.captured_at ?? new Date().toISOString()).slice(0, 10),
      health: {
        status: "healthy",
        cadenceMinutes: null,
        expectedCadenceMinutes: 60,
        summary: "Backfill bootstrap preview",
      },
      source: "aggregated_odds_board",
      trigger: "manual",
      reason: "goose2-shadow-bootstrap",
      storageVersion: 1,
      sportCount: new Set(snapshotRows.events.map((event) => event.sport)).size,
      gameCount: snapshotRows.events.length,
      eventCount: snapshotRows.events.length,
      priceCount: snapshotRows.prices.length,
      sourceSummary: { source: "aggregated_odds_board", bookCount: 0, books: [] },
      freshness: {
        sourceCount: 0,
        staleSourceCount: 0,
        oldestSourceUpdatedAt: null,
        newestSourceUpdatedAt: null,
        minSourceAgeMinutes: null,
        maxSourceAgeMinutes: null,
      },
      sportBreakdown: {},
      quarterCoverage: {
        q1PriceCount: 0,
        q3PriceCount: 0,
        q1GameCount: 0,
        q3GameCount: 0,
        booksWithQ1: [],
        booksWithQ3: [],
      },
      events: snapshotRows.events.map((event) => ({
        id: event.id,
        snapshotId: event.snapshot_id,
        sport: event.sport as any,
        gameId: event.game_id,
        oddsApiEventId: event.odds_api_event_id,
        commenceTime: event.commence_time,
        matchup: event.matchup,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        homeAbbrev: event.home_abbrev,
        awayAbbrev: event.away_abbrev,
        capturedAt: event.captured_at,
        source: event.source,
        sourceSummary: { source: event.source, bookCount: 0, books: [] },
        freshness: {
          sourceCount: 0,
          staleSourceCount: 0,
          oldestSourceUpdatedAt: null,
          newestSourceUpdatedAt: null,
          minSourceAgeMinutes: null,
          maxSourceAgeMinutes: null,
        },
        bookCount: 0,
        priceCount: 0,
        bestPrices: {
          bestHome: null,
          bestAway: null,
          bestHomeSpread: null,
          bestAwaySpread: null,
          bestHomeFirstQuarterSpread: null,
          bestAwayFirstQuarterSpread: null,
          bestHomeThirdQuarterSpread: null,
          bestAwayThirdQuarterSpread: null,
          bestOver: null,
          bestUnder: null,
        },
      })),
      prices: snapshotRows.prices.map((price) => ({
        id: price.id,
        snapshotId: price.snapshot_id,
        eventSnapshotId: price.event_snapshot_id,
        sport: price.sport as any,
        gameId: price.game_id,
        oddsApiEventId: price.odds_api_event_id,
        commenceTime: price.commence_time,
        capturedAt: price.captured_at,
        book: price.book,
        marketType: price.market_type as any,
        outcome: price.outcome,
        odds: price.odds,
        line: price.line,
        source: price.source,
        sourceUpdatedAt: price.source_updated_at,
        sourceAgeMinutes: price.source_age_minutes,
        participantType: normalizeParticipantType(price.participant_type),
        participantId: price.participant_id ?? null,
        participantName: price.participant_name ?? null,
        opponentName: price.opponent_name ?? null,
        propType: price.prop_type ?? null,
        propMarketKey: price.prop_market_key ?? null,
        context: price.context ?? {},
      })),
    }, dryRun);

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      sport: sport ?? "ALL",
      counts: shadow.counts,
      sample: {
        event: mapped.eventRows[0] ?? null,
        candidate: mapped.candidateRows[0] ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
