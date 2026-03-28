import type { AIPick } from "@/lib/types";
import type { PickHistoryProvenance, PickHistoryRecord, PickSlateRecord } from "@/lib/supabase-types";
import {
  EXPECTED_DAILY_PICK_COUNT,
  buildSyntheticSlateRecord,
  mapPickHistoryRecordToAIPick,
  mergeSlateRecords,
  normalizePickHistoryRow,
  normalizePickSlateRow,
  shouldRecoverStoredSlate,
} from "@/lib/pick-history-integrity";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

type PickHistoryWriteMode = "original" | "manual_repair";

type PickSlateFetchResult = {
  slate: PickSlateRecord | null;
  records: PickHistoryRecord[];
  picks: AIPick[];
};

type StoreDailyPickSlateResult = PickSlateFetchResult & {
  source: "existing" | "stored" | "repaired";
};

type StoreDailyPickSlateOptions = {
  date: string;
  league: string;
  provenance?: PickHistoryProvenance;
  provenanceNote?: string | null;
  mode?: PickHistoryWriteMode;
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return null as T;
    return await response.json() as T;
  }

  let message = `Supabase request failed (${response.status})`;

  try {
    const payload = await response.json() as { message?: string; error?: string; details?: string };
    message = payload.message || payload.error || payload.details || message;
  } catch {
    // ignore malformed payloads
  }

  throw new Error(message);
}

async function postgrest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

function eq(value: string) {
  return encodeURIComponent(value);
}

function buildPickHistoryRows(
  picks: AIPick[],
  provenance: PickHistoryProvenance,
  provenanceNote: string | null,
  mode: "modern" | "legacy" | "legacy_minimal",
) {
  return picks.map((pick) => {
    const resolvedSportsbook = pick.sportsbook || pick.book || null;

    const base = {
      date: pick.date,
      league: pick.league || "NHL",
      player_name: pick.playerName || null,
      team: pick.team,
      opponent: pick.opponent || null,
      pick_label: pick.pickLabel,
      hit_rate: typeof pick.hitRate === "number" ? pick.hitRate : null,
      edge: typeof pick.edge === "number" ? pick.edge : null,
      odds: typeof pick.odds === "number" ? pick.odds : null,
      book: resolvedSportsbook,
      // Note: sportsbook column is only added in modern mode below.
      // Legacy/legacy_minimal modes omit it so they work on older schemas that
      // only have the `book` column. This allows the legacy fallback chain to
      // succeed when the `sportsbook` column hasn't been migrated yet.
      result: pick.result || "pending",
      game_id: pick.gameId || null,
      reasoning: pick.reasoning || null,
      confidence: typeof pick.confidence === "number" ? pick.confidence : null,
      units: pick.units || 1,
    };

    if (mode === "legacy_minimal") {
      return {
        ...base,
        pick_id: pick.id,
        type: pick.type,
      };
    }

    const enriched = {
      ...base,
      provenance,
      provenance_note: provenanceNote,
      pick_snapshot: pick,
      updated_at: new Date().toISOString(),
    };

    return mode === "legacy"
      ? {
        ...enriched,
        pick_id: pick.id,
        type: pick.type,
      }
      : {
        ...enriched,
        id: pick.id,
        pick_type: pick.type,
        sportsbook: resolvedSportsbook,
      };
  });
}

function isMissingRelationError(message: string, relation: string) {
  return message.includes(relation) && (
    message.includes("does not exist")
    || message.includes("Could not find the table")
    || message.includes("schema cache")
  );
}

function isMissingColumnError(message: string, column: string) {
  return message.includes(column) && (
    message.includes("Could not find the")
    || message.includes("schema cache")
    || message.includes("does not exist")
  );
}

function isConflictError(message: string) {
  return message.includes("duplicate key") || message.includes("23505");
}

async function readPickHistoryByDateAndLeague(date: string, league: string) {
  const rows = await postgrest<any[]>(
    `/rest/v1/pick_history?select=*&date=eq.${eq(date)}&league=eq.${eq(league)}&order=created_at.asc`,
  );

  return rows.map(normalizePickHistoryRow);
}

async function readPickSlate(date: string, league: string): Promise<PickSlateRecord | null> {
  try {
    const rows = await postgrest<any[]>(
      `/rest/v1/pick_slates?select=*&date=eq.${eq(date)}&league=eq.${eq(league)}&limit=1`,
    );

    return rows[0] ? normalizePickSlateRow(rows[0]) : null;
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingRelationError(message, "pick_slates")) return null;
    throw error;
  }
}

