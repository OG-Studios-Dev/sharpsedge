import type { AIPick } from "@/lib/types";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import type { SandboxCreateInput, SandboxPickRecord, SandboxSlateBundle, SandboxSlateRecord } from "@/lib/sandbox/types";
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

function normalizeSlate(raw: any): SandboxSlateRecord {
  return {
    sandbox_key: String(raw?.sandbox_key ?? ""),
    date: String(raw?.date ?? ""),
    league: String(raw?.league ?? ""),
    experiment_tag: typeof raw?.experiment_tag === "string" ? raw.experiment_tag : null,
    status: raw?.status === "locked" || raw?.status === "archived" ? raw.status : "draft",
    pick_count: typeof raw?.pick_count === "number" ? raw.pick_count : 0,
    expected_pick_count: typeof raw?.expected_pick_count === "number" ? raw.expected_pick_count : 3,
    review_status: raw?.review_status === "reviewed" || raw?.review_status === "approved" || raw?.review_status === "rejected" ? raw.review_status : "pending",
    review_notes: typeof raw?.review_notes === "string" ? raw.review_notes : null,
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : null,
  };
}

function normalizePick(raw: any): SandboxPickRecord {
  return {
    id: String(raw?.id ?? ""),
    sandbox_key: String(raw?.sandbox_key ?? ""),
    date: String(raw?.date ?? ""),
    league: String(raw?.league ?? ""),
    pick_type: raw?.pick_type === "team" ? "team" : "player",
    player_name: typeof raw?.player_name === "string" ? raw.player_name : null,
    team: String(raw?.team ?? ""),
    opponent: typeof raw?.opponent === "string" ? raw.opponent : null,
    pick_label: String(raw?.pick_label ?? ""),
    hit_rate: typeof raw?.hit_rate === "number" ? raw.hit_rate : null,
    edge: typeof raw?.edge === "number" ? raw.edge : null,
    odds: typeof raw?.odds === "number" ? raw.odds : null,
    book: typeof raw?.book === "string" ? raw.book : null,
    result: raw?.result === "win" || raw?.result === "loss" || raw?.result === "push" ? raw.result : "pending",
    game_id: typeof raw?.game_id === "string" ? raw.game_id : null,
    reasoning: typeof raw?.reasoning === "string" ? raw.reasoning : null,
    confidence: typeof raw?.confidence === "number" ? raw.confidence : null,
    units: typeof raw?.units === "number" ? raw.units : 1,
    pick_snapshot: raw?.pick_snapshot && typeof raw.pick_snapshot === "object" ? raw.pick_snapshot as AIPick : null,
    experiment_tag: typeof raw?.experiment_tag === "string" ? raw.experiment_tag : null,
    review_status: raw?.review_status === "reviewed" || raw?.review_status === "approved" || raw?.review_status === "rejected" ? raw.review_status : "pending",
    review_notes: typeof raw?.review_notes === "string" ? raw.review_notes : null,
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : null,
  };
}

function buildSandboxRows(input: SandboxCreateInput) {
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
    updated_at: new Date().toISOString(),
  }));
}

function isMissingSandboxRelation(message: string) {
  return message.includes("sandbox_pick_slates") || message.includes("sandbox_pick_history") || message.includes("404");
}

function sandboxSchemaError() {
  return new Error("Sandbox tables are not installed. Run scripts/setup-sandbox-picks.sql in Supabase before using /admin/sandbox.");
}

export async function getSandboxSlateBundle(sandboxKey: string): Promise<SandboxSlateBundle> {
  try {
    const [slates, picks] = await Promise.all([
      postgrest<any[]>(`/rest/v1/sandbox_pick_slates?select=*&sandbox_key=eq.${eq(sandboxKey)}&limit=1`),
      postgrest<any[]>(`/rest/v1/sandbox_pick_history?select=*&sandbox_key=eq.${eq(sandboxKey)}&order=created_at.asc`),
    ]);

    return {
      slate: slates[0] ? normalizeSlate(slates[0]) : null,
      picks: picks.map(normalizePick),
    };
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    throw error;
  }
}

export async function listSandboxSlates(limit: number = 100): Promise<SandboxSlateRecord[]> {
  try {
    const rows = await postgrest<any[]>(`/rest/v1/sandbox_pick_slates?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 500))}`);
    return rows.map(normalizeSlate);
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    throw error;
  }
}

export async function upsertSandboxSlate(input: SandboxCreateInput): Promise<SandboxSlateBundle> {
  if (!input.sandboxKey.trim()) throw new Error("sandboxKey is required");
  if (!input.date.trim()) throw new Error("date is required");
  if (!input.league.trim()) throw new Error("league is required");
  if (!input.picks.length) throw new Error("At least one sandbox pick is required");

  try {
    await postgrest<any[]>("/rest/v1/sandbox_pick_slates?on_conflict=sandbox_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        sandbox_key: input.sandboxKey,
        date: input.date,
        league: input.league,
        experiment_tag: input.experimentTag ?? null,
        status: "draft",
        pick_count: input.picks.length,
        expected_pick_count: input.picks.length,
        review_status: "pending",
        review_notes: input.reviewNotes ?? null,
        updated_at: new Date().toISOString(),
      }),
    });

    await postgrest<any[]>(`/rest/v1/sandbox_pick_history?sandbox_key=eq.${eq(input.sandboxKey)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });

    await postgrest<any[]>("/rest/v1/sandbox_pick_history", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(buildSandboxRows(input)),
    });

    return await getSandboxSlateBundle(input.sandboxKey);
  } catch (error) {
    const message = toErrorMessage(error, "Failed to create sandbox slate");
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

export async function listSandboxBundlesByLeague(league: SandboxLeague, limit: number = 15): Promise<SandboxSlateBundle[]> {
  try {
    const rows = await postgrest<any[]>(`/rest/v1/sandbox_pick_slates?select=*&league=eq.${eq(league)}&order=created_at.desc&limit=${Math.max(1, Math.min(limit, 100))}`);
    const slates = rows.map(normalizeSlate);
    return await Promise.all(slates.map((slate) => getSandboxSlateBundle(slate.sandbox_key)));
  } catch (error) {
    const message = toErrorMessage(error);
    if (isMissingSandboxRelation(message)) throw sandboxSchemaError();
    throw error;
  }
}
