import type { NextResponse } from "next/server";
import type { AuthSession } from "@/lib/supabase-types";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, getRefreshCookieMaxAge } from "@/lib/supabase-shared";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

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
}
