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
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">Goosalytics</h1>
          <p className="text-sm text-gray-400">Pickin&apos; Sports Smarter</p>
        </div>

        <div className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.28)] space-y-4">
          {/* Social Login Buttons */}
          <div className="space-y-2.5">
            <SocialButton
              provider="google"
              label="Google"
              icon="🔵"
              onClick={() => handleSocialLogin("google")}
              disabled={pending}
            />
            <SocialButton
              provider="apple"
              label="Apple"
              icon="🍎"
              onClick={() => handleSocialLogin("apple")}
              disabled={pending}
            />
            <SocialButton
              provider="azure"
              label="Microsoft"
              icon="🪟"
              onClick={() => handleSocialLogin("azure")}
              disabled={pending}
            />
          </div>

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
