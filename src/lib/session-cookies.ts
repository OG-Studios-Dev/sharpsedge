import type { NextResponse } from "next/server";
import type { AuthSession } from "@/lib/supabase-types";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, getRefreshCookieMaxAge } from "@/lib/supabase-shared";
import type { ProfileRecord } from "@/lib/supabase-types";
import { getEffectiveTier } from "@/lib/tier-access";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const PROFILE_TIER_COOKIE_NAME = "goosalytics-tier";

function accessCookieMaxAge(session: AuthSession) {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(session.expires_at - now, 0);
}

export function setSessionCookies(response: NextResponse, session: AuthSession) {
  response.cookies.set(ACCESS_COOKIE_NAME, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: accessCookieMaxAge(session),
  });

  response.cookies.set(REFRESH_COOKIE_NAME, session.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: getRefreshCookieMaxAge(),
  });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: 0,
  });

  response.cookies.set(PROFILE_TIER_COOKIE_NAME, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: 0,
  });
}

export function setProfileCookies(response: NextResponse, profile: ProfileRecord | null) {
  const tier = getEffectiveTier(profile);

  response.cookies.set(PROFILE_TIER_COOKIE_NAME, tier, {
    httpOnly: false,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: getRefreshCookieMaxAge(),
  });
}
