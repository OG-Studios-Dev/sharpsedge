"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Google OAuth completed — Supabase handles session server-side
    // Just redirect home immediately
    router.replace("/");
  }, [router]);

  return (
    <main className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Welcome! Redirecting...</p>
      </div>
    </main>
  );
}
