"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="space-y-2">
          <Link href="/" className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">
            Goosalytics
          </Link>
          <h1 className="text-3xl font-bold text-white">Sign in</h1>
          <p className="text-sm text-gray-400">
            Use your Supabase account to access picks, settings, and admin tools.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="marco@example.com"
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
          </div>
        </form>

        <p className="text-sm text-gray-400">
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
