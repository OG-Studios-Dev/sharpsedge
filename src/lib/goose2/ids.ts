import { normalizeBook, normalizeLine, normalizeParticipantKey, normalizeSide, normalizeToken, toDateKey, toHourBucket, toMinuteBucket } from "@/lib/goose2/normalizers";

export function buildGoose2EventId(input: {
  sport: string;
  league: string;
  awayTeam?: string | null;
  homeTeam?: string | null;
  commenceTime?: string | Date | null;
  source?: string | null;
  sourceEventId?: string | null;
}) {
  const sport = normalizeToken(input.sport) || "unknown-sport";
  const league = normalizeToken(input.league) || sport;
  const away = normalizeToken(input.awayTeam);
  const home = normalizeToken(input.homeTeam);
  const normalizedSourceEventId = normalizeToken(input.sourceEventId);

  if (normalizedSourceEventId) {
    return `evt:${sport}:${league}:${normalizedSourceEventId}`;
  }

  if (away && home) {
    return `evt:${sport}:${league}:${away}@${home}:${toHourBucket(input.commenceTime)}`;
  }

  return `evt:${sport}:${league}:${normalizeToken(input.source) || "unknown-source"}:${toDateKey(input.commenceTime)}`;
}

export function buildGoose2CandidateId(input: {
  eventId: string;
  marketType: string;
  participantId?: string | null;
  participantName?: string | null;
  side?: string | null;
  line?: number | string | null;
  book?: string | null;
  captureTs?: string | Date | null;
}) {
  return [
    "cand",
    input.eventId,
    normalizeToken(input.marketType) || "unknown-market",
    normalizeParticipantKey(input.participantId, input.participantName),
    normalizeSide(input.side),
    normalizeLine(input.line),
    normalizeBook(input.book),
    toMinuteBucket(input.captureTs),
  ].join(":");
}

export function buildGoose2FeatureRowId(candidateId: string, featureVersion: string) {
  return `feat:${candidateId}:${normalizeToken(featureVersion) || "v1"}`;
}

export function buildGoose2DecisionId(candidateId: string, policyVersion: string, decisionTs?: string | Date | null) {
  return `dec:${candidateId}:${normalizeToken(policyVersion) || "v1"}:${toMinuteBucket(decisionTs)}`;
}
