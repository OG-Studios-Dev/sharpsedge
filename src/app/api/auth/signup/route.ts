import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { setProfileCookies, setSessionCookies } from "@/lib/session-cookies";
import {
  deriveName,
  normalizeBrowserSession,
  signUpWithPassword,
  slugifyUsername,
  toErrorMessage,
} from "@/lib/supabase-shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const rawName = typeof body?.options?.data?.name === "string" ? body.options.data.name : "";
    const rawUsername = typeof body?.options?.data?.username === "string" ? body.options.data.username : "";
    const name = deriveName(email, rawName);
    const username = rawUsername.trim() ? slugifyUsername(rawUsername) : null;

    if (!email || !password) {
      return NextResponse.json(
        {
          data: { session: null, user: null, profile: null },
          error: { message: "Email and password are required" },
        },
        { status: 400 },
      );
    }

    const { user, session } = await signUpWithPassword(email, password, {
      name,
      username,
    });

    if (!user) {
      return NextResponse.json(
        {
          data: { session: null, user: null, profile: null },
          error: { message: "Unable to create account" },
        },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const profile = await supabase.profiles.upsert({
      id: user.id,
      name,
      username,
      role: "user",
      tier: "free",
      subscription_status: "none",
      last_login_at: session ? new Date().toISOString() : null,
    });
    const preferences = await supabase.preferences.ensureForUser(user.id);

    const response = NextResponse.json({
      data: {
        session: normalizeBrowserSession(session),
        user,
        profile,
        preferences,
      },
      error: null,
    });

    if (session) {
      setSessionCookies(response, session);
    }
    setProfileCookies(response, profile);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: { session: null, user: null, profile: null },
        error: { message: toErrorMessage(error, "Sign-up failed") },
      },
      { status: 500 },
    );
  }
}
