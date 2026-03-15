"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-client";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const supabase = createBrowserClient();

  async function handleLogout() {
    setPending(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-dark-border bg-dark-bg px-4 text-sm font-semibold text-white transition-colors hover:border-gray-500 disabled:opacity-60"
    >
      {pending ? "Signing out..." : "Log out"}
    </button>
  );
}
