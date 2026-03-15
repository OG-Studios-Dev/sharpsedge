"use client";

import { useEffect, useState } from "react";
import type { PickHistoryRecord } from "@/lib/supabase-types";

type PickHistoryState = {
  loading: boolean;
  picks: PickHistoryRecord[];
};

const EMPTY_STATE: PickHistoryState = {
  loading: true,
  picks: [],
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
        });
      } catch {
        if (cancelled) return;
        setState({
          loading: false,
          picks: [],
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
