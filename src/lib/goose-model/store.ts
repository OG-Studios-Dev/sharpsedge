// ============================================================
// Goose AI Picks Model — Supabase store
// Reads/writes goose_model_picks and goose_signal_weights.
// NEVER touches pick_history or pick_slates.
// Gracefully degrades if tables don't exist yet.
// ============================================================

import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import type { GooseModelPick, GoosePickResult, GooseSignalWeight, GooseModelStats, GooseIntegrityStatus } from "./types";

// ── helpers ─────────────────────────────────────────────────

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
    return (await response.json()) as T;
  }
  let message = `Supabase request failed (${response.status})`;
  try {
    const payload = (await response.json()) as { message?: string; error?: string; details?: string };
    message = payload.message || payload.error || payload.details || message;
  } catch {
    // ignore
  }
  throw new Error(message);
}

async function postgrest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

function isMissingTableError(message: string, table: string): boolean {
  return (
    (message.includes(table) || message.includes("relation") || message.includes("404")) &&
    (message.includes("does not exist") ||
      message.includes("Could not find") ||
      message.includes("schema cache") ||
      message.includes("404"))
  );
}

// ── normalizers ──────────────────────────────────────────────

function normalizePick(raw: Record<string, unknown>): GooseModelPick {
  const result = raw.result as string;
  const is = raw.integrity_status as string | null;
  const integrityStatus: GooseIntegrityStatus | null =
    is === "ok" || is === "unresolvable" || is === "postponed" || is === "void" ? is : null;
  return {
    id: String(raw.id ?? ""),
    date: String(raw.date ?? ""),
    sport: String(raw.sport ?? ""),
    pick_label: String(raw.pick_label ?? ""),
    pick_type: raw.pick_type === "team" ? "team" : "player",
    player_name: typeof raw.player_name === "string" ? raw.player_name : null,
    team: typeof raw.team === "string" ? raw.team : null,
    opponent: typeof raw.opponent === "string" ? raw.opponent : null,
    game_id: typeof raw.game_id === "string" ? raw.game_id : null,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : null,
    signals_present: Array.isArray(raw.signals_present) ? (raw.signals_present as string[]) : [],
    odds: typeof raw.odds === "number" ? raw.odds : null,
    book: typeof raw.book === "string" ? raw.book : null,
    hit_rate_at_time: typeof raw.hit_rate_at_time === "number" ? raw.hit_rate_at_time : null,
    confidence: typeof raw.confidence === "number" ? raw.confidence : null,
    result: result === "win" || result === "loss" || result === "push" ? result : "pending",
    integrity_status: integrityStatus,
    actual_result: typeof raw.actual_result === "string" ? raw.actual_result : null,
    model_version: String(raw.model_version ?? "v1"),
    source: raw.source === "generated" ? "generated" : "captured",
    pick_snapshot:
      raw.pick_snapshot && typeof raw.pick_snapshot === "object"
        ? (raw.pick_snapshot as Record<string, unknown>)
        : null,
    promoted_to_production: Boolean(raw.promoted_to_production),
    promotion_notes: typeof raw.promotion_notes === "string" ? raw.promotion_notes : null,
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}

function normalizeWeight(raw: Record<string, unknown>): GooseSignalWeight {
  return {
    id: String(raw.id ?? ""),
    signal: String(raw.signal ?? ""),
    sport: String(raw.sport ?? "ALL"),
    appearances: Number(raw.appearances ?? 0),
    wins: Number(raw.wins ?? 0),
    losses: Number(raw.losses ?? 0),
    pushes: Number(raw.pushes ?? 0),
    win_rate: Number(raw.win_rate ?? 0),
    last_updated: String(raw.last_updated ?? new Date().toISOString()),
  };
}

// ── picks CRUD ───────────────────────────────────────────────

export interface CapturePicksInput {
  date: string;
  sport: string;
  picks: Array<{
    pick_label: string;
    pick_type: "player" | "team";
    player_name?: string | null;
    team?: string | null;
    opponent?: string | null;
    game_id?: string | null;
    reasoning?: string | null;
    signals_present?: string[];
    odds?: number | null;
    book?: string | null;
    hit_rate_at_time?: number | null;
    confidence?: number | null;
    model_version?: string;
    source?: "captured" | "generated";
    pick_snapshot?: Record<string, unknown> | null;
  }>;
}

export async function captureGoosePicks(input: CapturePicksInput): Promise<GooseModelPick[]> {
  const now = new Date().toISOString();
  const rows = input.picks.map((p) => ({
    date: input.date,
    sport: input.sport,
    pick_label: p.pick_label,
    pick_type: p.pick_type ?? "player",
    player_name: p.player_name ?? null,
    team: p.team ?? null,
    opponent: p.opponent ?? null,
    game_id: p.game_id ?? null,
    reasoning: p.reasoning ?? null,
    signals_present: p.signals_present ?? [],
    odds: p.odds ?? null,
    book: p.book ?? null,
    hit_rate_at_time: p.hit_rate_at_time ?? null,
    confidence: p.confidence ?? null,
    result: "pending",
    model_version: p.model_version ?? "v1",
    source: p.source ?? "captured",
    pick_snapshot: p.pick_snapshot ?? null,
    promoted_to_production: false,
    updated_at: now,
  }));

  try {
    const inserted = await postgrest<Record<string, unknown>[]>("/rest/v1/goose_model_picks", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    return (inserted ?? []).map(normalizePick);
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) {
      console.warn("[goose-model] goose_model_picks table not found — run migration first");
      return [];
    }
    throw error;
  }
}

export async function listGoosePicks(opts: {
  date?: string;
  sport?: string;
  result?: GoosePickResult | "all";
  source?: "captured" | "generated" | "all";
  limit?: number;
} = {}): Promise<GooseModelPick[]> {
  const params: string[] = ["order=created_at.desc"];
  if (opts.date) params.push(`date=eq.${eq(opts.date)}`);
  if (opts.sport) params.push(`sport=eq.${eq(opts.sport)}`);
  if (opts.result && opts.result !== "all") params.push(`result=eq.${eq(opts.result)}`);
  if (opts.source && opts.source !== "all") params.push(`source=eq.${eq(opts.source)}`);
  params.push(`limit=${Math.min(opts.limit ?? 200, 1000)}`);

  try {
    const rows = await postgrest<Record<string, unknown>[]>(
      `/rest/v1/goose_model_picks?select=*&${params.join("&")}`,
    );
    return (rows ?? []).map(normalizePick);
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) return [];
    throw error;
  }
}

