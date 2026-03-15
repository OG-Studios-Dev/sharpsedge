"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Supabase automatically picks up the auth code from the URL hash/params
    // and exchanges it for a session
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Send session to our API to set cookies
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: session.user.email,
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
          credentials: "include",
        });

        router.replace("/");
        router.refresh();
      }
    });

    // Also try to get session from URL (for OAuth redirects)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: session.user.email,
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
          credentials: "include",
        }).then(() => {
          router.replace("/");
          router.refresh();
        });
      }
    });
  }, [router]);

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Signing you in...</p>
      </div>
    </main>
  );
}
