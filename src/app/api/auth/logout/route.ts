import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/session-cookies";
import { ACCESS_COOKIE_NAME, signOut } from "@/lib/supabase-shared";

export async function POST(request: Request) {
  const response = NextResponse.json({
    data: { session: null, user: null, profile: null },
    error: null,
  });

  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ACCESS_COOKIE_NAME}=`))
    ?.slice(ACCESS_COOKIE_NAME.length + 1);

  if (accessToken) {
    try {
      await signOut(accessToken);
    } catch {
      // clearing local cookies is enough for client logout
    }
  }

  clearSessionCookies(response);
  return response;
}
