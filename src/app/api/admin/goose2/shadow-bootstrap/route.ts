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

async function runShadowBootstrap(input: { limit?: number; sport?: string; dry_run?: boolean }) {
  const limit = Math.min(Math.max(Number(input.limit ?? 200), 1), 2000);
  const sport = typeof input.sport === "string" && input.sport.trim() ? input.sport.trim().toUpperCase() : undefined;
  const dryRun = Boolean(input.dry_run);

  const snapshotRows = await loadSnapshotRowsForBackfill({ limit, sport });
  const mapped = mapSnapshotRowsToGoose2(snapshotRows);
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      sport: sport ?? "ALL",
      counts: {
        snapshot_events: snapshotRows.events.length,
        snapshot_prices: snapshotRows.prices.length,
        goose_events: mapped.eventRows.length,
        goose_candidates: mapped.candidateRows.length,
        goose_feature_rows: mapped.candidateRows.length,
        goose_decision_logs: mapped.candidateRows.length,
      },
      sample: {
        event: mapped.eventRows[0] ?? null,
        candidate: mapped.candidateRows[0] ?? null,
      },
      audit: {
        syntheticSourceEventCount: mapped.eventRows.filter((event) => /:na$/i.test(String(event.source_event_id ?? ""))).length,
        syntheticSourceEventExamples: mapped.eventRows.filter((event) => /:na$/i.test(String(event.source_event_id ?? ""))).slice(0, 5),
      },
    };
  }

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
        canonicalGameId: event.canonical_game_id ?? `cg:${String(event.sport || 'unknown').toLowerCase()}:${String(event.game_id || 'unknown')}`,
        sourceEventIdKind: event.source_event_id_kind ?? 'snapshot_game_id',
        realGameId: event.real_game_id ?? null,
        snapshotGameId: event.snapshot_game_id ?? event.game_id,
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
        coverageFlags: event.coverage_flags ?? {},
        sourceLimited: Boolean(event.source_limited),
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
      prices: snapshotRows.prices.map((price) => {
        const participantKey = price.participant_key ?? `${String(price.market_type)}:${String(price.outcome).toLowerCase()}:${price.line ?? 'na'}`;
        const canonicalGameId = price.canonical_game_id ?? `cg:${String(price.sport || 'unknown').toLowerCase()}:${String(price.game_id || 'unknown')}`;
        return {
          id: price.id,
          snapshotId: price.snapshot_id,
          eventSnapshotId: price.event_snapshot_id,
          sport: price.sport as any,
          gameId: price.game_id,
          canonicalGameId,
          canonicalMarketKey: price.canonical_market_key ?? `${canonicalGameId}:${String(price.book || 'unknown').toLowerCase()}:${participantKey}`,
          participantKey,
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
          captureWindowPhase: (price.capture_window_phase === 'early' || price.capture_window_phase === 'pregame' || price.capture_window_phase === 'close' || price.capture_window_phase === 'live') ? price.capture_window_phase : 'pregame',
          isOpeningCandidate: Boolean(price.is_opening_candidate ?? true),
          isClosingCandidate: Boolean(price.is_closing_candidate ?? false),
          coverageFlags: price.coverage_flags ?? {},
          sourceLimited: Boolean(price.source_limited),
          participantType: normalizeParticipantType(price.participant_type),
          participantId: price.participant_id ?? null,
          participantName: price.participant_name ?? null,
          opponentName: price.opponent_name ?? null,
          propType: price.prop_type ?? null,
          propMarketKey: price.prop_market_key ?? null,
          context: price.context ?? {},
        };
      }),
    }, dryRun);

    return {
      ok: true,
      dry_run: dryRun,
      sport: sport ?? "ALL",
      counts: shadow.counts,
      sample: {
        event: mapped.eventRows[0] ?? null,
        candidate: mapped.candidateRows[0] ?? null,
      },
      audit: undefined,
    };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const result = await runShadowBootstrap({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      sport: url.searchParams.get("sport") ?? undefined,
      dry_run: url.searchParams.get("dry_run") === "true",
    });
    return NextResponse.json(result);
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      limit?: number;
      sport?: string;
      dry_run?: boolean;
    };
    const result = await runShadowBootstrap(body);
    return NextResponse.json(result);
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
