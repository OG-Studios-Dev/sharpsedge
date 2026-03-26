import type { AIPick } from "@/lib/types";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import type {
  SandboxCreateInput,
  SandboxLearningNotes,
  SandboxOutcome,
  SandboxPickRecord,
  SandboxReviewChecklist,
  SandboxReviewDecision,
  SandboxReviewSnapshot,
  SandboxSlateBundle,
  SandboxSlateRecord,
} from "@/lib/sandbox/types";
import type { SandboxLeague } from "@/lib/sandbox/generator";

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

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length ? value : null;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeDecision(raw: any): SandboxReviewDecision {
  return {
    status: raw?.status === "reviewed" || raw?.status === "approved" || raw?.status === "rejected" ? raw.status : "pending",
    reviewer: asNullableString(raw?.reviewer),
    reviewed_at: asNullableString(raw?.reviewed_at),
  };
}

function normalizeChecklist(raw: any): SandboxReviewChecklist {
  return {
    home_away: asNullableString(raw?.home_away),
    travel_rest: asNullableString(raw?.travel_rest),
    injuries_news: asNullableString(raw?.injuries_news),
    matchup_context: asNullableString(raw?.matchup_context),
    price_discipline: asNullableString(raw?.price_discipline),
  };
}

function normalizeLearnings(raw: any): SandboxLearningNotes {
  return {
    pregame: asNullableString(raw?.pregame),
    postmortem: asNullableString(raw?.postmortem),
    model_adjustment: asNullableString(raw?.model_adjustment),
  };
}

function normalizeOutcome(value: unknown): SandboxOutcome {
  return value === "win" || value === "loss" || value === "push" || value === "void" ? value : "pending";
}

function emptyReviewSnapshot(status: SandboxReviewDecision["status"], reviewNotes: string | null): SandboxReviewSnapshot {
  return {
    separation: "sandbox_only",
    visibility: "admin_only",
    checklist: {
      home_away: null,
      travel_rest: null,
      injuries_news: null,
      matchup_context: null,
      price_discipline: null,
    },
    learnings: {
      pregame: reviewNotes,
      postmortem: null,
      model_adjustment: null,
    },
    decision: {
      status,
      reviewer: null,
      reviewed_at: null,
    },
    outcome: "pending",
    outcome_notes: null,
  };
}

function normalizeReviewSnapshot(raw: any, reviewStatus: SandboxReviewDecision["status"], reviewNotes: string | null, result?: unknown): SandboxReviewSnapshot {
  const fallback = emptyReviewSnapshot(reviewStatus, reviewNotes);
  if (!raw || typeof raw !== "object") {
    return {
      ...fallback,
      outcome: normalizeOutcome(result),
    };
  }

  return {
    separation: raw?.separation === "sandbox_only" ? "sandbox_only" : "sandbox_only",
    visibility: raw?.visibility === "admin_only" ? "admin_only" : "admin_only",
    checklist: normalizeChecklist(raw?.checklist),
    learnings: normalizeLearnings(raw?.learnings),
    decision: normalizeDecision(raw?.decision ?? { status: reviewStatus }),
    outcome: normalizeOutcome(raw?.outcome ?? result),
    outcome_notes: asNullableString(raw?.outcome_notes),
  };
}

function buildDefaultPickReviewSnapshot(pick: AIPick, reviewNotes: string | null): SandboxReviewSnapshot {
  return {
    separation: "sandbox_only",
    visibility: "admin_only",
    checklist: {
      home_away: `Validate ${pick.team}${pick.opponent ? ` vs ${pick.opponent}` : ""} split before trusting the edge.`,
      travel_rest: `Confirm travel/rest context for ${pick.team}${pick.opponent ? ` and ${pick.opponent}` : ""}.`,
      injuries_news: `Check injuries/news for ${pick.playerName ?? pick.team} before treating this as real signal.`,
      matchup_context: `Pressure-test matchup, pace/game script, and role stability for ${pick.pickLabel}.`,
      price_discipline: `Only compare against real book price after confirming ${pick.book ?? "model line"} is not overstating the edge.`,
    },
    learnings: {
      pregame: reviewNotes ?? pick.reasoning ?? null,
      postmortem: null,
      model_adjustment: null,
    },
    decision: {
      status: "pending",
      reviewer: null,
      reviewed_at: null,
    },
    outcome: normalizeOutcome(pick.result),
    outcome_notes: null,
  };
}

