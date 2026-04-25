import type { UserPickRecord, UserPickStatsRecord, UserPickStatus } from "@/lib/supabase-types";
import { createServerClient } from "@/lib/supabase-server";
import { buildCanonicalInputFromUserPick, createUserPickEntry } from "@/lib/canonical-picks-store";
import { computeUserPickStats } from "@/lib/user-picks-analytics";

export type CreateUserPickInput = {
  source_type: UserPickRecord["source_type"];
  source_id?: string | null;
  parent_pick_id?: string | null;
  kind?: UserPickRecord["kind"];
  status?: UserPickStatus;
  league: string;
  game_date?: string | null;
  game_id?: string | null;
  team?: string | null;
  opponent?: string | null;
  player_name?: string | null;
  pick_label: string;
  detail?: string | null;
  bet_type?: string | null;
  market_type?: string | null;
  line?: number | null;
  odds?: number | null;
  book?: string | null;
  units?: number;
  risk_amount?: number | null;
  to_win_amount?: number | null;
  metadata?: Record<string, unknown> | null;
  locked_snapshot?: Record<string, unknown> | null;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateProfitUnits(status: UserPickStatus, units: number, odds?: number | null) {
  if (status === "loss") return -Math.abs(units);
  if (status !== "win") return 0;
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return Math.abs(units);
  return odds > 0 ? Math.abs(units) * (odds / 100) : Math.abs(units) * (100 / Math.abs(odds));
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeUserPickRow(raw: any): UserPickRecord {
  return {
    id: String(raw?.id ?? ""),
    user_id: String(raw?.user_id ?? ""),
    source_type: raw?.source_type,
    source_id: typeof raw?.source_id === "string" ? raw.source_id : null,
    parent_pick_id: typeof raw?.parent_pick_id === "string" ? raw.parent_pick_id : null,
    kind: raw?.kind,
    status: raw?.status,
    league: typeof raw?.league === "string" ? raw.league : "NHL",
    game_date: typeof raw?.game_date === "string" ? raw.game_date : null,
    game_id: typeof raw?.game_id === "string" ? raw.game_id : null,
    team: typeof raw?.team === "string" ? raw.team : null,
    opponent: typeof raw?.opponent === "string" ? raw.opponent : null,
    player_name: typeof raw?.player_name === "string" ? raw.player_name : null,
    pick_label: typeof raw?.pick_label === "string" ? raw.pick_label : "",
    detail: typeof raw?.detail === "string" ? raw.detail : null,
    bet_type: typeof raw?.bet_type === "string" ? raw.bet_type : null,
    market_type: typeof raw?.market_type === "string" ? raw.market_type : null,
    line: raw?.line == null ? null : toNumber(raw.line, 0),
    odds: raw?.odds == null ? null : toNumber(raw.odds, 0),
    book: typeof raw?.book === "string" ? raw.book : null,
    units: toNumber(raw?.units, 1),
    risk_amount: raw?.risk_amount == null ? null : toNumber(raw.risk_amount, 0),
    to_win_amount: raw?.to_win_amount == null ? null : toNumber(raw.to_win_amount, 0),
    profit_units: toNumber(raw?.profit_units, 0),
    result_settled_at: typeof raw?.result_settled_at === "string" ? raw.result_settled_at : null,
    placed_at: typeof raw?.placed_at === "string" ? raw.placed_at : new Date(0).toISOString(),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : new Date(0).toISOString(),
    metadata: parseJsonObject(raw?.metadata),
    locked_snapshot: parseJsonObject(raw?.locked_snapshot),
  };
}

function normalizeUserPickStatsRow(raw: any): UserPickStatsRecord {
  return {
    user_id: String(raw?.user_id ?? ""),
    total_picks: toNumber(raw?.total_picks, 0),
    settled_picks: toNumber(raw?.settled_picks, 0),
    wins: toNumber(raw?.wins, 0),
    losses: toNumber(raw?.losses, 0),
    pushes: toNumber(raw?.pushes, 0),
    pending: toNumber(raw?.pending, 0),
    win_rate: toNumber(raw?.win_rate, 0),
    profit_units: toNumber(raw?.profit_units, 0),
    roi: toNumber(raw?.roi, 0),
    current_streak: toNumber(raw?.current_streak, 0),
    best_win_streak: toNumber(raw?.best_win_streak, 0),
    updated_at: typeof raw?.updated_at === "string" ? raw.updated_at : new Date(0).toISOString(),
  };
}

async function requireUserId() {
  const supabase = createServerClient();
  const user = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Unauthorized");
  return user.id;
}

export async function listCurrentUserPicks(limit = 250) {
  const userId = await requireUserId();
  const supabase = createServerClient();
  const rows = await supabase.postgrest<any[]>(`/rest/v1/user_picks?select=*&user_id=eq.${encodeURIComponent(userId)}&order=placed_at.desc&limit=${Math.max(1, Math.min(limit, 1000))}`);
  return rows.map(normalizeUserPickRow);
}

export async function createCurrentUserPick(input: CreateUserPickInput) {
  const userId = await requireUserId();
  const supabase = createServerClient();
  const status = input.status ?? "pending";
  const units = input.units ?? 1;
  const rows = await supabase.postgrest<any[]>("/rest/v1/user_picks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      source_type: input.source_type,
      source_id: input.source_id ?? null,
      parent_pick_id: input.parent_pick_id ?? null,
      kind: input.kind ?? "single",
      status,
      league: input.league,
      game_date: input.game_date ?? null,
      game_id: input.game_id ?? null,
      team: input.team ?? null,
      opponent: input.opponent ?? null,
      player_name: input.player_name ?? null,
      pick_label: input.pick_label,
      detail: input.detail ?? null,
      bet_type: input.bet_type ?? null,
      market_type: input.market_type ?? null,
      line: input.line ?? null,
      odds: input.odds ?? null,
      book: input.book ?? null,
      units,
      risk_amount: input.risk_amount ?? null,
      to_win_amount: input.to_win_amount ?? null,
      profit_units: calculateProfitUnits(status, units, input.odds),
      result_settled_at: status === "pending" ? null : new Date().toISOString(),
      metadata: input.metadata ?? {},
      locked_snapshot: input.locked_snapshot ?? null,
    }),
  });
  const pick = rows[0] ? normalizeUserPickRow(rows[0]) : null;
  if (pick) {
    await createUserPickEntry({
      userPickId: pick.id,
      sourceSystem: "user_picks",
      sourcePickId: pick.id,
      entryKind: pick.kind === "parlay" ? "parlay" : pick.kind === "parlay_leg" ? "parlay_leg" : "single",
      lockedOdds: pick.odds,
      lockedLine: pick.line,
      lockedBook: pick.book,
      lockedSnapshot: pick.locked_snapshot,
      metadata: pick.metadata,
      canonical: buildCanonicalInputFromUserPick(pick),
    });
  }
  return pick;
}

