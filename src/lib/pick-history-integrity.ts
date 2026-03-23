import type { AIPick } from "@/lib/types";
import type {
  PickHistoryIntegrityStatus,
  PickHistoryProvenance,
  PickHistoryRecord,
  PickSlateRecord,
  PickSlateStatus,
} from "@/lib/supabase-types";

export const EXPECTED_DAILY_PICK_COUNT = 3;

const LEGACY_RECONSTRUCTED_DATES: Record<string, string> = {
  "2026-03-17": "Reconstructed/backfilled from screenshot and user message.",
  "2026-03-18": "Reconstructed/backfilled from screenshot and user message.",
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseSnapshot(value: unknown): Record<string, unknown> | null {
  const direct = asObject(value);
  if (direct) return direct;

  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return asObject(JSON.parse(value));
  } catch {
    return null;
  }
}

function coerceProvenance(value: unknown, date: string): PickHistoryProvenance {
  if (value === "reconstructed" || value === "manual_repair") return value;
  if (LEGACY_RECONSTRUCTED_DATES[date]) return "reconstructed";
  return "original";
}

function coerceProvenanceNote(value: unknown, date: string): string | null {
  return asString(value) ?? LEGACY_RECONSTRUCTED_DATES[date] ?? null;
}

function coerceSlateStatus(value: unknown, pickCount: number, expectedCount: number): PickSlateStatus {
  if (value === "incomplete") return "incomplete";
  if (value === "locked" && pickCount >= expectedCount) return "locked";
  return pickCount >= expectedCount ? "locked" : "incomplete";
}

function coerceIntegrityStatus(
  status: PickSlateStatus,
  provenance: PickHistoryProvenance,
  pickCount: number,
  expectedCount: number,
): PickHistoryIntegrityStatus {
  if (status !== "locked" || pickCount < expectedCount) return "incomplete";
  if (provenance !== "original") return "reconstructed";
  return "ok";
}

