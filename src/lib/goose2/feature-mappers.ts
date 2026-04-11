import { buildGoose2FeatureRowId } from "@/lib/goose2/ids";
import type { Goose2FeatureRow, Goose2MarketCandidate } from "@/lib/goose2/types";
import type { DbSystemQualifier } from "@/lib/system-qualifiers-db";

function normalizeTeam(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function teamNameVariants(value?: string | null) {
  const raw = String(value ?? "").trim();
  const normalized = normalizeTeam(raw);
  const compact = normalized.replace(/ /g, "");
  const parts = normalized.split(/\s+/).filter(Boolean);
  const variants = new Set<string>();

  if (raw) variants.add(raw.toLowerCase());
  if (normalized) variants.add(normalized);
  if (compact) variants.add(compact);
  if (parts.length) {
    variants.add(parts[0]);
    variants.add(parts[parts.length - 1]);
    variants.add(parts.slice(-2).join(" "));
    variants.add(parts.slice(-2).join(""));
  }

  return Array.from(variants).filter(Boolean);
}

function candidateTeamKeys(candidate: Goose2MarketCandidate) {
  const participant = candidate.participant_name || candidate.side;
  const opponent = candidate.opponent_name;
  return {
    participant: new Set(teamNameVariants(participant)),
    opponent: new Set(teamNameVariants(opponent)),
  };
}

function qualifierMatchesCandidate(qualifier: DbSystemQualifier, candidate: Goose2MarketCandidate) {
  const sameLeague = !qualifier.league || qualifier.league.toUpperCase() === candidate.league.toUpperCase();
  if (!sameLeague) return false;

  const candidateKeys = candidateTeamKeys(candidate);
  const qualifierQualified = teamNameVariants(qualifier.qualified_team || qualifier.action_side);
  const qualifierOpponent = teamNameVariants(qualifier.opponent_team);
  const qualifierHome = teamNameVariants(qualifier.home_team);
  const qualifierRoad = teamNameVariants(qualifier.road_team);
  const qualifierMarket = String(qualifier.market_type ?? "").toLowerCase();
  const candidateMarket = String(candidate.market_type ?? "").toLowerCase();

  const marketCompatible = !qualifierMarket
    || qualifierMarket === candidateMarket
    || (qualifierMarket === "moneyline" && candidateMarket === "moneyline")
    || (qualifierMarket === "total" && candidateMarket.includes("total"));
  if (!marketCompatible) return false;

  const participantMatch = qualifierQualified.some((team) => candidateKeys.participant.has(team))
    || qualifierHome.some((team) => candidateKeys.participant.has(team))
    || qualifierRoad.some((team) => candidateKeys.participant.has(team));

  const opponentMatch = qualifierOpponent.some((team) => candidateKeys.opponent.has(team))
    || qualifierHome.some((team) => candidateKeys.opponent.has(team))
    || qualifierRoad.some((team) => candidateKeys.opponent.has(team));

  if (candidateMarket.includes("total")) {
    return candidate.side?.toLowerCase() === qualifier.action_side?.toLowerCase()
      && (qualifierHome.some((team) => candidateKeys.participant.has(team) || candidateKeys.opponent.has(team))
        || qualifierRoad.some((team) => candidateKeys.participant.has(team) || candidateKeys.opponent.has(team))
        || participantMatch
        || opponentMatch);
  }

  return participantMatch;
}

export function mapCandidateToInitialFeatureRow(input: {
  candidate: Goose2MarketCandidate;
  qualifiers?: DbSystemQualifier[];
  featureVersion?: string;
  generatedTs?: string;
}) : Goose2FeatureRow {
  const featureVersion = input.featureVersion ?? "phase1-initial";
  const generatedTs = input.generatedTs ?? new Date().toISOString();
  const matchingQualifiers = (input.qualifiers ?? []).filter((qualifier) => qualifierMatchesCandidate(qualifier, input.candidate));

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
      participant_key_fallback: input.candidate.participant_name || input.candidate.side,
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
