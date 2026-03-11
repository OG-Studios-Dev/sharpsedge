"use client";

import { useCallback, useEffect, useState } from "react";
import { AIPick } from "@/lib/types";

const NHL_STORAGE_KEY = "goosalytics_ai_picks_v2";
const NBA_STORAGE_KEY = "goosalytics_nba_picks_v2";

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
  return new Date().toISOString().slice(0, 10);
}

async function resolvePicksFromAPI(picks: AIPick[]): Promise<AIPick[]> {
  const pending = picks.filter((p) => p.result === "pending");
  if (!pending.length) return picks;
  try {
    const res = await fetch("/api/picks/resolve", {
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

function usePicksForLeague(storageKey: string, fetchEndpoint: string) {
  const [allPicks, setAllPicks] = useState<PickStore>({});
  const [loadingPicks, setLoadingPicks] = useState(true);

  const key = todayKey();
  const todayPicks = allPicks[key] || [];

  const fetchAndStore = useCallback(async () => {
    setLoadingPicks(true);
    try {
      const store = loadStore(storageKey);
      if (store[key]?.length) {
        setAllPicks(store);
        setLoadingPicks(false);
        return;
      }
      const res = await fetch(fetchEndpoint);
      const data = await res.json();
      if (data.picks?.length) {
        const date = data.date || key;
        if (!store[date]?.length) {
          store[date] = data.picks;
          saveStore(storageKey, store);
        }
        setAllPicks({ ...store });
      }
    } catch {
      // silently fail
    } finally {
      setLoadingPicks(false);
    }
  }, [key, storageKey, fetchEndpoint]);

  const resolvePending = useCallback(async (store: PickStore) => {
    let changed = false;
    const updated = { ...store };

    for (const [date, picks] of Object.entries(updated)) {
      const hasPending = picks.some((p) => p.result === "pending");
      if (!hasPending) continue;

      const resolved = await resolvePicksFromAPI(picks);
      const anyChange = resolved.some(
        (r, i) => r.result !== picks[i].result
      );
      if (anyChange) {
        updated[date] = resolved;
        changed = true;
      }
    }

    if (changed) {
      saveStore(storageKey, updated);
      setAllPicks({ ...updated });
    }
  }, [storageKey]);

  useEffect(() => {
    const store = loadStore(storageKey);
    setAllPicks(store);

    if (store[key]?.length) {
      setLoadingPicks(false);
      resolvePending(store);
    } else {
      fetchAndStore();
    }
  }, [key, fetchAndStore, resolvePending, storageKey]);

  const record = (() => {
    let wins = 0;
    let losses = 0;
    let pending = 0;
    let profitUnits = 0;
    for (const picks of Object.values(allPicks)) {
      for (const p of picks) {
        if (p.result === "win") {
          wins++;
          profitUnits += p.units;
        } else if (p.result === "loss") {
          losses++;
          profitUnits -= p.units;
        } else {
          pending++;
        }
      }
    }
    return { wins, losses, pending, profitUnits };
  })();

  return { todayPicks, allPicks, record, loadingPicks, refreshPicks: fetchAndStore };
}

export function usePicks() {
  return usePicksForLeague(NHL_STORAGE_KEY, "/api/picks");
}

export function useNBAPicks() {
  return usePicksForLeague(NBA_STORAGE_KEY, "/api/nba/picks");
}