function buildDefaultSlateReviewSnapshot(input: SandboxCreateInput): SandboxReviewSnapshot {
  return {
    separation: "sandbox_only",
    visibility: "admin_only",
    checklist: {
      home_away: `${input.league} slate requires explicit home/away review before any production promotion.`,
      travel_rest: `${input.league} slate requires travel/rest review for every correlated spot.`,
      injuries_news: `${input.league} slate requires same-day injuries/news confirmation before locking learnings.`,
      matchup_context: `Review game environment, role stability, and opponent context across all ${input.picks.length} sandbox picks.`,
      price_discipline: `Do not compare sandbox hit rates to production without explicit price-discipline notes.`,
    },
    learnings: {
      pregame: input.reviewNotes ?? `${input.league} sandbox daily review initialized for ${input.date}.`,
      postmortem: null,
      model_adjustment: null,
    },
    decision: {
      status: "pending",
      reviewer: null,
      reviewed_at: null,
    },
    outcome: "pending",
    outcome_notes: null,
  };
}

function normalizeSlate(raw: any): SandboxSlateRecord {
  const review_status = raw?.review_status === "reviewed" || raw?.review_status === "approved" || raw?.review_status === "rejected" ? raw.review_status : "pending";
  const review_notes = asNullableString(raw?.review_notes);
  return {
    sandbox_key: String(raw?.sandbox_key ?? ""),
    date: String(raw?.date ?? ""),
    league: String(raw?.league ?? ""),
    experiment_tag: asNullableString(raw?.experiment_tag),
    status: raw?.status === "locked" || raw?.status === "archived" ? raw.status : "draft",
    pick_count: typeof raw?.pick_count === "number" ? raw.pick_count : 0,
    expected_pick_count: typeof raw?.expected_pick_count === "number" ? raw.expected_pick_count : 10,
    review_status,
    review_notes,
    review_snapshot: normalizeReviewSnapshot(raw?.review_snapshot, review_status, review_notes),
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : null,
  };
}

function normalizePick(raw: any): SandboxPickRecord {
  const review_status = raw?.review_status === "reviewed" || raw?.review_status === "approved" || raw?.review_status === "rejected" ? raw.review_status : "pending";
  const review_notes = asNullableString(raw?.review_notes);
  const result = raw?.result === "win" || raw?.result === "loss" || raw?.result === "push" ? raw.result : "pending";
  return {
    id: String(raw?.id ?? ""),
    sandbox_key: String(raw?.sandbox_key ?? ""),
    date: String(raw?.date ?? ""),
    league: String(raw?.league ?? ""),
    pick_type: raw?.pick_type === "team" ? "team" : "player",
    player_name: asNullableString(raw?.player_name),
    team: String(raw?.team ?? ""),
    opponent: asNullableString(raw?.opponent),
    pick_label: String(raw?.pick_label ?? ""),
    hit_rate: asNullableNumber(raw?.hit_rate),
    edge: asNullableNumber(raw?.edge),
    odds: asNullableNumber(raw?.odds),
    book: asNullableString(raw?.book),
    result,
    game_id: asNullableString(raw?.game_id),
    reasoning: asNullableString(raw?.reasoning),
    confidence: asNullableNumber(raw?.confidence),
    units: typeof raw?.units === "number" && Number.isFinite(raw.units) ? raw.units : 1,
    pick_snapshot: raw?.pick_snapshot && typeof raw.pick_snapshot === "object" ? raw.pick_snapshot as AIPick : null,
    experiment_tag: asNullableString(raw?.experiment_tag),
    review_status,
    review_notes,
    review_snapshot: normalizeReviewSnapshot(raw?.review_snapshot, review_status, review_notes, result),
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : null,
  };
}

