"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-client";
import { createClient } from "@supabase/supabase-js";

function SocialButton({ provider, label, icon, onClick, disabled }: {
  provider: string;
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl border border-dark-border bg-dark-surface px-4 text-sm font-medium text-white transition-colors hover:bg-dark-border/30 disabled:opacity-50"
    >
      <span className="text-lg">{icon}</span>
      <span>Continue with {label}</span>
    </button>
  );
}

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

    const next = searchParams.get("next") || "/";
    router.replace(next);
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
    <main className="min-h-screen bg-dark-bg px-4 py-12 flex items-start justify-center">
      <div className="mx-auto max-w-md w-full space-y-6">
        <div className="text-center space-y-3">
          <img src="/logo.jpg" alt="Goosalytics" className="w-48 h-auto mx-auto rounded-2xl" />
          <p className="text-sm text-gray-400">Pick Smarter</p>
        </div>

        <div className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.28)] space-y-4">
          {/* Google Login */}
          <button
            type="button"
            onClick={() => handleSocialLogin("google")}
            disabled={pending}
            className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl border border-dark-border bg-dark-surface px-4 text-sm font-medium text-white transition-colors hover:bg-dark-border/30 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-dark-border" />
            <span className="text-[11px] text-gray-500 uppercase tracking-wide">or sign in with email</span>
            <div className="flex-1 h-px bg-dark-border" />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="you@email.com"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="Enter your password"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-accent-blue px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            >
              {pending ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-sm text-gray-400 text-center">
          Need an account?{" "}
          <Link href="/signup" className="font-semibold text-accent-blue">
            Create one
          </Link>
        </p>
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
