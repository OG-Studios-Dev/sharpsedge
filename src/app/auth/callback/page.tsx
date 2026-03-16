"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    async function handleCallback() {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Check for code in URL params (PKCE flow)
        const code = searchParams.get("code");
        if (code) {
          setStatus("Exchanging auth code...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("Code exchange failed:", error);
          }
        }

        // Get the session (either from code exchange or from hash fragment)
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          setStatus("Setting up your account...");
          // Send tokens to our API to set httpOnly cookies
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: session.user.email,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
            credentials: "include",
          });

          if (res.ok) {
            setStatus("Welcome! Redirecting...");
            router.replace(next);
            router.refresh();
            return;
          }
        }

        // If we got here without a session, try listening for auth state change
        setStatus("Waiting for authentication...");
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === "SIGNED_IN" && session) {
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
            subscription.unsubscribe();
            router.replace(next);
            router.refresh();
          }
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          setStatus("Taking too long — try signing in again");
          subscription.unsubscribe();
          setTimeout(() => router.replace("/login"), 2000);
        }, 10000);

      } catch (err) {
        console.error("Auth callback error:", err);
        setStatus("Something went wrong — redirecting to login");
        setTimeout(() => router.replace("/login"), 2000);
      }
    }

    handleCallback();
  }, [next, router, searchParams]);

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">{status}</p>
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
