import { cookies } from "next/headers";
import type { AuthSession, AuthUser, PickHistoryRecord, ProfileRecord } from "@/lib/supabase-types";
import { listPickHistory as listAuthoritativePickHistory } from "@/lib/pick-history-store";
import { normalizePickHistoryRow } from "@/lib/pick-history-integrity";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  deriveName,
  getAuthUser,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isTokenExpired,
  normalizeAuthSession,
  slugifyUsername,
  toErrorMessage,
} from "@/lib/supabase-shared";

type ProfileUpsert = {
  id: string;
  name: string;
  username?: string | null;
  role?: "user" | "admin";
  tier?: "free" | "pro" | "sharp" | "beta";
  stripe_customer_id?: string | null;
  subscription_status?: "none" | "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "coming_soon";
  created_at?: string;
  last_login_at?: string | null;
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

function sanitizeProfile(raw: any): ProfileRecord {
  return {
    id: String(raw?.id ?? ""),
    name: typeof raw?.name === "string" ? raw.name : "Goosalytics User",
    username: typeof raw?.username === "string" ? raw.username : null,
    role: raw?.role === "admin" ? "admin" : "user",
    tier: raw?.tier === "pro" || raw?.tier === "sharp" || raw?.tier === "beta" ? raw.tier : "free",
    stripe_customer_id: typeof raw?.stripe_customer_id === "string" ? raw.stripe_customer_id : null,
    subscription_status: typeof raw?.subscription_status === "string" ? raw.subscription_status : "none",
    created_at: typeof raw?.created_at === "string" ? raw.created_at : new Date(0).toISOString(),
    last_login_at: typeof raw?.last_login_at === "string" ? raw.last_login_at : null,
    email: typeof raw?.email === "string" ? raw.email : null,
  };
}

async function getProfileById(id: string) {
  const rows = await postgrest<any[]>(
    `/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  return rows[0] ? sanitizeProfile(rows[0]) : null;
}

async function listProfiles() {
  const rows = await postgrest<any[]>(
    "/rest/v1/profiles?select=*&order=created_at.desc",
  );
  return rows.map(sanitizeProfile);
}

async function upsertProfile(input: ProfileUpsert) {
  const rows = await postgrest<any[]>(
    "/rest/v1/profiles?on_conflict=id",
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        username: input.username ?? null,
        role: input.role ?? "user",
        last_login_at: input.last_login_at ?? null,
      }),
    },
  );

  return rows[0] ? sanitizeProfile(rows[0]) : null;
}

async function deleteAuthUserById(id: string) {
  const key = getSupabaseServiceRoleKey();
  const response = await fetch(`${getSupabaseUrl()}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete auth user (${response.status})`);
  }
}

async function deleteProfileById(id: string) {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: serviceHeaders({
      Prefer: "return=minimal",
    }),
    cache: "no-store",
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete profile (${response.status})`);
  }
}

async function listPickHistory(limit: number = 500) {
  try {
    return await listAuthoritativePickHistory(limit);
  } catch (err) {
    const message = toErrorMessage(err);
    if (message.includes("is not configured")) return [];
    throw err;
  }
}

async function insertPickHistory(pick: Omit<PickHistoryRecord, "created_at">) {
  try {
    const rows = await postgrest<any[]>(
      "/rest/v1/pick_history",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(pick),
      },
    );

    return rows[0] ? normalizePickHistoryRow(rows[0]) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("pick_type")) throw error;

    const legacyPick = {
      pick_id: pick.id,
      date: pick.date,
      league: pick.league,
      type: pick.pick_type,
      player_name: pick.player_name ?? "",
      team: pick.team,
      opponent: pick.opponent,
      pick_label: pick.pick_label,
      hit_rate: pick.hit_rate,
      edge: pick.edge,
      odds: pick.odds,
      book: pick.book,
      result: pick.result,
      game_id: pick.game_id,
      reasoning: pick.reasoning,
      confidence: pick.confidence,
      units: pick.units,
      provenance: pick.provenance,
      provenance_note: pick.provenance_note,
      pick_snapshot: pick.pick_snapshot,
      updated_at: pick.updated_at,
    };

    const rows = await postgrest<any[]>(
      "/rest/v1/pick_history",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(legacyPick),
      },
    );

    return rows[0] ? normalizePickHistoryRow(rows[0]) : null;
  }
}

async function updatePickHistoryResult(id: string, result: PickHistoryRecord["result"]) {
  try {
    const rows = await postgrest<any[]>(
      `/rest/v1/pick_history?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          result,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    return rows[0] ? normalizePickHistoryRow(rows[0]) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("id")) throw error;

    const rows = await postgrest<any[]>(
      `/rest/v1/pick_history?pick_id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({ result }),
      },
    );

    return rows[0] ? normalizePickHistoryRow(rows[0]) : null;
  }
}

async function getCurrentSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value ?? null;
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value ?? null;

  if (!accessToken || isTokenExpired(accessToken)) return null;

  try {
    const user = await getAuthUser(accessToken);
    return normalizeAuthSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: undefined,
      user,
    });
  } catch {
    return null;
  }
}

async function ensureProfileForUser(user: AuthUser, overrides: Partial<ProfileUpsert> = {}) {
  const metadata = user.user_metadata ?? {};
  const nameFromMetadata = typeof metadata.name === "string" ? metadata.name : null;
  const usernameFromMetadata = typeof metadata.username === "string" ? metadata.username : null;
  const name = overrides.name ?? deriveName(user.email ?? "", nameFromMetadata);
  const username = overrides.username ?? (usernameFromMetadata ? slugifyUsername(usernameFromMetadata) : null);

  try {
    const existing = await getProfileById(user.id);
    if (existing) {
      return upsertProfile({
        id: user.id,
        name: existing.name || name,
        username: existing.username ?? username,
        role: existing.role,
        tier: existing.tier,
        stripe_customer_id: existing.stripe_customer_id,
        subscription_status: existing.subscription_status,
        last_login_at: overrides.last_login_at ?? existing.last_login_at,
      });
    }

    return upsertProfile({
      id: user.id,
      name,
      username,
      role: overrides.role ?? "user",
      tier: overrides.tier ?? "free",
      stripe_customer_id: overrides.stripe_customer_id ?? null,
      subscription_status: overrides.subscription_status ?? "none",
      last_login_at: overrides.last_login_at ?? null,
    });
  } catch (error) {
    throw new Error(toErrorMessage(error, "Failed to sync profile"));
  }
}

export function createServerClient() {
  return {
    auth: {
      getSession: getCurrentSession,
      getUser: async () => {
        const session = await getCurrentSession();
        return session?.user ?? null;
      },
    },
    profiles: {
      getById: getProfileById,
      getCurrent: async () => {
        const session = await getCurrentSession();
        if (!session) return null;
        return getProfileById(session.user.id);
      },
      list: listProfiles,
      upsert: upsertProfile,
      ensureForUser: ensureProfileForUser,
      deleteById: async (id: string) => {
        try {
          await deleteAuthUserById(id);
        } catch (error) {
          await deleteProfileById(id);
          throw error;
        }
        await deleteProfileById(id);
      },
    },
    pickHistory: {
      list: listPickHistory,
      insert: insertPickHistory,
      updateResult: updatePickHistoryResult,
    },
  };
}
