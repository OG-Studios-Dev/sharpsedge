"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { validateLoginInput } from "@/lib/auth-validation";

type LoginFormProps = {
  callbackUrl: string;
  initialError?: string;
};

function getErrorMessage(error?: string | null) {
  if (error === "CredentialsSignin") {
    return "The email or password is incorrect.";
  }

  return error || "Unable to log in right now. Try again.";
}

export default function LoginForm({ callbackUrl, initialError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isPending, startTransition] = useTransition();

  const signupHref = callbackUrl === "/" ? "/signup" : `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateLoginInput({ email, password });

    if (!validation.success) {
      setError(validation.error);
      return;
    }

    setError(null);

    const result = await signIn("credentials", {
      email: validation.data.email,
      password: validation.data.password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError(getErrorMessage(result.error));
      return;
    }

    startTransition(() => {
      router.replace(callbackUrl);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-gray-200">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          className="w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-accent-blue/60 focus:outline-none"
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-gray-200">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (error) setError(null);
          }}
          className="w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-accent-blue/60 focus:outline-none"
          placeholder="Enter your password"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-accent-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5aa9ff] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Logging in..." : "Log In"}
      </button>

      <div className="pt-2 text-center text-sm text-gray-400">
        Need an account?{" "}
        <Link href={signupHref} className="font-semibold text-accent-green transition hover:text-emerald-300">
          Create Account
        </Link>
      </div>
    </form>
  );
}