async function patchPickSlate(date: string, league: string, patch: Record<string, unknown>) {
  const rows = await postgrest<any[]>(
    `/rest/v1/pick_slates?date=eq.${eq(date)}&league=eq.${eq(league)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    },
  );

  return rows[0] ? normalizePickSlateRow(rows[0]) : null;
}

async function tryPatchPickSlate(date: string, league: string, patch: Record<string, unknown>) {
  try {
    return await patchPickSlate(date, league, patch);
  } catch {
    return null;
  }
}

async function insertPickSlate(date: string, league: string, provenance: PickHistoryProvenance, provenanceNote: string | null) {
  try {
    const rows = await postgrest<any[]>(
      "/rest/v1/pick_slates",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          date,
          league,
          status: "incomplete",
          provenance,
          provenance_note: provenanceNote,
          expected_pick_count: EXPECTED_DAILY_PICK_COUNT,
          pick_count: 0,
          status_note: "Slate lock created before pick rows were persisted.",
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );

    return rows[0] ? normalizePickSlateRow(rows[0]) : null;
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingRelationError(message, "pick_slates")) {
      throw new Error("pick_slates is missing. Run scripts/setup-supabase.sql before generating picks.");
    }
    throw error;
  }
}

async function insertPickHistory(picks: AIPick[], provenance: PickHistoryProvenance, provenanceNote: string | null) {
  try {
    const rows = await postgrest<any[]>(
      "/rest/v1/pick_history",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(buildPickHistoryRows(picks, provenance, provenanceNote, "modern")),
      },
    );

    return rows.map(normalizePickHistoryRow);
  } catch (error) {
    const message = toErrorMessage(error);

    const needsLegacyFallback =
      isMissingColumnError(message, "pick_snapshot")
      || isMissingColumnError(message, "provenance")
      || isMissingColumnError(message, "updated_at")
      || isMissingColumnError(message, "id")
      || isMissingColumnError(message, "pick_type")
      || isMissingColumnError(message, "sportsbook");

    if (!needsLegacyFallback) throw error;

    try {
      const rows = await postgrest<any[]>(
        "/rest/v1/pick_history",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify(buildPickHistoryRows(picks, provenance, provenanceNote, "legacy")),
        },
      );

      return rows.map(normalizePickHistoryRow);
    } catch (legacyError) {
      const legacyMessage = toErrorMessage(legacyError);
      if (
        !isMissingColumnError(legacyMessage, "pick_snapshot")
        && !isMissingColumnError(legacyMessage, "provenance")
        && !isMissingColumnError(legacyMessage, "updated_at")
        && !isMissingColumnError(legacyMessage, "id")
        && !isMissingColumnError(legacyMessage, "sportsbook")
      ) {
        throw legacyError;
      }

      const rows = await postgrest<any[]>(
        "/rest/v1/pick_history",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify(buildPickHistoryRows(picks, provenance, provenanceNote, "legacy_minimal")),
        },
      );

      return rows.map(normalizePickHistoryRow);
    }
  }
}

async function patchPickHistoryRow(filterColumn: "id" | "pick_id", pickId: string, body: Record<string, unknown>) {
  await postgrest<any[]>(
    `/rest/v1/pick_history?${filterColumn}=eq.${eq(pickId)}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    },
  );
}

function toFetchResult(slate: PickSlateRecord | null, records: PickHistoryRecord[]): PickSlateFetchResult {
  const syntheticSlate = records.length ? buildSyntheticSlateRecord(records[0].date, records[0].league, records) : null;
  const mergedSlate = (() => {
    if (!slate) return syntheticSlate;
    if (!syntheticSlate) return slate;

    if (
      syntheticSlate.pick_count > slate.pick_count
      || (syntheticSlate.integrity_status === "ok" && slate.integrity_status !== "ok")
    ) {
      return {
        ...slate,
        ...syntheticSlate,
        locked_at: slate.locked_at,
        created_at: slate.created_at,
        updated_at: slate.updated_at ?? syntheticSlate.updated_at,
      };
    }

    return slate;
  })();

  return {
    slate: mergedSlate,
    records,
    picks: records.map(mapPickHistoryRecordToAIPick),
  };
}

async function hydrateRecoverableSlate(
  existing: PickSlateFetchResult,
  picks: AIPick[],
  options: StoreDailyPickSlateOptions,
): Promise<StoreDailyPickSlateResult> {
  const mode = options.mode ?? "original";
  const provenance = options.provenance ?? (mode === "manual_repair" ? "manual_repair" : "original");
  const provenanceNote = options.provenanceNote ?? existing.slate?.provenance_note ?? null;

  try {
    const records = await insertPickHistory(picks, provenance, provenanceNote);
    const slate = await patchPickSlate(options.date, options.league, {
      status: records.length >= EXPECTED_DAILY_PICK_COUNT ? "locked" : "incomplete",
      provenance,
      provenance_note: provenanceNote,
      pick_count: records.length,
      status_note: records.length >= EXPECTED_DAILY_PICK_COUNT
        ? null
        : `Only ${records.length} of ${EXPECTED_DAILY_PICK_COUNT} picks were persisted.`,
    });

    return {
      source: "repaired",
      ...toFetchResult(slate, records),
    };
  } catch (error) {
    const message = toErrorMessage(error, "Recoverable slate exists but pick rows were not persisted.");
    await tryPatchPickSlate(options.date, options.league, {
      status: "incomplete",
      pick_count: 0,
      status_note: message,
    });

    if (isConflictError(message)) {
      const refreshed = await getStoredPickSlate(options.date, options.league);
      return {
        source: "existing",
        ...refreshed,
      };
    }

    throw error;
  }
}

