"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    let cancelled = false;

    async function completeOAuth() {
      const next = safeNext(searchParams.get("next"));

      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase browser auth is not configured");

        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        const accessToken = data.session?.access_token;
        const refreshToken = data.session?.refresh_token;
        if (!accessToken || !refreshToken) throw new Error("No OAuth session was returned");

        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || "Unable to create app session");
        }

        if (cancelled) return;
        setMessage("Signed in. Redirecting...");
        router.replace(next);
        router.refresh();
      } catch (error) {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : "OAuth sign-in failed";
        setMessage(`${detail}. Sending you back to login...`);
        setTimeout(() => router.replace(`/login?error=oauth_callback_failed`), 1200);
      }
    }

    void completeOAuth();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-3 px-6">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">{message}</p>
      </div>
    </main>
  );
}
