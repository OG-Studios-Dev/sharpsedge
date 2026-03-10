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

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function usePicks() {
  const [allPicks, setAllPicks] = useState<PickStore>({});
  const [loadingPicks, setLoadingPicks] = useState(true);

  const todayKey = today();
  const todayPicks = allPicks[todayKey] || [];

  const fetchAndStore = useCallback(async () => {
    setLoadingPicks(true);
    try {
      const res = await fetch("/api/picks");
      const data = await res.json();
      if (data.picks?.length) {
        const store = loadStore();
        store[data.date || todayKey] = data.picks;
        saveStore(store);
        setAllPicks(store);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingPicks(false);
    }
  }, [todayKey]);

  useEffect(() => {
    const store = loadStore();
    if (store[todayKey]?.length) {
      setAllPicks(store);
      setLoadingPicks(false);
    } else {
      setAllPicks(store);
      fetchAndStore();
    }
  }, [todayKey, fetchAndStore]);

  // TODO: add boxscore resolution to update pick results from final scores

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