function buildSandboxRows(input: SandboxCreateInput) {
  const now = new Date().toISOString();
  return input.picks.map((pick) => ({
    id: pick.id,
    sandbox_key: input.sandboxKey,
    date: input.date,
    league: input.league,
    pick_type: pick.type,
    player_name: pick.playerName ?? null,
    team: pick.team,
    opponent: pick.opponent ?? null,
    pick_label: pick.pickLabel,
    hit_rate: typeof pick.hitRate === "number" ? pick.hitRate : null,
    edge: typeof pick.edge === "number" ? pick.edge : null,
    odds: typeof pick.odds === "number" ? pick.odds : null,
    book: pick.book ?? null,
    result: pick.result ?? "pending",
    game_id: pick.gameId ?? null,
    reasoning: pick.reasoning ?? null,
    confidence: typeof pick.confidence === "number" ? pick.confidence : null,
    units: pick.units || 1,
    pick_snapshot: pick,
    experiment_tag: input.experimentTag ?? null,
    review_status: "pending",
    review_notes: null,
    review_snapshot: buildDefaultPickReviewSnapshot(pick, pick.reasoning ?? null),
    updated_at: now,
  }));
}

function isMissingSandboxRelation(message: string) {
  return message.includes("sandbox_pick_slates") || message.includes("sandbox_pick_history") || message.includes("404");
}

function isMissingSandboxReviewSnapshotColumn(message: string) {
  return message.includes("review_snapshot") && message.includes("column");
}

function sandboxSchemaError() {
  return new Error("Sandbox tables are not installed. Run scripts/setup-sandbox-picks.sql in Supabase before using /admin/sandbox.");
}

async function getSandboxSlateBundleWithSelect(sandboxKey: string, select: string): Promise<SandboxSlateBundle> {
  const [slates, picks] = await Promise.all([
    postgrest<any[]>(`/rest/v1/sandbox_pick_slates?select=${select}&sandbox_key=eq.${eq(sandboxKey)}&limit=1`),
    postgrest<any[]>(`/rest/v1/sandbox_pick_history?select=${select}&sandbox_key=eq.${eq(sandboxKey)}&order=created_at.asc`),
  ]);

  return {
    slate: slates[0] ? normalizeSlate(slates[0]) : null,
    picks: picks.map(normalizePick),
  };
}

export async function getSandboxSlateBundle(sandboxKey: string): Promise<SandboxSlateBundle> {
  try {
    return await getSandboxSlateBundleWithSelect(sandboxKey, "*");
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    if (isMissingSandboxReviewSnapshotColumn(message)) {
      return await getSandboxSlateBundleWithSelect(sandboxKey, "sandbox_key,date,league,experiment_tag,status,pick_count,expected_pick_count,review_status,review_notes,created_at,updated_at");
    }
    throw error;
  }
}

async function listSandboxSlatesWithSelect(select: string, limit: number = 100): Promise<SandboxSlateRecord[]> {
  const rows = await postgrest<any[]>(`/rest/v1/sandbox_pick_slates?select=${select}&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 500))}`);
  return rows.map(normalizeSlate);
}

export async function listSandboxSlates(limit: number = 100): Promise<SandboxSlateRecord[]> {
  try {
    return await listSandboxSlatesWithSelect("*", limit);
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    if (isMissingSandboxReviewSnapshotColumn(message)) {
      return await listSandboxSlatesWithSelect("sandbox_key,date,league,experiment_tag,status,pick_count,expected_pick_count,review_status,review_notes,created_at,updated_at", limit);
    }
    throw error;
  }
}

