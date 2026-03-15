"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await supabase.auth.signUp({
      email,
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

    if (result.data.session) {
      router.replace("/");
    } else {
      router.replace("/login");
    }

    router.refresh();
  }

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-12 flex items-center justify-center relative overflow-hidden">
      {/* Background Noise & Glow */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-blue/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="mx-auto max-w-md w-full space-y-8 relative z-10">
        <div className="text-center space-y-3">
          <Link href="/" className="inline-block transition-transform hover:scale-105">
            <img src="/logo.jpg" alt="Goosalytics" className="w-20 h-20 mx-auto border-[3px] border-dark-border/80 shadow-[0_0_20px_rgba(74,158,255,0.2)] rounded-[20px] object-cover" />
          </Link>
          <div>
              <h1 className="text-2xl font-heading font-black text-text-platinum tracking-tight mt-3">Terminal Registration</h1>
              <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 mt-1">Acquire your edge</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[32px] border border-dark-border/80 bg-gradient-to-br from-dark-surface/80 to-dark-bg p-8 shadow-[0_16px_40px_-15px_rgba(0,0,0,0.8)]">
          <div className="space-y-5">
            <label className="block space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 ml-1">Operative Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-14 w-full rounded-[16px] border border-dark-border/60 bg-dark-bg/80 px-4 text-white font-mono text-[13px] outline-none transition-colors placeholder:text-text-platinum/20 focus:border-accent-blue/60 focus:bg-dark-bg focus:ring-1 focus:ring-accent-blue/40 shadow-inner"
                placeholder="Marco Grossi"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 ml-1">Handle / Callsign</span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-14 w-full rounded-[16px] border border-dark-border/60 bg-dark-bg/80 px-4 text-white font-mono text-[13px] outline-none transition-colors placeholder:text-text-platinum/20 focus:border-accent-blue/60 focus:bg-dark-bg focus:ring-1 focus:ring-accent-blue/40 shadow-inner"
                placeholder="marco"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-text-platinum/50 ml-1">Email Coordinates</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-14 w-full rounded-[16px] border border-dark-border/60 bg-dark-bg/80 px-4 text-white font-mono text-[13px] outline-none transition-colors placeholder:text-text-platinum/20 focus:border-accent-blue/60 focus:bg-dark-bg focus:ring-1 focus:ring-accent-blue/40 shadow-inner"
                placeholder="marco@example.com"
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
                placeholder="Minimum 8 characters"
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
              className="flex min-h-[52px] w-full items-center justify-center rounded-[16px] bg-accent-blue mt-2 px-4 text-[14px] font-bold font-sans text-dark-bg transition-all hover:bg-accent-blue/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 shadow-[0_0_20px_rgba(74,158,255,0.4)]"
            >
              {pending ? "Generating clearance..." : "Create Account"}
            </button>
          </div>
        </form>

        <div className="text-center">
          <p className="text-[13px] text-text-platinum/50 font-medium">
            Already cleared for access?{" "}
            <Link href="/login" className="font-bold text-accent-blue hover:text-white transition-colors">
              Initialize session
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