function normalizeBookOdds(value: unknown): AIPick["bookOdds"] {
  if (!Array.isArray(value)) return undefined;

  const normalized = value.map((entry) => {
    const row = asObject(entry);
    if (!row) return null;

    const book = asString(row.book);
    const odds = asNumber(row.odds);
    const line = asNumber(row.line);
    const impliedProbability = asNumber(row.impliedProbability);
    if (!book || odds == null || line == null || impliedProbability == null) return null;

    return { book, odds, line, impliedProbability };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return normalized.length ? normalized : undefined;
}

function normalizeSnapshot(snapshot: Record<string, unknown> | null, fallback: PickHistoryRecord): AIPick | null {
  if (!snapshot) return null;

  const type = snapshot.type === "team" ? "team" : "player";
  const result = snapshot.result === "win" || snapshot.result === "loss" || snapshot.result === "push"
    ? snapshot.result
    : "pending";
  const direction = snapshot.direction === "Under" ? "Under" : snapshot.direction === "Over" ? "Over" : undefined;

  return {
    id: asString(snapshot.id) ?? fallback.id,
    date: asString(snapshot.date) ?? fallback.date,
    type,
    playerId: asNumber(snapshot.playerId) ?? undefined,
    playerName: asString(snapshot.playerName) ?? undefined,
    team: asString(snapshot.team) ?? fallback.team,
    teamColor: asString(snapshot.teamColor) ?? "#4a9eff",
    opponent: asString(snapshot.opponent) ?? fallback.opponent ?? "TBD",
    isAway: typeof snapshot.isAway === "boolean" ? snapshot.isAway : false,
    propType: asString(snapshot.propType) ?? undefined,
    line: asNumber(snapshot.line) ?? undefined,
    direction,
    betType: asString(snapshot.betType) ?? undefined,
    pickLabel: asString(snapshot.pickLabel) ?? fallback.pick_label,
    edge: asNumber(snapshot.edge) ?? fallback.edge ?? 0,
    hitRate: asNumber(snapshot.hitRate) ?? fallback.hit_rate ?? 0,
    confidence: asNumber(snapshot.confidence) ?? fallback.confidence ?? 0,
    reasoning: asString(snapshot.reasoning) ?? fallback.reasoning ?? "",
    result,
    units: 1,
    gameId: asString(snapshot.gameId) ?? fallback.game_id ?? undefined,
    oddsEventId: asString(snapshot.oddsEventId) ?? undefined,
    odds: asNumber(snapshot.odds) ?? fallback.odds ?? -110,
    book: asString(snapshot.book) ?? fallback.book ?? undefined,
    bookOdds: normalizeBookOdds(snapshot.bookOdds),
    league: asString(snapshot.league) ?? fallback.league,
  };
}

export function buildSlateKey(date: string, league: string) {
  return `${date}::${league}`;
}

export function normalizePickHistoryRow(raw: any): PickHistoryRecord {
  const date = typeof raw?.date === "string" ? raw.date : "";
  const provenance = coerceProvenance(raw?.provenance, date);
  const provisionalRecord = {
    id: String(raw?.id ?? raw?.pick_id ?? ""),
    date,
    league: typeof raw?.league === "string" ? raw.league : "NHL",
    pick_type: typeof raw?.pick_type === "string"
      ? raw.pick_type
      : typeof raw?.type === "string"
        ? raw.type
        : "player",
    player_name: typeof raw?.player_name === "string" ? raw.player_name : null,
    team: typeof raw?.team === "string" ? raw.team : "",
    opponent: typeof raw?.opponent === "string" ? raw.opponent : null,
    pick_label: typeof raw?.pick_label === "string" ? raw.pick_label : "",
    hit_rate: asNumber(raw?.hit_rate),
    edge: asNumber(raw?.edge),
    odds: asNumber(raw?.odds),
    book: typeof raw?.book === "string" ? raw.book : null,
    result: raw?.result === "win" || raw?.result === "loss" || raw?.result === "push" ? raw.result : "pending",
    game_id: typeof raw?.game_id === "string" ? raw.game_id : null,
    reasoning: typeof raw?.reasoning === "string" ? raw.reasoning : null,
    confidence: asNumber(raw?.confidence),
    units: typeof raw?.units === "number" && Number.isFinite(raw.units) ? raw.units : 1,
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    provenance,
    provenance_note: coerceProvenanceNote(raw?.provenance_note, date),
    pick_snapshot: null,
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : null,
  } satisfies Omit<PickHistoryRecord, "pick_snapshot"> & { pick_snapshot: null };

  return {
    ...provisionalRecord,
    pick_snapshot: normalizeSnapshot(parseSnapshot(raw?.pick_snapshot), provisionalRecord),
  };
}

function parsePlayerPickLabel(label: string | null | undefined) {
  const normalized = typeof label === "string" ? label.trim() : "";
  if (!normalized) return null;

  const match = normalized.match(/\b(Over|Under)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/i);
  if (!match) return null;

  const direction = match[1].toLowerCase() === "under" ? "Under" : "Over";
  const line = Number(match[2]);
  if (!Number.isFinite(line)) return null;

  return {
    direction,
    line,
    propType: match[3].trim() || undefined,
  } as const;
}

export function mapPickHistoryRecordToAIPick(record: PickHistoryRecord): AIPick {
  const snapshot = record.pick_snapshot;
  const parsedLabel = record.pick_type === "player" ? parsePlayerPickLabel(record.pick_label) : null;

  return {
    id: record.id,
    date: record.date || snapshot?.date || "",
    type: record.pick_type === "team" ? "team" : "player",
    playerId: snapshot?.playerId,
    playerName: record.player_name ?? snapshot?.playerName,
    team: record.team || snapshot?.team || "",
    teamColor: snapshot?.teamColor || "#4a9eff",
    opponent: record.opponent ?? snapshot?.opponent ?? "TBD",
    isAway: snapshot?.isAway ?? false,
    propType: snapshot?.propType ?? parsedLabel?.propType,
    line: typeof snapshot?.line === "number" ? snapshot.line : parsedLabel?.line,
    direction: snapshot?.direction ?? parsedLabel?.direction,
    betType: snapshot?.betType,
    pickLabel: record.pick_label || snapshot?.pickLabel || "",
    edge: typeof record.edge === "number" ? record.edge : snapshot?.edge ?? 0,
    hitRate: typeof record.hit_rate === "number" ? record.hit_rate : snapshot?.hitRate ?? 0,
    confidence: typeof record.confidence === "number" ? record.confidence : snapshot?.confidence ?? 0,
    reasoning: record.reasoning ?? snapshot?.reasoning ?? "",
    result: record.result,
    units: 1,
    gameId: record.game_id ?? snapshot?.gameId,
    oddsEventId: snapshot?.oddsEventId,
    odds: typeof record.odds === "number" ? record.odds : snapshot?.odds ?? -110,
    book: record.book ?? snapshot?.book,
    bookOdds: snapshot?.bookOdds,
    league: record.league || snapshot?.league,
  };
}

export function normalizePickSlateRow(raw: any): PickSlateRecord {
  const date = typeof raw?.date === "string" ? raw.date : "";
  const league = typeof raw?.league === "string" ? raw.league : "NHL";
  const expected_pick_count = typeof raw?.expected_pick_count === "number" && Number.isFinite(raw.expected_pick_count)
    ? raw.expected_pick_count
    : EXPECTED_DAILY_PICK_COUNT;
  const pick_count = typeof raw?.pick_count === "number" && Number.isFinite(raw.pick_count)
    ? raw.pick_count
    : 0;
  const provenance = coerceProvenance(raw?.provenance, date);
  const status = coerceSlateStatus(raw?.status, pick_count, expected_pick_count);

  return {
    date,
    league,
    status,
    provenance,
    provenance_note: coerceProvenanceNote(raw?.provenance_note, date),
    expected_pick_count,
    pick_count,
    status_note: asString(raw?.status_note),
    integrity_status: coerceIntegrityStatus(status, provenance, pick_count, expected_pick_count),
    locked_at: typeof raw?.locked_at === "string" ? raw.locked_at : typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : null,
  };
}

function chooseSlateProvenance(records: PickHistoryRecord[]): PickHistoryProvenance {
  if (records.some((record) => record.provenance === "manual_repair")) return "manual_repair";
  if (records.some((record) => record.provenance === "reconstructed")) return "reconstructed";
  return "original";
}

function chooseSlateNote(records: PickHistoryRecord[]): string | null {
  for (const record of records) {
    if (record.provenance_note) return record.provenance_note;
  }
  return null;
}

export function buildSyntheticSlateRecord(date: string, league: string, records: PickHistoryRecord[]): PickSlateRecord {
  const expected_pick_count = EXPECTED_DAILY_PICK_COUNT;
  const pick_count = records.length;
  const provenance = chooseSlateProvenance(records);
  const status = pick_count >= expected_pick_count ? "locked" : "incomplete";
  const ordered = [...records].sort((left, right) => left.created_at.localeCompare(right.created_at));
  const locked_at = ordered[0]?.created_at ?? new Date(0).toISOString();
  const updated_at = ordered[ordered.length - 1]?.updated_at ?? ordered[ordered.length - 1]?.created_at ?? null;

  return {
    date,
    league,
    status,
    provenance,
    provenance_note: chooseSlateNote(records),
    expected_pick_count,
    pick_count,
    status_note: status === "incomplete" ? `Only ${pick_count} of ${expected_pick_count} picks recorded.` : null,
    integrity_status: coerceIntegrityStatus(status, provenance, pick_count, expected_pick_count),
    locked_at,
    created_at: locked_at,
    updated_at,
  };
}

export function buildSyntheticSlateRecords(records: PickHistoryRecord[]): PickSlateRecord[] {
  const grouped = new Map<string, PickHistoryRecord[]>();

  for (const record of records) {
    const key = buildSlateKey(record.date, record.league);
    const bucket = grouped.get(key) ?? [];
    bucket.push(record);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries())
    .map(([key, slateRecords]) => {
      const [date, league] = key.split("::");
      return buildSyntheticSlateRecord(date || "", league || "NHL", slateRecords);
    })
    .sort((left, right) => right.date.localeCompare(left.date) || right.league.localeCompare(left.league));
}

export function mergeSlateRecords(explicitSlates: PickSlateRecord[], records: PickHistoryRecord[]): PickSlateRecord[] {
  const byKey = new Map(explicitSlates.map((slate) => [buildSlateKey(slate.date, slate.league), slate]));

  for (const syntheticSlate of buildSyntheticSlateRecords(records)) {
    const key = buildSlateKey(syntheticSlate.date, syntheticSlate.league);
    if (!byKey.has(key)) byKey.set(key, syntheticSlate);
  }

  return Array.from(byKey.values()).sort(
    (left, right) => right.date.localeCompare(left.date) || right.league.localeCompare(left.league),
  );
}

export function isSlateIncomplete(slate: PickSlateRecord) {
  return slate.integrity_status === "incomplete";
}

export function shouldRecoverStoredSlate(slate: PickSlateRecord | null, records: PickHistoryRecord[]) {
  if (!slate) return false;
  if (records.length > 0) return false;
  if (slate.integrity_status !== "incomplete") return false;
  if (slate.provenance !== "original") return false;
  if (slate.pick_count > 0) return false;
  return true;
}
