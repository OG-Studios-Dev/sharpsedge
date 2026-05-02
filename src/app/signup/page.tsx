"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-client";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nextParam = searchParams.get("next");
  const next = nextParam || "/picks?welcome=1";
  const loginHref = nextParam ? `/login?next=${encodeURIComponent(nextParam)}` : "/login";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    const result = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          name,
          username,
        },
      },
    });

    if (result.error) {
      setError(result.error.message);
      setPending(false);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center space-y-3">
          <img src="/logo.jpg" alt="Goosalytics" className="w-36 h-auto mx-auto rounded-2xl" />
          <h1 className="text-2xl font-bold text-white">Create account</h1>
          <p className="text-sm text-gray-400">
            Join Goosalytics and land directly on today&apos;s best picks, odds, and reasoning.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["1", "Create account"],
            ["2", "See top picks"],
            ["3", "Track results"],
          ].map(([step, label]) => (
            <div key={step} className="rounded-2xl border border-dark-border bg-dark-surface/70 px-2 py-3">
              <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent-blue/15 text-xs font-bold text-accent-blue">{step}</div>
              <p className="text-[11px] font-semibold text-gray-300">{label}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="Marco Grossi"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="marco"
              />
            </label>

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
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="Minimum 8 characters"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Confirm Password</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="Re-enter your password"
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
              {pending ? "Creating account..." : "Create account"}
            </button>
          </div>
        </form>

        <p className="text-sm text-gray-400">
          Already have an account?{" "}
          <Link href={loginHref} className="font-semibold text-accent-blue">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-dark-bg" />}>
      <SignupForm />
    </Suspense>
  );
}
