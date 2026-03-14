"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { validateSignupInput } from "@/lib/auth-validation";

type SignupFormProps = {
  callbackUrl: string;
};

export default function SignupForm({ callbackUrl }: SignupFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loginHref = callbackUrl === "/" ? "/login" : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateSignupInput({
      name,
      email,
      username,
      password,
      confirmPassword,
    });

    if (!validation.success) {
      setError(validation.error);
      return;
    }

    setError(null);

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        username,
        password,
        confirmPassword,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.error ?? "Unable to create your account right now.");
      return;
    }

    const signInResult = await signIn("credentials", {
      email: validation.data.email,
      password: validation.data.password,
      redirect: false,
      callbackUrl,
    });

    if (signInResult?.error) {
      setError("Your account was created, but automatic login failed. Use the login page to continue.");
      router.replace(loginHref);
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
        <label htmlFor="name" className="text-sm font-medium text-gray-200">
          Full name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          className="w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-accent-blue/60 focus:outline-none"
          placeholder="Marco Grossi"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="signup-email" className="text-sm font-medium text-gray-200">
          Email address
        </label>
        <input
          id="signup-email"
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
        <label htmlFor="username" className="text-sm font-medium text-gray-200">
          Username <span className="text-gray-500">(optional)</span>
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            if (error) setError(null);
          }}
          className="w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-accent-blue/60 focus:outline-none"
          placeholder="marco"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="signup-password" className="text-sm font-medium text-gray-200">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-accent-blue/60 focus:outline-none"
            placeholder="At least 8 characters"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-medium text-gray-200">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-2xl border border-dark-border bg-dark-bg/80 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-accent-blue/60 focus:outline-none"
            placeholder="Repeat your password"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-2xl bg-accent-green px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Creating account..." : "Create Account"}
      </button>

      <div className="pt-2 text-center text-sm text-gray-400">
        Already have an account?{" "}
        <Link href={loginHref} className="font-semibold text-accent-blue transition hover:text-[#74b6ff]">
          Log In
        </Link>
      </div>
    </form>
  );
}
