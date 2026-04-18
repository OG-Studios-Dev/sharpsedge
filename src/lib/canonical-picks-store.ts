import { randomUUID } from "node:crypto";
import { createServerClient } from "@/lib/supabase-server";
import type { MarketPickRecord, UserPickEntryRecord, UserPickRecord } from "@/lib/supabase-types";

type CanonicalSnapshotInput = {
  source_system: string;
  source_pick_id?: string | null;
  event_id?: string | null;
  league: string;
  game_date?: string | null;
  game_id?: string | null;
  pick_type: string;
  market_type?: string | null;
  bet_type?: string | null;
  player_name?: string | null;
  team?: string | null;
  opponent?: string | null;
  pick_label: string;
  line?: number | null;
  direction?: string | null;
  book?: string | null;
  odds?: number | null;
  confidence?: number | null;
  hit_rate?: number | null;
  edge?: number | null;
  reasoning?: string | null;
  snapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

type UserPickEntryInput = {
  userPickId: string;
  sourceSystem: string;
  sourcePickId?: string | null;
  entryKind?: UserPickEntryRecord["entry_kind"];
  displayOrder?: number;
  lockedOdds?: number | null;
  lockedLine?: number | null;
  lockedBook?: string | null;
  lockedSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  canonical: CanonicalSnapshotInput;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarketPick(raw: any): MarketPickRecord {
  return {
    id: String(raw?.id ?? ""),
    event_id: typeof raw?.event_id === "string" ? raw.event_id : null,
    source_type: raw?.source_type,
    source_system: typeof raw?.source_system === "string" ? raw.source_system : "unknown",
    source_pick_id: typeof raw?.source_pick_id === "string" ? raw.source_pick_id : null,
    league: typeof raw?.league === "string" ? raw.league : "NHL",
    game_date: typeof raw?.game_date === "string" ? raw.game_date : null,
    game_id: typeof raw?.game_id === "string" ? raw.game_id : null,
    pick_type: typeof raw?.pick_type === "string" ? raw.pick_type : "player",
    market_type: typeof raw?.market_type === "string" ? raw.market_type : null,
    bet_type: typeof raw?.bet_type === "string" ? raw.bet_type : null,
    player_name: typeof raw?.player_name === "string" ? raw.player_name : null,
    team: typeof raw?.team === "string" ? raw.team : null,
    opponent: typeof raw?.opponent === "string" ? raw.opponent : null,
    pick_label: typeof raw?.pick_label === "string" ? raw.pick_label : "",
    line: toNumber(raw?.line),
    direction: typeof raw?.direction === "string" ? raw.direction : null,
    book: typeof raw?.book === "string" ? raw.book : null,
    odds: toNumber(raw?.odds),
    confidence: toNumber(raw?.confidence),
    hit_rate: toNumber(raw?.hit_rate),
    edge: toNumber(raw?.edge),
    reasoning: typeof raw?.reasoning === "string" ? raw.reasoning : null,
    status: raw?.status,
    grading_status: raw?.grading_status,
    graded_at: typeof raw?.graded_at === "string" ? raw.graded_at : null,
    grading_source: typeof raw?.grading_source === "string" ? raw.grading_source : null,
    grading_notes: typeof raw?.grading_notes === "string" ? raw.grading_notes : null,
    result_value: toNumber(raw?.result_value),
    result_text: typeof raw?.result_text === "string" ? raw.result_text : null,
    settled_at: typeof raw?.settled_at === "string" ? raw.settled_at : null,
    snapshot: asObject(raw?.snapshot),
    metadata: asObject(raw?.metadata),
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : new Date(0).toISOString(),
  };
}

async function requireUser() {
  const supabase = createServerClient();
  const user = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function upsertCanonicalMarketPick(input: CanonicalSnapshotInput) {
  const { supabase } = await requireUser();
  const id = input.source_pick_id
    ? `mp:${input.source_system}:${input.source_pick_id}`
    : `mp:${input.source_system}:${randomUUID()}`;

  const rows = await supabase.postgrest<any[]>("/rest/v1/market_picks?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id,
      event_id: input.event_id ?? null,
      source_type: "user",
      source_system: input.source_system,
      source_pick_id: input.source_pick_id ?? null,
      league: input.league,
      game_date: input.game_date ?? null,
      game_id: input.game_id ?? null,
      pick_type: input.pick_type,
      market_type: input.market_type ?? null,
      bet_type: input.bet_type ?? null,
      player_name: input.player_name ?? null,
      team: input.team ?? null,
      opponent: input.opponent ?? null,
      pick_label: input.pick_label,
      line: input.line ?? null,
      direction: input.direction ?? null,
      book: input.book ?? null,
      odds: input.odds ?? null,
      confidence: input.confidence ?? null,
      hit_rate: input.hit_rate ?? null,
      edge: input.edge ?? null,
      reasoning: input.reasoning ?? null,
      snapshot: input.snapshot ?? {},
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    }),
  });

  return rows[0] ? normalizeMarketPick(rows[0]) : null;
}

export async function createUserPickEntry(input: UserPickEntryInput) {
  const { supabase, userId } = await requireUser();
  const canonicalPick = await upsertCanonicalMarketPick(input.canonical);
  const rows = await supabase.postgrest<any[]>("/rest/v1/user_pick_entries", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      user_pick_id: input.userPickId,
      market_pick_id: canonicalPick?.id ?? null,
      entry_kind: input.entryKind ?? "single",
      entry_status: "pending",
      display_order: input.displayOrder ?? 0,
      locked_odds: input.lockedOdds ?? null,
      locked_line: input.lockedLine ?? null,
      locked_book: input.lockedBook ?? null,
      locked_snapshot: input.lockedSnapshot ?? null,
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    }),
  });

  return {
    entry: (rows[0] ?? null) as UserPickEntryRecord | null,
    canonicalPick,
  };
}

export function buildCanonicalInputFromUserPick(pick: UserPickRecord): CanonicalSnapshotInput {
  const snapshot = pick.locked_snapshot ?? pick.metadata ?? {};
  return {
    source_system: "user_picks",
    source_pick_id: pick.id,
    league: pick.league,
    game_date: pick.game_date,
    game_id: pick.game_id,
    pick_type: typeof snapshot.pick_type === "string" ? snapshot.pick_type : pick.player_name ? "player" : "team",
    market_type: typeof snapshot.market_type === "string" ? snapshot.market_type : null,
    bet_type: pick.bet_type,
    player_name: pick.player_name,
    team: pick.team,
    opponent: pick.opponent,
    pick_label: pick.pick_label,
    line: pick.line,
    direction: typeof snapshot.direction === "string" ? snapshot.direction : null,
    book: pick.book,
    odds: pick.odds,
    snapshot: pick.locked_snapshot,
    metadata: pick.metadata,
  };
}
