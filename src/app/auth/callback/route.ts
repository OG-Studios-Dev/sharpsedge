import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (code) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data.session) {
        const response = NextResponse.redirect(new URL(next, req.url));
        // Set session cookies so middleware recognizes the user
        response.cookies.set("goosalytics-access-token", data.session.access_token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: data.session.expires_in || 3600,
        });
        response.cookies.set("goosalytics-refresh-token", data.session.refresh_token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });
        return response;
      }
    } catch {
      // fall through
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_failed", req.url));
}