export async function getStoredPickSlate(date: string, league: string): Promise<PickSlateFetchResult> {
  const [slate, records] = await Promise.all([
    readPickSlate(date, league),
    readPickHistoryByDateAndLeague(date, league),
  ]);

  return toFetchResult(slate, records);
}

export async function storeDailyPickSlate(
  picks: AIPick[],
  options: StoreDailyPickSlateOptions,
): Promise<StoreDailyPickSlateResult> {
  if (!picks.length) {
    throw new Error("Cannot store an empty pick slate.");
  }

  const mode = options.mode ?? "original";
  const provenance = options.provenance ?? (mode === "manual_repair" ? "manual_repair" : "original");
  const provenanceNote = options.provenanceNote ?? null;

  try {
    await insertPickSlate(options.date, options.league, provenance, provenanceNote);
  } catch (error) {
    const message = toErrorMessage(error);
    if (!isConflictError(message)) throw error;

    const existing = await getStoredPickSlate(options.date, options.league);
    if (shouldRecoverStoredSlate(existing.slate, existing.records)) {
      return hydrateRecoverableSlate(existing, picks, options);
    }

    return {
      source: "existing",
      ...existing,
    };
  }

  try {
    const records = await insertPickHistory(picks, provenance, provenanceNote);
    const slate = await patchPickSlate(options.date, options.league, {
      status: records.length >= EXPECTED_DAILY_PICK_COUNT ? "locked" : "incomplete",
      pick_count: records.length,
      status_note: records.length >= EXPECTED_DAILY_PICK_COUNT
        ? null
        : `Only ${records.length} of ${EXPECTED_DAILY_PICK_COUNT} picks were persisted.`,
    });

    return {
      source: "stored",
      ...toFetchResult(slate, records),
    };
  } catch (error) {
    await tryPatchPickSlate(options.date, options.league, {
      status: "incomplete",
      pick_count: 0,
      status_note: toErrorMessage(error, "Slate lock exists but pick rows were not persisted."),
    });
    throw error;
  }
}

export async function updatePickResultsInSupabase(picks: AIPick[]): Promise<void> {
  if (!picks.length) return;

  await Promise.all(picks.map(async (pick) => {
    const body: Record<string, unknown> = {
      result: pick.result,
      updated_at: new Date().toISOString(),
    };

    if (typeof pick.odds === "number" && Number.isFinite(pick.odds)) {
      body.odds = pick.odds;
    }

    if (typeof pick.units === "number" && Number.isFinite(pick.units)) {
      body.units = pick.units;
    }

    const patchBodies: Array<Record<string, unknown>> = [body];
    if ("updated_at" in body) {
      patchBodies.push({ result: pick.result });
    }

    const filterColumns: Array<"id" | "pick_id"> = ["id", "pick_id"];
    let lastError: unknown = null;

    for (const filterColumn of filterColumns) {
      for (const patchBody of patchBodies) {
        try {
          await patchPickHistoryRow(filterColumn, pick.id, patchBody);
          return;
        } catch (error) {
          lastError = error;
          const message = toErrorMessage(error);
          if (filterColumn === "id" && isMissingColumnError(message, "id")) continue;
          if (filterColumn === "pick_id" && isMissingColumnError(message, "pick_id")) break;
          if (patchBody === body && isMissingColumnError(message, "updated_at")) {
            continue;
          }
          throw error;
        }
      }
    }

    throw lastError ?? new Error(`Failed to update pick result for ${pick.id}`);
  }));
}

export async function listPickHistory(limit: number = 500): Promise<PickHistoryRecord[]> {
  const rows = await postgrest<any[]>(
    `/rest/v1/pick_history?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 2000))}`,
  );

  return rows.map(normalizePickHistoryRow);
}

export async function listPickSlates(limit: number = 500, records?: PickHistoryRecord[]): Promise<PickSlateRecord[]> {
  const fallbackRecords = records ?? await listPickHistory(limit);

  try {
    const rows = await postgrest<any[]>(
      `/rest/v1/pick_slates?select=*&order=locked_at.desc&limit=${Math.max(1, Math.min(limit, 2000))}`,
    );

    return mergeSlateRecords(rows.map(normalizePickSlateRow), fallbackRecords);
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingRelationError(message, "pick_slates")) {
      return mergeSlateRecords([], fallbackRecords);
    }
    throw error;
  }
}
