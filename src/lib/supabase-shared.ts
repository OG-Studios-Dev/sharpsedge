import type { AuthSession, AuthUser, BrowserSession } from "@/lib/supabase-types";

export const ACCESS_COOKIE_NAME = "goosalytics-access-token";
export const REFRESH_COOKIE_NAME = "goosalytics-refresh-token";

const SESSION_REFRESH_SKEW_SECONDS = 30;
const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SupabaseErrorPayload = {
  error?: string;
  msg?: string;
  message?: string;
  error_description?: string;
};

export function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return value.replace(/\/+$/, "");
}

export function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  return value;
}

export function getSupabaseServiceRoleKey() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return value;
}

export function toErrorMessage(error: unknown, fallback = "Request failed") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function getAuthErrorStatus(error: unknown, fallback = 500) {
  const message = toErrorMessage(error, "").toLowerCase();

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid refresh token") ||
    message.includes("jwt") ||
    message.includes("token")
  ) {
    return 401;
  }

  if (
    message.includes("password") ||
    message.includes("email") ||
    message.includes("already registered") ||
    message.includes("invalid") ||
    message.includes("required")
  ) {
    return 400;
  }

  return fallback;
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);

  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(padded, "base64").toString("utf8");
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const decoded = base64UrlDecode(payload);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getTokenExpiry(token?: string | null) {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === "number" ? exp : null;
}

export function isTokenExpired(token?: string | null) {
  const exp = getTokenExpiry(token);
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return exp <= now + SESSION_REFRESH_SKEW_SECONDS;
}

function normalizeAuthUser(raw: any): AuthUser {
  const metadata = raw?.user_metadata && typeof raw.user_metadata === "object"
    ? raw.user_metadata as Record<string, unknown>
    : {};

  const preferredName = [metadata.name, metadata.full_name, metadata.username]
    .find((value) => typeof value === "string" && value.trim().length > 0);

  return {
    id: String(raw?.id ?? ""),
    email: typeof raw?.email === "string" ? raw.email : null,
    name: typeof preferredName === "string" ? preferredName : null,
    user_metadata: metadata,
    app_metadata: raw?.app_metadata && typeof raw.app_metadata === "object"
      ? raw.app_metadata as Record<string, unknown>
      : {},
    last_sign_in_at: typeof raw?.last_sign_in_at === "string" ? raw.last_sign_in_at : null,
  };
}

export function normalizeBrowserSession(session: AuthSession | null): BrowserSession | null {
  if (!session) return null;
  return {
    user: normalizeAuthUser(session.user),
    expires_at: typeof session.expires_at === "number" ? session.expires_at : null,
  };
}

export function normalizeAuthSession(raw: any): AuthSession | null {
  if (!raw?.access_token || !raw?.refresh_token || !raw?.user) return null;
  return {
    access_token: String(raw.access_token),
    refresh_token: String(raw.refresh_token),
    expires_in: Number(raw.expires_in ?? 0) || 0,
    expires_at: Number(raw.expires_at ?? getTokenExpiry(String(raw.access_token)) ?? 0) || 0,
    token_type: typeof raw.token_type === "string" ? raw.token_type : "bearer",
    user: normalizeAuthUser(raw.user),
  };
}

export function slugifyUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function deriveName(email: string, preferred?: string | null) {
  if (preferred?.trim()) return preferred.trim();
  const local = email.split("@")[0] ?? "Goosalytics User";
  const label = local.replace(/[._-]+/g, " ").trim();
  return label
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ") || "Goosalytics User";
}

async function parseSupabaseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return null as T;
    return await response.json() as T;
  }

  let message = `Supabase request failed (${response.status})`;

  try {
    const payload = await response.json() as SupabaseErrorPayload;
    message = payload.message || payload.error_description || payload.msg || payload.error || message;
  } catch {
    // ignore malformed error payloads
  }

  throw new Error(message);
}

export async function supabaseAuthFetch<T>(
  path: string,
  init: RequestInit,
  options: { useServiceRole?: boolean } = {},
) {
  const apiKey = options.useServiceRole ? getSupabaseServiceRoleKey() : getSupabaseAnonKey();
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  return parseSupabaseResponse<T>(response);
}

export async function signInWithPassword(email: string, password: string) {
  return normalizeAuthSession(await supabaseAuthFetch<any>(
    "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  ));
}

export async function signUpWithPassword(
  email: string,
  password: string,
  metadata: Record<string, unknown>,
) {
  const payload = await supabaseAuthFetch<any>(
    "/auth/v1/signup",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        data: metadata,
      }),
    },
  );

  return {
    user: payload?.user ? normalizeAuthUser(payload.user) : null,
    session: normalizeAuthSession(payload?.session ?? payload),
  };
}

export async function refreshSession(refreshToken: string) {
  return normalizeAuthSession(await supabaseAuthFetch<any>(
    "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  ));
}

export async function getAuthUser(accessToken: string) {
  const payload = await supabaseAuthFetch<any>(
    "/auth/v1/user",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  return normalizeAuthUser(payload);
}

export async function signOut(accessToken: string) {
  await supabaseAuthFetch(
    "/auth/v1/logout",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export async function restoreSession(accessToken?: string | null, refreshToken?: string | null) {
  if (accessToken && !isTokenExpired(accessToken)) {
    try {
      const user = await getAuthUser(accessToken);
      return normalizeAuthSession({
        access_token: accessToken,
        refresh_token: refreshToken,
        user,
      });
    } catch {
      // fall through to refresh
    }
  }

  if (!refreshToken) return null;
  return refreshSession(refreshToken);
}

export function getRefreshCookieMaxAge() {
  return REFRESH_COOKIE_MAX_AGE_SECONDS;
}
