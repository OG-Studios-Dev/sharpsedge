import { buildGoose2FeatureRowId } from "@/lib/goose2/ids";
import type { Goose2FeatureRow, Goose2MarketCandidate } from "@/lib/goose2/types";
import type { DbSystemQualifier } from "@/lib/system-qualifiers-db";

export function mapCandidateToInitialFeatureRow(input: {
  candidate: Goose2MarketCandidate;
  qualifiers?: DbSystemQualifier[];
  featureVersion?: string;
  generatedTs?: string;
}) : Goose2FeatureRow {
  const featureVersion = input.featureVersion ?? "phase1-initial";
  const generatedTs = input.generatedTs ?? new Date().toISOString();
  const matchingQualifiers = (input.qualifiers ?? []).filter((qualifier) => {
    const sameLeague = !qualifier.league || qualifier.league.toUpperCase() === input.candidate.league.toUpperCase();
    const participantMatch = [qualifier.qualified_team, qualifier.home_team, qualifier.road_team]
      .filter(Boolean)
      .some((team) => team?.toLowerCase() === input.candidate.participant_name?.toLowerCase());
    const opponentMatch = [qualifier.opponent_team, qualifier.home_team, qualifier.road_team]
      .filter(Boolean)
      .some((team) => team?.toLowerCase() === input.candidate.opponent_name?.toLowerCase());
    return sameLeague && (participantMatch || opponentMatch);
  });

  return {
    feature_row_id: buildGoose2FeatureRowId(input.candidate.candidate_id, featureVersion),
    candidate_id: input.candidate.candidate_id,
    event_id: input.candidate.event_id,
    sport: input.candidate.sport,
    league: input.candidate.league,
    market_type: input.candidate.market_type,
    feature_version: featureVersion,
    feature_payload: {
      market_type: input.candidate.market_type,
      side: input.candidate.side,
      line: input.candidate.line,
      odds: input.candidate.odds,
      book: input.candidate.book,
      participant_name: input.candidate.participant_name,
      opponent_name: input.candidate.opponent_name,
      capture_ts: input.candidate.capture_ts,
      snapshot_id: input.candidate.snapshot_id,
      event_snapshot_id: input.candidate.event_snapshot_id,
    },
    system_flags: {
      qualifier_count: matchingQualifiers.length,
      systems: matchingQualifiers.map((qualifier) => ({
        system_id: qualifier.system_id,
        system_slug: qualifier.system_slug,
        system_name: qualifier.system_name,
        action_side: qualifier.action_side,
        market_type: qualifier.market_type,
        logged_at: qualifier.logged_at,
      })),
    },
    source_chain: [
      {
        source: input.candidate.source,
        snapshot_id: input.candidate.snapshot_id,
        event_snapshot_id: input.candidate.event_snapshot_id,
      },
      ...matchingQualifiers.map((qualifier) => ({
        source: "system_qualifiers",
        qualifier_id: qualifier.id,
        system_slug: qualifier.system_slug,
      })),
    ],
    generated_ts: generatedTs,
  };
}
