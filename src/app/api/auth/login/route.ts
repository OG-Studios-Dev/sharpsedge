import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { setSessionCookies } from "@/lib/session-cookies";
import { normalizeBrowserSession, signInWithPassword, toErrorMessage } from "@/lib/supabase-shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          data: { session: null, user: null, profile: null },
          error: { message: "Email and password are required" },
        },
        { status: 400 },
      );
    }

    const session = await signInWithPassword(email, password);
    if (!session) {
      return NextResponse.json(
        {
          data: { session: null, user: null, profile: null },
          error: { message: "Unable to sign in" },
        },
        { status: 401 },
      );
    }

    const supabase = createServerClient();
    const profile = await supabase.profiles.ensureForUser(session.user, {
      last_login_at: new Date().toISOString(),
    });

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
    return NextResponse.json(
      {
        data: { session: null, user: null, profile: null },
        error: { message: toErrorMessage(error, "Sign-in failed") },
      },
      { status: 500 },
    );
  }
}
