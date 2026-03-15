"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Supabase automatically picks up the auth code from the URL hash/params
    // and exchanges it for a session
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
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

        router.replace(next);
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
          router.replace(next);
          router.refresh();
        });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [next, router]);

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Signing you in...</p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-dark-bg" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
