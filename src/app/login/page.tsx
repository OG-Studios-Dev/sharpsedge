"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-client";
import { createClient } from "@supabase/supabase-js";

const features = [
  {
    icon: "🤖",
    title: "AI Picks Daily",
    description: "3 AI-generated picks per sport, every day. Track our 60%+ hit rate goal.",
  },
  {
    icon: "📊",
    title: "Deep Trend Analysis",
    description: "Player props with L10, H2H, Home/Away splits. 4-signal breakdown on every prop.",
  },
  {
    icon: "💰",
    title: "Line Shopping",
    description: "Best odds from DraftKings, FanDuel, BetMGM and more. Never miss value.",
  },
];

const sports = ["🏒 NHL", "🏀 NBA", "⚾ MLB (coming soon)"];

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg">
          <span aria-hidden="true">{icon}</span>
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs leading-5 text-gray-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();
  const emailSectionRef = useRef<HTMLElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"email" | "google" | null>(null);

  const nextParam = searchParams.get("next");
  const next = nextParam || "/";
  const signupHref = nextParam ? `/signup?next=${encodeURIComponent(nextParam)}` : "/signup";
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`
      : "https://goosalytics.vercel.app/auth/callback";

  function scrollToEmailSection() {
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    emailSectionRef.current?.scrollIntoView({ behavior, block: "start" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("email");
    setError(null);

    const result = await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setError(result.error.message);
      setPendingAction(null);
      return;
    }

    router.replace(next);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setPendingAction("google");
    setError(null);

    try {
      const realSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: authError } = await realSupabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (authError) {
        setError(authError.message);
        setPendingAction(null);
      }
    } catch {
      setError("Google sign-in is unavailable right now.");
      setPendingAction(null);
    }
  }

  const isPending = pendingAction !== null;

  return (
    <main className="relative left-1/2 min-h-[100svh] w-[100dvw] -translate-x-1/2 overflow-x-hidden bg-[#0d1118] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0d1118_0%,#0a0d14_40%,#090c12_100%)]" />
      <div className="absolute left-1/2 top-10 h-52 w-52 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(74,158,255,0.24)_0%,rgba(118,92,255,0.14)_35%,rgba(13,17,24,0)_72%)] blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_60%)]" />

      <div className="relative mx-auto flex w-full max-w-[29rem] flex-col px-5 pb-[max(env(safe-area-inset-bottom),4rem)] pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-6">
        <section className="flex min-h-[100svh] flex-col justify-center py-16">
          <div className="space-y-8">
            <div className="space-y-5 text-center">
              <div className="relative mx-auto flex w-full justify-center">
                <div className="absolute top-1/2 h-28 w-40 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(74,158,255,0.22)_0%,rgba(118,92,255,0.12)_42%,transparent_75%)] blur-2xl" />
                <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.4)] backdrop-blur-sm">
                  <Image
                    src="/logo.jpg"
                    alt="Goosalytics"
                    width={144}
                    height={80}
                    priority
                    className="h-auto w-36 rounded-2xl"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white">Pick Smarter</h1>
                <p className="text-sm leading-6 text-gray-400">AI-powered sports picks, trends &amp; analytics</p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isPending}
                  className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#ffffff_0%,#eef3ff_100%)] px-4 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:scale-[1.01] disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GoogleIcon />
                  <span>{pendingAction === "google" ? "Connecting..." : "Continue with Google"}</span>
                </button>

                <button
                  type="button"
                  onClick={scrollToEmailSection}
                  disabled={isPending}
                  aria-controls="email-sign-in"
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-white/10 bg-transparent px-4 text-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Sign in with Email
                </button>
              </div>

              <p className="mt-4 text-center text-sm text-gray-400">
                <Link href={signupHref} className="font-medium text-white underline decoration-white/25 underline-offset-4 transition-colors hover:text-accent-blue">
                  Create Account
                </Link>
              </p>
            </div>

            {error && (
              <p className="rounded-2xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
                {error}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4 py-8">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </section>

        <section className="space-y-4 py-8 text-center">
          <div className="flex items-center justify-center gap-2">
            {sports.map((sport) => (
              <span
                key={sport}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium tracking-[0.14em] text-gray-200"
              >
                {sport}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500">More sports coming soon</p>
        </section>

        <section className="py-8">
          <button
            type="button"
            onClick={scrollToEmailSection}
            disabled={isPending}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-accent-blue/30 bg-[linear-gradient(135deg,rgba(74,158,255,0.22)_0%,rgba(74,158,255,0.12)_100%)] px-4 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(32,75,138,0.22)] transition-colors hover:border-accent-blue/50 hover:bg-[linear-gradient(135deg,rgba(74,158,255,0.28)_0%,rgba(74,158,255,0.16)_100%)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Join the beta — it&apos;s free
          </button>
        </section>

        <section ref={emailSectionRef} id="email-sign-in" className="py-4">
          <div className="rounded-[2rem] border border-dark-border bg-dark-surface/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">Sign in with Email</h2>
              <p className="text-sm leading-6 text-gray-400">
                Unlock daily picks, trend breakdowns, and the best lines in one place.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0f141c] px-4 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
                  placeholder="you@email.com"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#0f141c] px-4 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20"
                  placeholder="Enter your password"
                />
              </label>

              <button
                type="submit"
                disabled={isPending}
                className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-accent-blue px-4 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(74,158,255,0.3)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "email" ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="mt-4 text-sm text-gray-400">
              Need an account?{" "}
              <Link href={signupHref} className="font-semibold text-white transition-colors hover:text-accent-blue">
                Create one
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0d1118]" />}>
      <LoginForm />
    </Suspense>
  );
}
