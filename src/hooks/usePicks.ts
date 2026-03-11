"use client";

import { useCallback, useEffect, useState } from "react";
import { AIPick } from "@/lib/types";

const STORAGE_KEY = "goosalytics_ai_picks_v2";

type PickStore = Record<string, AIPick[]>;

function loadStore(): PickStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: PickStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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

export function usePicks() {
  const [allPicks, setAllPicks] = useState<PickStore>({});
  const [loadingPicks, setLoadingPicks] = useState(true);

  const key = todayKey();
  const todayPicks = allPicks[key] || [];

  // Fetch fresh picks for today — ONLY if today has no picks yet (LOCK)
  const fetchAndStore = useCallback(async () => {
    setLoadingPicks(true);
    try {
      const store = loadStore();
      // HARD LOCK: if today already has picks, never overwrite them
      if (store[key]?.length) {
        setAllPicks(store);
        setLoadingPicks(false);
        return;
      }
      const res = await fetch("/api/picks");
      const data = await res.json();
      if (data.picks?.length) {
        const date = data.date || key;
        // Only store if this date has no picks yet
        if (!store[date]?.length) {
          store[date] = data.picks;
          saveStore(store);
        }
        setAllPicks({ ...store });
      }
    } catch {
      // silently fail
    } finally {
      setLoadingPicks(false);
    }
  }, [key]);

  // Attempt to auto-resolve pending picks from completed game stats
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
      saveStore(updated);
      setAllPicks({ ...updated });
    }
  }, []);

  useEffect(() => {
    const store = loadStore();
    setAllPicks(store);

    if (store[key]?.length) {
      setLoadingPicks(false);
      // Picks already exist for today — just try to resolve any pending ones
      resolvePending(store);
    } else {
      // No picks for today yet — fetch and lock them in
      fetchAndStore();
    }
  }, [key, fetchAndStore, resolvePending]);

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
