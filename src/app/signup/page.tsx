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
    <main className="min-h-screen bg-dark-bg px-4 py-8">
      <div className="mx-auto max-w-md space-y-6">
        <div className="space-y-2">
          <Link href="/" className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">
            Goosalytics
          </Link>
          <h1 className="text-3xl font-bold text-white">Create account</h1>
          <p className="text-sm text-gray-400">
            New accounts are created in Supabase Auth and synced into the `profiles` table.
          </p>
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
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-xl border border-dark-border bg-dark-bg px-4 text-white outline-none transition-colors placeholder:text-gray-600 focus:border-accent-blue"
                placeholder="Choose a password"
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
          <Link href="/login" className="font-semibold text-accent-blue">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
