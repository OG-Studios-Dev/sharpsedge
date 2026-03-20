"use client";

import { useEffect, useState } from "react";
import type { PickHistoryRecord, PickSlateRecord } from "@/lib/supabase-types";

type PickHistoryState = {
  loading: boolean;
  picks: PickHistoryRecord[];
  slates: PickSlateRecord[];
  error: string | null;
};

const EMPTY_STATE: PickHistoryState = {
  loading: true,
  picks: [],
  slates: [],
  error: null,
};

export function usePickHistory() {
  const [state, setState] = useState<PickHistoryState>(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/picks/history");
        const payload = await response.json();
        if (cancelled) return;

        setState({
          loading: false,
          picks: Array.isArray(payload?.picks) ? payload.picks : [],
          slates: Array.isArray(payload?.slates) ? payload.slates : [],
          error: typeof payload?.error === "string" ? payload.error : response.ok ? null : "Pick history is unavailable",
        });
      } catch {
        if (cancelled) return;
        setState({
          loading: false,
          picks: [],
          slates: [],
          error: "Pick history is unavailable",
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
