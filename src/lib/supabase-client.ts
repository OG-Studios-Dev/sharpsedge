"use client";

import type { AuthResponse } from "@/lib/supabase-types";

type SignInArgs = {
  email: string;
  password: string;
};

type SignUpArgs = {
  email: string;
  password: string;
  options?: {
    data?: {
      name?: string;
      username?: string;
    };
  };
};

async function request<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "include",
  });

  const payload = await response.json().catch(() => ({
    data: { session: null, user: null, profile: null },
    error: { message: "Unexpected response" },
  }));

  return payload as T;
}

export function createBrowserClient() {
  return {
    auth: {
      signInWithPassword: (credentials: SignInArgs) => request<AuthResponse>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(credentials),
        },
      ),
      signUp: (credentials: SignUpArgs) => request<AuthResponse>(
        "/api/auth/signup",
        {
          method: "POST",
          body: JSON.stringify(credentials),
        },
      ),
      signOut: () => request<AuthResponse>(
        "/api/auth/logout",
        { method: "POST" },
      ),
      getSession: () => request<AuthResponse>("/api/auth/session"),
    },
  };
}
