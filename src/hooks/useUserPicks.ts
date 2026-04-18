"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserPickRecord, UserPickStatsRecord, UserPickStatus } from "@/lib/supabase-types";

type UserPicksState = {
  loading: boolean;
  picks: UserPickRecord[];
  stats: UserPickStatsRecord | null;
  error: string | null;
};

const EMPTY_STATE: UserPicksState = {
  loading: true,
  picks: [],
  stats: null,
  error: null,
};

export function useUserPicks(enabled: boolean) {
  const [state, setState] = useState<UserPicksState>(EMPTY_STATE);

  const reload = useCallback(async () => {
    if (!enabled) {
      setState({ loading: false, picks: [], stats: null, error: null });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const [picksResponse, statsResponse] = await Promise.all([
        fetch("/api/user-picks", { cache: "no-store" }),
        fetch("/api/user-picks/stats", { cache: "no-store" }),
      ]);
      const picksPayload = await picksResponse.json();
      const statsPayload = await statsResponse.json();

      setState({
        loading: false,
        picks: Array.isArray(picksPayload?.picks) ? picksPayload.picks : [],
        stats: statsPayload?.stats ?? null,
        error: typeof picksPayload?.error === "string" ? picksPayload.error : null,
      });
    } catch {
      setState({ loading: false, picks: [], stats: null, error: "User picks are unavailable" });
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createPick = useCallback(async (input: Record<string, unknown>) => {
    const response = await fetch("/api/user-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to create user pick");
    await reload();
    return payload?.pick as UserPickRecord | null;
  }, [reload]);

  const updateStatus = useCallback(async (id: string, status: UserPickStatus) => {
    const response = await fetch("/api/user-picks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to update user pick");
    await reload();
    return payload?.pick as UserPickRecord | null;
  }, [reload]);

  const deletePick = useCallback(async (id: string) => {
    const response = await fetch(`/api/user-picks?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Failed to delete user pick");
    await reload();
  }, [reload]);

  return {
    ...state,
    reload,
    createPick,
    updateStatus,
    deletePick,
  };
}
