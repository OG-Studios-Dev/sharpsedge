/**
 * system-qualifiers-db.ts
 *
 * Supabase-backed persistence for system qualifier rows and grading outcomes.
 * All operations gracefully fall back (no-op or null) when Supabase is
 * unavailable or the table hasn't been migrated yet.
 *
 * Usage:
 *   - upsertSystemQualifiers(rows)  — persist/update qualifiers after each refresh
 *   - loadPendingQualifiers(systemId) — fetch ungraded rows for grading
 *   - gradeSystemQualifier(id, outcome, netUnits, source, notes) — write grading result
 *   - getSystemPerformanceFromDb(systemId?) — summarized W/L stats per system
 */

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
import type { SystemQualificationLogEntry, SystemQualifierOutcome, SystemQualifierSettlementStatus } from "@/lib/systems-tracking-store";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DbSystemQualifier = {
  id: string;
  system_id: string;
  system_slug: string;
  system_name: string;
  game_date: string;
  logged_at: string;
  qualifier_id: string;
  record_kind: string;
  matchup: string;
  road_team: string;
  home_team: string;
  qualified_team: string | null;
  opponent_team: string | null;
  league: string | null;
  market_type: string | null;
  action_label: string | null;
  action_side: string | null;
  flat_stake_units: number;
  settlement_status: SystemQualifierSettlementStatus;
  outcome: SystemQualifierOutcome;
  net_units: number | null;
  settled_at: string | null;
  graded_at: string | null;
  grading_source: string | null;
  grading_notes: string | null;
  qualifier_odds: number | null;
  source: string | null;
  notes: string | null;
  provenance: Record<string, unknown> | null;
  last_synced_at: string | null;
};

export type DbSystemPerformanceSummary = {
  system_id: string;
  system_slug: string;
  system_name: string;
  league: string | null;
  qualifiers_logged: number;
  graded_qualifiers: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  ungradeable: number;
  win_pct: number | null;
  flat_net_units: number | null;
  first_qualifier_date: string | null;
  last_qualifier_date: string | null;
};

export type GradeQualifierInput = {
  id: string;
  outcome: SystemQualifierOutcome;
  settlementStatus: SystemQualifierSettlementStatus;
  netUnits: number | null;
  gradingSource: string;
  gradingNotes?: string;
};

// ─── Internal helpers ────────────────────────────────────────────────────────