export interface GradeGoosePickOptions {
  /** The outcome to record */
  result: GoosePickResult;
  /** Optional free-text: what actually happened (score, stat, etc.) */
  actual_result?: string | null;
  /** Optional integrity status override (ok | unresolvable | postponed | void) */
  integrity_status?: GooseIntegrityStatus | null;
}

/**
 * Grade a goose pick. Handles regrading: if the pick already has a
 * non-pending result, the old signal-weight contribution is reversed
 * before the new one is applied.
 */
export async function gradeGoosePick(id: string, opts: GoosePickResult | GradeGoosePickOptions): Promise<void> {
  // Normalise args — accept old string shorthand or new options object
  const options: GradeGoosePickOptions = typeof opts === "string" ? { result: opts } : opts;
  const { result, actual_result, integrity_status } = options;

  // Fetch the current pick so we can detect a regrade and get signals
  let existingPick: Record<string, unknown> | null = null;
  try {
    const rows = await postgrest<Record<string, unknown>[]>(
      `/rest/v1/goose_model_picks?id=eq.${eq(id)}&select=id,result,signals_present,sport&limit=1`,
    );
    existingPick = rows?.[0] ?? null;
  } catch {
    // Non-fatal — proceed without regrade undo
  }

  const oldResult = existingPick ? String(existingPick.result ?? "") : "pending";
  const isRegrade = oldResult !== "pending" && oldResult !== result;

  // Undo signal weights for old result if regrading
  if (isRegrade && existingPick) {
    const signals = Array.isArray(existingPick.signals_present)
      ? (existingPick.signals_present as string[])
      : [];
    const sport = String(existingPick.sport ?? "");
    if (signals.length > 0 && sport) {
      try {
        await reverseSignalWeightsForPick(signals, sport, oldResult as GoosePickResult);
      } catch (err) {
        console.warn("[goose-model/store] regrade: failed to reverse signal weights", {
          id,
          oldResult,
          error: toErrorMessage(err),
        });
      }
    }
  }

  // Persist the new grade
  try {
    const patch: Record<string, unknown> = {
      result,
      updated_at: new Date().toISOString(),
    };
    if (actual_result !== undefined) patch.actual_result = actual_result ?? null;
    if (integrity_status !== undefined) patch.integrity_status = integrity_status ?? null;

    await postgrest(`/rest/v1/goose_model_picks?id=eq.${eq(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) return;
    throw error;
  }
}

/**
 * Mark a pick with a terminal integrity status without changing the result.
 * Used for: unresolvable, postponed, void.
 */
export async function setGoosePickIntegrity(
  id: string,
  integrity_status: GooseIntegrityStatus,
  extra?: { actual_result?: string },
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      integrity_status,
      updated_at: new Date().toISOString(),
    };
    if (extra?.actual_result !== undefined) patch.actual_result = extra.actual_result;

    await postgrest(`/rest/v1/goose_model_picks?id=eq.${eq(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) return;
    throw error;
  }
}

export async function promoteGoosePick(id: string, notes?: string): Promise<void> {
  try {
    await postgrest(`/rest/v1/goose_model_picks?id=eq.${eq(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        promoted_to_production: true,
        promotion_notes: notes ?? null,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) return;
    throw error;
  }
}

export async function getGooseModelStats(sport?: string): Promise<GooseModelStats> {
  const picks = await listGoosePicks({ sport, limit: 2000 });
  const settled = picks.filter((p) => p.result !== "pending");
  const wins = settled.filter((p) => p.result === "win").length;
  const losses = settled.filter((p) => p.result === "loss").length;
  const pushes = settled.filter((p) => p.result === "push").length;
  return {
    total: picks.length,
    wins,
    losses,
    pushes,
    pending: picks.filter((p) => p.result === "pending").length,
    win_rate: settled.length > 0 ? wins / settled.length : 0,
  };
}

// ── signal weights CRUD ──────────────────────────────────────

export async function listSignalWeights(sport?: string): Promise<GooseSignalWeight[]> {
  const params: string[] = ["order=win_rate.desc"];
  if (sport) params.push(`sport=eq.${eq(sport)}`);

  try {
    const rows = await postgrest<Record<string, unknown>[]>(
      `/rest/v1/goose_signal_weights?select=*&${params.join("&")}`,
    );
    return (rows ?? []).map(normalizeWeight);
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_signal_weights")) return [];
    throw error;
  }
}

/**
 * Reverse the signal-weight contribution of a previously graded pick.
 * Called during regrading to undo the old result before applying the new one.
 */
export async function reverseSignalWeightsForPick(
  signals: string[],
  sport: string,
  result: GoosePickResult,
): Promise<void> {
  // Pushes never modified weights, so nothing to reverse
  if (!signals.length || result === "pending" || result === "push") return;

  const now = new Date().toISOString();
  const sportsToUpdate = Array.from(new Set([sport, "ALL"]));

  for (const sig of signals) {
    for (const sp of sportsToUpdate) {
      try {
        const existing = await postgrest<Record<string, unknown>[]>(
          `/rest/v1/goose_signal_weights?select=*&signal=eq.${eq(sig)}&sport=eq.${eq(sp)}&limit=1`,
        );
        const row = existing?.[0];
        if (!row) continue;

        // Cast to string to avoid TS narrowing complaints after the push guard above
        const r = result as string;
        const appearances = Math.max(0, Number(row.appearances ?? 0) - 1);
        const wins = Math.max(0, Number(row.wins ?? 0) - (r === "win" ? 1 : 0));
        const losses = Math.max(0, Number(row.losses ?? 0) - (r === "loss" ? 1 : 0));
        const pushes = Number(row.pushes ?? 0); // pushes never modified weights; nothing to reverse
        const settled = wins + losses;
        const win_rate = settled > 0 ? wins / settled : 0;

        const payload = { signal: sig, sport: sp, appearances, wins, losses, pushes, win_rate, last_updated: now };

        await postgrest("/rest/v1/goose_signal_weights?on_conflict=signal,sport", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        const msg = toErrorMessage(error);
        if (isMissingTableError(msg, "goose_signal_weights")) return;
        console.warn("[goose-model] failed to reverse signal weight", { sig, sp, error: msg });
      }
    }
  }
}

export async function updateSignalWeightsForPick(
  signals: string[],
  sport: string,
  result: GoosePickResult,
): Promise<void> {
  // Pushes leave signal weights unchanged per spec (units = 0, no learning signal)
  if (!signals.length || result === "pending" || result === "push") return;

  const now = new Date().toISOString();

  // We update each signal × sport combo + the ALL aggregate
  const sportsToUpdate = Array.from(new Set([sport, "ALL"]));

  for (const sig of signals) {
    for (const sp of sportsToUpdate) {
      try {
        // Try to fetch existing row first
        const existing = await postgrest<Record<string, unknown>[]>(
          `/rest/v1/goose_signal_weights?select=*&signal=eq.${eq(sig)}&sport=eq.${eq(sp)}&limit=1`,
        );

        // Cast to string to avoid TS narrowing complaints after the push guard above
        const r = result as string;
        const row = existing?.[0];
        const appearances = Number(row?.appearances ?? 0) + 1;
        const wins = Number(row?.wins ?? 0) + (r === "win" ? 1 : 0);
        const losses = Number(row?.losses ?? 0) + (r === "loss" ? 1 : 0);
        const pushes = Number(row?.pushes ?? 0); // pushes never update weights per spec
        const settled = wins + losses; // pushes excluded from win_rate
        const win_rate = settled > 0 ? wins / settled : 0;

        const payload = { signal: sig, sport: sp, appearances, wins, losses, pushes, win_rate, last_updated: now };

        await postgrest("/rest/v1/goose_signal_weights?on_conflict=signal,sport", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        const msg = toErrorMessage(error);
        if (isMissingTableError(msg, "goose_signal_weights")) return;
        console.warn("[goose-model] failed to update signal weight", { sig, sp, error: msg });
      }
    }
  }
}

/**
 * Called after batch grading to bulk-update signal weights.
 */
export async function applyGradedPicksToWeights(picks: GooseModelPick[]): Promise<void> {
  const settled = picks.filter(
    (p) => p.result !== "pending" && p.signals_present.length > 0,
  );
  for (const pick of settled) {
    await updateSignalWeightsForPick(pick.signals_present, pick.sport, pick.result);
  }
}

// ── match helpers for auto-grading ───────────────────────────

/**
 * Find pending goose picks for a given date + sport.
 * Optionally filter by game_id.
 */
export async function findPendingGoosePicks(opts: {
  date: string;
  sport: string;
  game_id?: string;
}): Promise<GooseModelPick[]> {
  const params: string[] = [
    "result=eq.pending",
    `date=eq.${eq(opts.date)}`,
    `sport=eq.${eq(opts.sport.toUpperCase())}`,
    "select=*",
  ];
  if (opts.game_id) params.push(`game_id=eq.${eq(opts.game_id)}`);

  try {
    const rows = await postgrest<Record<string, unknown>[]>(
      `/rest/v1/goose_model_picks?${params.join("&")}`,
    );
    return (rows ?? []).map(normalizePick);
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) return [];
    throw error;
  }
}

/**
 * Fetch goose picks from yesterday that are still pending and have no
 * terminal integrity_status. Used by the 2am grading cron.
 */
export async function fetchUngradedYesterdayPicks(): Promise<GooseModelPick[]> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const params = [
    `date=eq.${eq(dateStr)}`,
    "result=eq.pending",
    // Exclude postponed (will retry) and unresolvable (permanent skip)
    "integrity_status=is.null",
    "select=*",
    "limit=200",
  ];

  try {
    const rows = await postgrest<Record<string, unknown>[]>(
      `/rest/v1/goose_model_picks?${params.join("&")}`,
    );
    return (rows ?? []).map(normalizePick);
  } catch (error) {
    const msg = toErrorMessage(error);
    if (isMissingTableError(msg, "goose_model_picks")) return [];
    throw error;
  }
}

// ── model score helper ────────────────────────────────────────

/**
 * Given a set of signals present on a candidate pick,
 * compute a model score using learned signal weights.
 * Falls back to 0 if weights table isn't populated yet.
 */
export async function scorePickBySignals(
  signals: string[],
  sport: string,
): Promise<number> {
  if (!signals.length) return 0;
  const weights = await listSignalWeights(sport);
  const weightMap = new Map(weights.map((w) => [w.signal, w]));

  let totalScore = 0;
  let totalWeight = 0;

  for (const sig of signals) {
    const w = weightMap.get(sig);
    if (!w || w.appearances < 5) continue; // need at least 5 appearances to trust
    totalScore += w.win_rate * w.appearances;
    totalWeight += w.appearances;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}
