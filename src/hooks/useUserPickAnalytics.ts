"use client";

import { useEffect, useState } from "react";
import type { UserPickRecord } from "@/lib/supabase-types";
import type { UserPickAnalytics } from "@/lib/user-picks-analytics";

type UserPickAnalyticsState = {
  loading: boolean;
  analytics: UserPickAnalytics | null;
  picks: UserPickRecord[];
  error: string | null;
};

const EMPTY_STATE: UserPickAnalyticsState = {
  loading: true,
  analytics: null,
  picks: [],
  error: null,
};

export function useUserPickAnalytics(enabled: boolean) {
  const [state, setState] = useState<UserPickAnalyticsState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!enabled) {
        setState({ loading: false, analytics: null, picks: [], error: null });
        return;
      }

      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        const response = await fetch("/api/user-picks/analytics", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled) return;

        setState({
          loading: false,
          analytics: payload?.analytics ?? null,
          picks: Array.isArray(payload?.picks) ? payload.picks : [],
          error: typeof payload?.error === "string" ? payload.error : null,
        });
      } catch {
        if (cancelled) return;
        setState({ loading: false, analytics: null, picks: [], error: "User pick analytics are unavailable" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