function serviceHeaders() {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

function postgrestUrl(path: string) {
  return `${getSupabaseUrl()}/rest/v1${path}`;
}

async function isSupabaseAvailable(): Promise<boolean> {
  try {
    getSupabaseUrl();
    getSupabaseServiceRoleKey();
    return true;
  } catch {
    return false;
  }
}

async function pgFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  if (!(await isSupabaseAvailable())) return null;

  try {
    const response = await fetch(postgrestUrl(path), {
      ...init,
      headers: {
        ...serviceHeaders(),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      // Table likely not migrated yet — silently skip
      if (response.status === 404 || response.status === 400) {
        const text = await response.text().catch(() => "");
        if (text.includes("relation") || text.includes("does not exist")) {
          return null;
        }
      }
      const text = await response.text().catch(() => String(response.status));
      throw new Error(`Supabase ${response.status}: ${text.slice(0, 200)}`);
    }

    if (response.status === 204) return null as T;
    return await response.json() as T;
  } catch (error) {
    // All Supabase errors are non-fatal — log and return null
    console.warn("[system-qualifiers-db] Supabase op failed (graceful skip):", error instanceof Error ? error.message : error);
    return null;
  }
}

// ─── Convert log entry → DB row ─────────────────────────────────────────────

function logEntryToDbRow(entry: SystemQualificationLogEntry): DbSystemQualifier {
  return {
    id: entry.id,
    system_id: entry.systemId,
    system_slug: entry.systemSlug,
    system_name: entry.systemName,
    game_date: entry.gameDate,
    logged_at: entry.loggedAt,
    qualifier_id: entry.qualifierId,
    record_kind: entry.recordKind,
    matchup: entry.matchup,
    road_team: entry.roadTeam,
    home_team: entry.homeTeam,
    qualified_team: entry.qualifiedTeam ?? null,
    opponent_team: entry.opponentTeam ?? null,
    league: ((): string | null => {
      // Prefer explicit source string, then fall back to system slug/id for reliable detection
      const src = entry.recordSnapshot?.source || "";
      if (src.includes("NHL")) return "NHL";
      if (src.includes("MLB")) return "MLB";
      if (src.includes("NBA")) return "NBA";
      if (src.includes("PGA") || src.includes("golf") || src.includes("Golf")) return "PGA";
      // Slug-based fallback
      const slug = entry.systemSlug || entry.systemId || "";
      if (slug.startsWith("nhl") || slug.includes("swaggy") || slug.includes("coach-no-rest") || slug.includes("bigcat") || slug.includes("fat-tony")) return "NHL";
      if (slug.startsWith("mlb") || slug.includes("falcons") || slug.includes("robbies")) return "MLB";
      if (slug.startsWith("nba") || slug.includes("goose-system")) return "NBA";
      if (slug.startsWith("pga")) return "PGA";
      return null;
    })(),
    market_type: entry.marketType ?? null,
    action_label: entry.actionLabel ?? null,
    action_side: entry.actionSide ?? null,
    flat_stake_units: entry.flatStakeUnits,
    settlement_status: entry.settlementStatus,
    outcome: entry.outcome,
    net_units: entry.netUnits ?? null,
    settled_at: entry.settledAt ?? null,
    graded_at: entry.settledAt ?? null,
    grading_source: null,
    grading_notes: null,
    qualifier_odds: typeof entry.recordSnapshot?.currentMoneyline === "number" ? entry.recordSnapshot.currentMoneyline : null,
    source: entry.source ?? null,
    notes: entry.notes ?? null,
    provenance: entry.recordSnapshot ? (entry.recordSnapshot as unknown as Record<string, unknown>) : null,
    last_synced_at: entry.lastSyncedAt ?? new Date().toISOString(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Upsert a batch of qualifier log entries into Supabase.
 * Silently skips if Supabase unavailable or table missing.
 */
export async function upsertSystemQualifiers(entries: SystemQualificationLogEntry[]): Promise<void> {
  if (!entries.length) return;

  const dedupedById = new Map<string, DbSystemQualifier>();
  for (const entry of entries) {
    const row = logEntryToDbRow(entry);
    dedupedById.set(row.id, row);
  }
  const rows = Array.from(dedupedById.values());

  // Batch in chunks of 50 to avoid payload limits and duplicate-conflict errors
  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await pgFetch("/system_qualifiers", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
    });
  }
}

/**
 * Load all pending (ungraded) qualifiers for one or more systems.
 * Returns [] if Supabase unavailable or table missing.
 */
export async function loadPendingQualifiers(systemId?: string): Promise<DbSystemQualifier[]> {
  const params = new URLSearchParams({
    settlement_status: "eq.pending",
    order: "game_date.asc",
    limit: "200",
  });
  if (systemId) {
    params.set("system_id", `eq.${systemId}`);
  }

  const rows = await pgFetch<DbSystemQualifier[]>(`/system_qualifiers?${params}`);
  return rows ?? [];
}

/**
 * Load all qualifiers for a system (for performance history display).
 * Returns [] if unavailable.
 */
export async function loadSystemQualifiers(systemId: string, limitDays = 90): Promise<DbSystemQualifier[]> {
  const since = new Date(Date.now() - limitDays * 86400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    system_id: `eq.${systemId}`,
    "game_date": `gte.${since}`,
    order: "game_date.desc",
    limit: "500",
  });

  const rows = await pgFetch<DbSystemQualifier[]>(`/system_qualifiers?${params}`);
  return rows ?? [];
}

/**
 * Write grading outcome for a qualifier.
 * Silently skips if Supabase unavailable.
 */
export async function gradeSystemQualifier(input: GradeQualifierInput): Promise<boolean> {
  const patch = {
    outcome: input.outcome,
    settlement_status: input.settlementStatus,
    net_units: input.netUnits,
    settled_at: new Date().toISOString(),
    graded_at: new Date().toISOString(),
    grading_source: input.gradingSource,
    grading_notes: input.gradingNotes ?? null,
    updated_at: new Date().toISOString(),
  };

  const result = await pgFetch(`/system_qualifiers?id=eq.${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return result !== null;
}

/**
 * Batch grade multiple qualifiers in one call.
 */
export async function batchGradeSystemQualifiers(inputs: GradeQualifierInput[]): Promise<number> {
  if (!inputs.length) return 0;

  let graded = 0;
  for (const input of inputs) {
    const ok = await gradeSystemQualifier(input);
    if (ok) graded += 1;
  }
  return graded;
}

/**
 * Get per-system performance summaries from the DB view.
 * Returns [] if unavailable.
 */
export async function getSystemPerformanceFromDb(systemId?: string): Promise<DbSystemPerformanceSummary[]> {
  const params = new URLSearchParams({ order: "system_id.asc" });
  if (systemId) {
    params.set("system_id", `eq.${systemId}`);
  }

  const rows = await pgFetch<DbSystemPerformanceSummary[]>(`/system_performance_summary?${params}`);
  return rows ?? [];
}

/**
 * Check if the system_qualifiers table exists in Supabase.
 * Returns false if unavailable or table missing.
 */
export async function checkSystemQualifiersTableExists(): Promise<boolean> {
  if (!(await isSupabaseAvailable())) return false;

  try {
    const key = getSupabaseServiceRoleKey();
    const response = await fetch(postgrestUrl("/system_qualifiers?limit=1"), {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    return response.ok || response.status === 200;
  } catch {
    return false;
  }
}