async function postSlateRow(payload: Record<string, unknown>) {
  return await postgrest<any[]>("/rest/v1/sandbox_pick_slates?on_conflict=sandbox_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
}

async function postPickRows(payload: Record<string, unknown>[]) {
  return await postgrest<any[]>("/rest/v1/sandbox_pick_history", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
}

export async function upsertSandboxSlate(input: SandboxCreateInput): Promise<SandboxSlateBundle> {
  if (!input.sandboxKey.trim()) throw new Error("sandboxKey is required");
  if (!input.date.trim()) throw new Error("date is required");
  if (!input.league.trim()) throw new Error("league is required");
  if (!input.picks.length) throw new Error("At least one sandbox pick is required");

  const now = new Date().toISOString();
  const slatePayload = {
    sandbox_key: input.sandboxKey,
    date: input.date,
    league: input.league,
    experiment_tag: input.experimentTag ?? null,
    status: "draft",
    pick_count: input.picks.length,
    expected_pick_count: input.picks.length,
    review_status: "pending",
    review_notes: input.reviewNotes ?? null,
    review_snapshot: buildDefaultSlateReviewSnapshot(input),
    updated_at: now,
  };

  try {
    await postSlateRow(slatePayload);
  } catch (error) {
    const message = toErrorMessage(error, "Failed to create sandbox slate");
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    if (!isMissingSandboxReviewSnapshotColumn(message)) throw new Error(message);

    await postSlateRow({
      sandbox_key: input.sandboxKey,
      date: input.date,
      league: input.league,
      experiment_tag: input.experimentTag ?? null,
      status: "draft",
      pick_count: input.picks.length,
      expected_pick_count: input.picks.length,
      review_status: "pending",
      review_notes: input.reviewNotes ?? null,
      updated_at: now,
    });
  }

  try {
    await postgrest<any[]>(`/rest/v1/sandbox_pick_history?sandbox_key=eq.${eq(input.sandboxKey)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    await postPickRows(buildSandboxRows(input));
  } catch (error) {
    const message = toErrorMessage(error, "Failed to create sandbox picks");
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    if (!isMissingSandboxReviewSnapshotColumn(message)) throw new Error(message);

    const rowsWithoutSnapshot = buildSandboxRows(input).map(({ review_snapshot, ...row }) => row);
    await postPickRows(rowsWithoutSnapshot);
  }

  try {
    return await getSandboxSlateBundle(input.sandboxKey);
  } catch (error) {
    const message = toErrorMessage(error, "Failed to load sandbox slate");
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    throw new Error(message);
  }
}

export async function createSandboxSlate(input: SandboxCreateInput): Promise<SandboxSlateBundle> {
  return upsertSandboxSlate(input);
}

export async function listSandboxSlateBundles(limit: number = 30): Promise<SandboxSlateBundle[]> {
  const slates = await listSandboxSlates(limit);
  return await Promise.all(slates.map((slate) => getSandboxSlateBundle(slate.sandbox_key)));
}

async function listSandboxBundlesByLeagueWithSelect(league: SandboxLeague, select: string, limit: number = 15): Promise<SandboxSlateBundle[]> {
  const rows = await postgrest<any[]>(`/rest/v1/sandbox_pick_slates?select=${select}&league=eq.${eq(league)}&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 100))}`);
  const slates = rows.map(normalizeSlate);
  return await Promise.all(slates.map((slate) => getSandboxSlateBundle(slate.sandbox_key)));
}

export async function listSandboxBundlesByLeague(league: SandboxLeague, limit: number = 15): Promise<SandboxSlateBundle[]> {
  try {
    return await listSandboxBundlesByLeagueWithSelect(league, "*", limit);
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    if (isMissingSandboxReviewSnapshotColumn(message)) {
      return await listSandboxBundlesByLeagueWithSelect(league, "sandbox_key,date,league,experiment_tag,status,pick_count,expected_pick_count,review_status,review_notes,created_at,updated_at", limit);
    }
    throw error;
  }
}

// ── Individual pick CRUD ─────────────────────────────────────

/**
 * Fetch a single sandbox pick by id from sandbox_pick_history.
 * Returns null if not found.
 */
export async function getSandboxPickById(id: string): Promise<SandboxPickRecord | null> {
  try {
    const rows = await postgrest<any[]>(
      `/rest/v1/sandbox_pick_history?id=eq.${eq(id)}&select=*&limit=1`,
    );
    const row = rows?.[0];
    return row ? normalizePick(row) : null;
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) return null;
    throw error;
  }
}

/**
 * Set the outcome on a sandbox pick and return the updated record.
 * Merges outcome and outcome_notes into review_snapshot.
 *
 * @param id           sandbox_pick_history.id
 * @param outcome      New outcome value
 * @param outcomeNotes Optional notes describing what happened
 * @returns Updated SandboxPickRecord, or null if not found
 */
export async function setSandboxPickOutcome(
  id: string,
  outcome: SandboxOutcome,
  outcomeNotes?: string | null,
): Promise<SandboxPickRecord | null> {
  const existing = await getSandboxPickById(id);
  if (!existing) return null;

  const now = new Date().toISOString();

  // Merge outcome into the existing review_snapshot JSON
  const updatedSnapshot = {
    ...existing.review_snapshot,
    outcome,
    outcome_notes: outcomeNotes ?? existing.review_snapshot.outcome_notes,
  };

  try {
    const rows = await postgrest<any[]>(`/rest/v1/sandbox_pick_history?id=eq.${eq(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        review_snapshot: updatedSnapshot,
        result: outcome === "void" ? "void" : outcome, // keep result column in sync
        updated_at: now,
      }),
    });
    const row = rows?.[0];
    return row ? normalizePick(row) : null;
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) return null;
    throw error;
  }
}

