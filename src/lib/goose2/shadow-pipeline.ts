import type { MarketSnapshotRecord } from "@/lib/market-snapshot-store";
import { mapCandidateToInitialFeatureRow } from "@/lib/goose2/feature-mappers";
import { buildShadowDecision } from "@/lib/goose2/policy";
import { mapSnapshotRowsToGoose2 } from "@/lib/goose2/snapshot-backfill";
import {
  upsertGoose2Candidates,
  upsertGoose2DecisionLogs,
  upsertGoose2Events,
  upsertGoose2FeatureRows,
} from "@/lib/goose2/repository";
import { loadSystemQualifiers } from "@/lib/system-qualifiers-db";

export type Goose2ShadowBootstrapResult = {
  counts: {
    snapshot_events: number;
    snapshot_prices: number;
    goose_events: number;
    goose_candidates: number;
    goose_feature_rows: number;
    goose_decision_logs: number;
  };
};

const QUALIFIER_SYSTEMS = [
  "mlb-home-majority-handle",
  "falcons-fight-pummeled-pitchers",
  "coach-no-rest",
  "fat-tonys-fade",
  "nba-goose-system",
  "nfl-home-dog-majority-handle",
  "nfl-under-majority-handle",
];

export async function bootstrapGoose2ShadowFromSnapshot(snapshot: MarketSnapshotRecord, dryRun = false): Promise<Goose2ShadowBootstrapResult> {
  const mapped = mapSnapshotRowsToGoose2({
    events: snapshot.events.map((event) => ({
      id: event.id,
      snapshot_id: event.snapshotId,
      sport: event.sport,
      game_id: event.gameId,
      odds_api_event_id: event.oddsApiEventId,
      commence_time: event.commenceTime,
      matchup: event.matchup,
      home_team: event.homeTeam,
      away_team: event.awayTeam,
      home_abbrev: event.homeAbbrev,
      away_abbrev: event.awayAbbrev,
      captured_at: event.capturedAt,
      source: event.source,
    })),
    prices: snapshot.prices.map((price) => ({
      id: price.id,
      snapshot_id: price.snapshotId,
      event_snapshot_id: price.eventSnapshotId,
      sport: price.sport,
      game_id: price.gameId,
      odds_api_event_id: price.oddsApiEventId,
      commence_time: price.commenceTime,
      captured_at: price.capturedAt,
      book: price.book,
      market_type: price.marketType,
      outcome: price.outcome,
      odds: price.odds,
      line: price.line,
      source: price.source,
      source_updated_at: price.sourceUpdatedAt,
      source_age_minutes: price.sourceAgeMinutes,
    })),
  });

  const qualifierRows = await Promise.all(QUALIFIER_SYSTEMS.map((systemId) => loadSystemQualifiers(systemId, 30)));
  const qualifiers = qualifierRows.flat();

  const featureRows = mapped.candidateRows.map((candidate) =>
    mapCandidateToInitialFeatureRow({ candidate, qualifiers }),
  );

  const decisionRows = mapped.candidateRows.map((candidate, index) =>
    buildShadowDecision({ candidate, featureRow: featureRows[index] }),
  );

  if (!dryRun) {
    await upsertGoose2Events(mapped.eventRows);
    await upsertGoose2Candidates(mapped.candidateRows);
    await upsertGoose2FeatureRows(featureRows);
    await upsertGoose2DecisionLogs(decisionRows);
  }

  return {
    counts: {
      snapshot_events: snapshot.events.length,
      snapshot_prices: snapshot.prices.length,
      goose_events: mapped.eventRows.length,
      goose_candidates: mapped.candidateRows.length,
      goose_feature_rows: featureRows.length,
      goose_decision_logs: decisionRows.length,
    },
  };
}
