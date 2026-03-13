"use client";

import { useCallback, useEffect, useState } from "react";
import { AIPick } from "@/lib/types";
import { computePickRecord } from "@/lib/pick-record";

const NHL_STORAGE_KEY = "goosalytics_ai_picks_v2";
const NBA_STORAGE_KEY = "goosalytics_nba_picks_v2";
const NHL_RESOLVE_ENDPOINT = "/api/picks/resolve";
const NBA_RESOLVE_ENDPOINT = "/api/picks/resolve";

type PickStore = Record<string, AIPick[]>;

function loadStore(key: string): PickStore {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(key: string, store: PickStore) {
  localStorage.setItem(key, JSON.stringify(store));
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function resolvePicksFromAPI(picks: AIPick[], endpoint: string): Promise<AIPick[]> {
  const pending = picks.filter((p) => p.result === "pending");
  if (!pending.length) return picks;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks }),
    });
    if (!res.ok) return picks;
    const data = await res.json();
    return Array.isArray(data.picks) ? data.picks : picks;
  } catch {
    return picks;
  }
}

function usePicksForLeague(storageKey: string, fetchEndpoint: string, resolveEndpoint: string) {
  const [allPicks, setAllPicks] = useState<PickStore>({});
  const [loadingPicks, setLoadingPicks] = useState(true);

  const key = todayKey();
  const todayPicks = allPicks[key] || [];

  const resolvePending = useCallback(async (store: PickStore) => {
    let changed = false;
    const updated = { ...store };

    for (const [date, picks] of Object.entries(updated)) {
      if (!picks.some((p) => p.result === "pending")) continue;

      const resolved = await resolvePicksFromAPI(picks, resolveEndpoint);
      const anyChange = resolved.some((pick, index) => pick.result !== picks[index]?.result);
      if (anyChange) {
        updated[date] = resolved;
        changed = true;
      }
    }

    if (changed) {
      saveStore(storageKey, updated);
      setAllPicks({ ...updated });
    }
  }, [resolveEndpoint, storageKey]);

  const fetchAndStore = useCallback(async () => {
    setLoadingPicks(true);
    try {
      const store = loadStore(storageKey);
      if (!store[key]?.length) {
        const res = await fetch(`${fetchEndpoint}?date=${key}`);
        const data = await res.json();
        if (data.picks?.length) {
          const date = data.date || key;
          if (!store[date]?.length) {
            store[date] = data.picks;
            saveStore(storageKey, store);
          }
        }
      }

      setAllPicks({ ...store });
      await resolvePending(store);
    } catch {
      // silently fail
    } finally {
      setLoadingPicks(false);
    }
  }, [fetchEndpoint, key, resolvePending, storageKey]);

  useEffect(() => {
    const store = loadStore(storageKey);
    setAllPicks(store);

    if (Object.keys(store).length) {
      setLoadingPicks(false);
      void resolvePending(store);
    }

    void fetchAndStore();
  }, [fetchAndStore, key, resolvePending, storageKey]);

  const record = computePickRecord(Object.values(allPicks).flat());

  return { todayPicks, allPicks, record, loadingPicks, refreshPicks: fetchAndStore };
}

export function usePicks() {
  return usePicksForLeague(NHL_STORAGE_KEY, "/api/picks", NHL_RESOLVE_ENDPOINT);
}

export function useNBAPicks() {
  return usePicksForLeague(NBA_STORAGE_KEY, "/api/nba/picks", NBA_RESOLVE_ENDPOINT);
}
