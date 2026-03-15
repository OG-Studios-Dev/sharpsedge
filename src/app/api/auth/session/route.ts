import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { clearSessionCookies, setSessionCookies } from "@/lib/session-cookies";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  normalizeBrowserSession,
  restoreSession,
  toErrorMessage,
} from "@/lib/supabase-shared";

function getCookieValue(header: string, name: string) {
  return header
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? null;
}

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const accessToken = getCookieValue(cookieHeader, ACCESS_COOKIE_NAME);
    const refreshToken = getCookieValue(cookieHeader, REFRESH_COOKIE_NAME);
    const session = await restoreSession(accessToken, refreshToken);

    if (!session) {
      const response = NextResponse.json({
        data: { session: null, user: null, profile: null },
        error: null,
      });
      clearSessionCookies(response);
      return response;
    }

    const supabase = createServerClient();
    const profile = await supabase.profiles.ensureForUser(session.user);
    const response = NextResponse.json({
      data: {
        session: normalizeBrowserSession(session),
        user: session.user,
        profile,
      },
      error: null,
    });

    setSessionCookies(response, session);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        data: { session: null, user: null, profile: null },
        error: { message: toErrorMessage(error, "Unable to load session") },
      },
      { status: 500 },
    );
    clearSessionCookies(response);
    return response;
  }
}
