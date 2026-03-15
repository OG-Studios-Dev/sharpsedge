"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-client";
import { createClient } from "@supabase/supabase-js";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const redirectTo = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : "https://goosalytics.vercel.app/auth/callback";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(result.error.message);
      setPending(false);
      return;
    }

    const next = searchParams.get("next") || "/dashboard";
    router.replace(next === "/" ? "/dashboard" : next);
    router.refresh();
  }

  async function handleSocialLogin(provider: "google" | "apple" | "azure") {
    setPending(true);
    setError(null);
    try {
      const realSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await realSupabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) {
        setError(error.message);
        setPending(false);
      }
    } catch (err) {
      setError("Social login not available yet");
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-12 flex items-center justify-center relative overflow-hidden">
      {/* Background Noise & Glow */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-blue/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="mx-auto max-w-sm w-full space-y-8 relative z-10">
        <div className="text-center space-y-3">
          <Link href="/" className="inline-block transition-transform hover:scale-105">
            <img src="/logo.jpg" alt="Goosalytics" className="w-24 h-24 mx-auto border-[3px] border-dark-border/80 shadow-[0_0_30px_rgba(74,158,255,0.2)] rounded-[24px] object-cover" />
          </Link>
          <div>
              <h1 className="text-2xl font-heading font-black text-text-platinum tracking-tight mt-4">Terminal Access</h1>
              <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 mt-1">Identify to proceed</p>
          </div>
        </div>

        <div className="rounded-[32px] border border-dark-border/80 bg-gradient-to-br from-dark-surface/80 to-dark-bg p-8 shadow-[0_16px_40px_-15px_rgba(0,0,0,0.8)] space-y-6">
          {/* Google Login */}
          <button
            type="button"
            onClick={() => handleSocialLogin("google")}
            disabled={pending}
            className="group flex min-h-[52px] w-full items-center justify-center gap-3 rounded-[16px] border border-dark-border/60 bg-dark-surface/60 px-4 text-[13px] font-bold text-text-platinum transition-all hover:bg-dark-surface hover:text-white hover:border-dark-border disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] drop-shadow-md" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="font-sans">Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-dark-border/40" />
            <span className="text-[9px] font-mono font-bold text-text-platinum/30 uppercase tracking-[0.2em]">or</span>
            <div className="flex-1 h-px bg-dark-border/40" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 ml-1">Email Coordinates</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 w-full rounded-[16px] border border-dark-border/60 bg-dark-bg/80 px-4 text-white font-mono text-[13px] outline-none transition-colors placeholder:text-text-platinum/20 focus:border-accent-blue/60 focus:bg-dark-bg focus:ring-1 focus:ring-accent-blue/40 shadow-inner"
                placeholder="agent@example.com"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 ml-1">Access Cipher</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-14 w-full rounded-[16px] border border-dark-border/60 bg-dark-bg/80 px-4 text-white font-mono text-[13px] outline-none transition-colors placeholder:text-text-platinum/20 focus:border-accent-blue/60 focus:bg-dark-bg focus:ring-1 focus:ring-accent-blue/40 shadow-inner"
                placeholder="••••••••••"
              />
            </label>

            {error && (
              <div className="rounded-[16px] border border-accent-red/30 bg-accent-red/10 p-3 flex items-start gap-3">
                <span className="text-accent-red mt-0.5">⚠️</span>
                <p className="text-[13px] text-accent-red/90 font-medium leading-tight">
                    {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex min-h-[52px] w-full items-center justify-center rounded-[16px] bg-accent-blue px-4 text-[14px] font-bold font-sans text-dark-bg transition-all hover:bg-accent-blue/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 shadow-[0_0_20px_rgba(74,158,255,0.4)]"
            >
              {pending ? "Authenticating..." : "Initialize Session"}
            </button>
          </form>
        </div>

        <div className="text-center">
          <p className="text-[13px] text-text-platinum/50 font-medium">
            No access clearance?{" "}
            <Link href="/signup" className="font-bold text-accent-blue hover:text-white transition-colors">
              Request credentials
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-bg" />}>
      <LoginForm />
    </Suspense>
  );
}