export async function updateCurrentUserPickStatus(id: string, status: UserPickStatus) {
  const userId = await requireUserId();
  const supabase = createServerClient();
  const existingRows = await supabase.postgrest<any[]>(`/rest/v1/user_picks?select=*&id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  const existing = existingRows[0] ? normalizeUserPickRow(existingRows[0]) : null;
  const rows = await supabase.postgrest<any[]>(`/rest/v1/user_picks?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status,
      profit_units: existing ? calculateProfitUnits(status, existing.units, existing.odds) : 0,
      updated_at: new Date().toISOString(),
      result_settled_at: status === "pending" ? null : new Date().toISOString(),
    }),
  });
  return rows[0] ? normalizeUserPickRow(rows[0]) : null;
}

export async function deleteCurrentUserPick(id: string) {
  const userId = await requireUserId();
  const supabase = createServerClient();
  await supabase.postgrest(`/rest/v1/user_picks?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  return { ok: true };
}

export async function getCurrentUserPickStats() {
  const userId = await requireUserId();
  const supabase = createServerClient();
  const rows = await supabase.postgrest<any[]>(`/rest/v1/user_pick_stats?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  if (rows[0]) return normalizeUserPickStatsRow(rows[0]);

  const picks = await listCurrentUserPicks(1000);
  return computeUserPickStats(picks, userId);
}