// ── Goose-model learning bridge ──────────────────────────────

/**
 * Convert a SandboxOutcome to a GoosePickResult.
 * Sandbox uses "void" for DNP; goose model uses the same.
 * "pending" outcomes are excluded from weight learning.
 */
function sandboxOutcomeToGooseResult(outcome: SandboxOutcome): "win" | "loss" | "push" | "void" | null {
  if (outcome === "win") return "win";
  if (outcome === "loss") return "loss";
  if (outcome === "push") return "push";
  if (outcome === "void") return "void";
  return null; // "pending" → skip
}

/**
 * Extract signal tags from a sandbox pick for goose-model learning.
 * Uses pick_snapshot.factors.signals when present; falls back to
 * re-tagging from reasoning text.
 */
function extractSandboxSignals(pick: SandboxPickRecord): string[] {
  // If the pick was generated through goose-model, factors.signals is the ground truth
  const snapshot = pick.pick_snapshot as any;
  const factorSignals = snapshot?.factors?.signals;
  if (Array.isArray(factorSignals) && factorSignals.length > 0) {
    return factorSignals as string[];
  }

  // Fallback: re-tag from reasoning — import inline to avoid circular deps
  // (signal-tagger is side-effect free and has no server-only imports)
  try {
    // Dynamic require at runtime (server-only context)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { tagSignals } = require("@/lib/goose-model/signal-tagger") as {
      tagSignals: (reasoning: string | null, label?: string | null) => string[];
    };
    return tagSignals(pick.reasoning, pick.pick_label);
  } catch {
    return [];
  }
}

/**
 * Propagate sandbox pick outcomes to goose_signal_weights so the
 * learning engine picks up on sandbox results automatically.
 *
 * Called after a sandbox pick is graded (outcome set to win/loss/push).
 * Skips pending and void outcomes (void = DNP, no learning signal).
 *
 * This is the key bridge between the sandbox test lane and the
 * goose-model learning layer.
 */
export async function applyOutcomeToGooseWeights(pick: SandboxPickRecord): Promise<void> {
  const gooseResult = sandboxOutcomeToGooseResult(pick.review_snapshot.outcome);
  if (!gooseResult || gooseResult === "void") return;

  const signals = extractSandboxSignals(pick);
  if (!signals.length) return;

  const sport = (pick.league || "").toUpperCase() || "NBA";

  try {
    // Import at call time to avoid circular dependency at module load
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { updateSignalWeightsForPick } = require("@/lib/goose-model/store") as {
      updateSignalWeightsForPick: (signals: string[], sport: string, result: "win" | "loss" | "push") => Promise<void>;
    };
    await updateSignalWeightsForPick(signals, sport, gooseResult);
    console.info(`[sandbox/store] applied sandbox outcome (${gooseResult}) to goose weights for ${signals.length} signals (${sport})`);
  } catch (err) {
    // Non-fatal — learning propagation failure should never block grading
    console.warn("[sandbox/store] failed to propagate outcome to goose weights", { error: String(err) });
  }
}

/**
 * Apply outcomes from a batch of graded sandbox picks to goose_signal_weights.
 * Skips any pick that is still pending.
 */
export async function applyBatchOutcomesToGooseWeights(picks: SandboxPickRecord[]): Promise<number> {
  let applied = 0;
  for (const pick of picks) {
    try {
      await applyOutcomeToGooseWeights(pick);
      applied++;
    } catch {
      // already logged inside applyOutcomeToGooseWeights
    }
  }
  return applied;
}
