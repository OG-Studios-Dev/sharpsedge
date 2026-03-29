"use client";

import { useCallback, useEffect, useState } from "react";
import { AIPick } from "@/lib/types";
import { computePickRecord } from "@/lib/pick-record";
import { APP_TIME_ZONE, MLB_TIME_ZONE, NBA_TIME_ZONE, getDateKey } from "@/lib/date-utils";

const NHL_STORAGE_KEY = "goosalytics_ai_picks_v10";
const NBA_STORAGE_KEY = "goosalytics_nba_picks_v10";
const MLB_STORAGE_KEY = "goosalytics_mlb_picks_v8";
const GOLF_STORAGE_KEY = "goosalytics_golf_picks_v11";

// Nuclear clear: wipe ALL old pick keys from localStorage (preserve active versioned keys)
const ACTIVE_PICK_KEYS = new Set([NHL_STORAGE_KEY, NBA_STORAGE_KEY, MLB_STORAGE_KEY, GOLF_STORAGE_KEY]);
if (typeof window !== "undefined") {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("goosalytics_") && key.includes("picks") && !ACTIVE_PICK_KEYS.has(key)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}
const NHL_RESOLVE_ENDPOINT = "/api/picks/resolve";
const NBA_RESOLVE_ENDPOINT = "/api/picks/resolve";

type PickStore = Record<string, AIPick[]>;

function normalizeGameId(gameId?: string) {
  const normalized = String(gameId ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return undefined;
  return normalized;
}

function isResolvableGameId(gameId: string | undefined, league?: string) {
  if (!gameId) return false;
  if (!/^\d+$/.test(gameId)) return false;
  if (league === "NBA") return gameId.length >= 8;
  if (league === "MLB") return gameId.length >= 5;
  return gameId.length >= 9;
}

function normalizePick(pick: AIPick): AIPick {
  return {
    ...pick,
    gameId: normalizeGameId(pick.gameId),
    book: typeof pick.book === "string" ? pick.book : undefined,
  };
}

function normalizeStore(store: PickStore): { store: PickStore; changed: boolean } {
  let changed = false;
  const normalizedEntries = Object.entries(store).map(([date, picks]) => {
    const normalizedPicks = Array.isArray(picks) ? picks.map(normalizePick) : [];
    if (normalizedPicks.length !== picks.length || normalizedPicks.some((pick, index) => pick.gameId !== picks[index]?.gameId || pick.book !== picks[index]?.book)) {
      changed = true;
    }
    return [date, normalizedPicks] as const;
  });

  return {
    store: Object.fromEntries(normalizedEntries),
    changed,
  };
}

function isStalePendingPick(date: string, pick: AIPick, timeZone: string): boolean {
  return pick.result === "pending"
    && date < todayKey(timeZone)
    && !isResolvableGameId(normalizeGameId(pick.gameId), pick.league);
}

function countStalePendingPicks(store: PickStore, timeZone: string) {
  return Object.entries(store).reduce((count, [date, picks]) => (
    count + picks.filter((pick) => isStalePendingPick(date, pick, timeZone)).length
  ), 0);
}

function clearStalePendingPicks(store: PickStore, timeZone: string): PickStore {
  const nextEntries = Object.entries(store).map(([date, picks]) => {
    const filtered = picks.filter((pick) => !isStalePendingPick(date, pick, timeZone));
    return [date, filtered] as const;
  }).filter(([, picks]) => picks.length > 0);

  return Object.fromEntries(nextEntries);
}

function loadStore(key: string): PickStore {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(key: string, store: PickStore) {
  localStorage.setItem(key, JSON.stringify(store));
}

function todayKey(timeZone = APP_TIME_ZONE) {
  return getDateKey(new Date(), timeZone);
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

function usePicksForLeague(storageKey: string, fetchEndpoint: string, resolveEndpoint: string | null, timeZone = APP_TIME_ZONE) {
  const [allPicks, setAllPicks] = useState<PickStore>({});
  const [loadingPicks, setLoadingPicks] = useState(true);

  const key = todayKey(timeZone);
  const todayPicks = allPicks[key] || [];

  const resolvePending = useCallback(async (store: PickStore) => {
    if (!resolveEndpoint) return;

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

  const clearStalePicks = useCallback(() => {
    setAllPicks((current) => {
      const next = clearStalePendingPicks(current, timeZone);
      saveStore(storageKey, next);
      return next;
    });
  }, [storageKey, timeZone]);

  const fetchAndStore = useCallback(async () => {
    setLoadingPicks(true);
    try {
      const loaded = loadStore(storageKey);
      const normalized = normalizeStore(loaded);
      const store = normalized.store;
      if (normalized.changed) {
        saveStore(storageKey, store);
      }
      // Always fetch fresh picks from API (don't rely on stale localStorage)
      const res = await fetch(`${fetchEndpoint}?date=${key}`);
      const data = await res.json();
      if (data.picks?.length) {
        const date = data.date || key;
        store[date] = data.picks.map(normalizePick);
        saveStore(storageKey, store);
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
    const loaded = loadStore(storageKey);
    const normalized = normalizeStore(loaded);
    const store = normalized.store;
    if (normalized.changed) {
      saveStore(storageKey, store);
    }
    setAllPicks(store);

    if (Object.keys(store).length) {
      setLoadingPicks(false);
      void resolvePending(store);
    }

    void fetchAndStore();
  }, [fetchAndStore, key, resolvePending, storageKey]);

  const record = computePickRecord(Object.values(allPicks).flat());
  const stalePickCount = countStalePendingPicks(allPicks, timeZone);

  return { todayPicks, allPicks, record, loadingPicks, refreshPicks: fetchAndStore, stalePickCount, clearStalePicks };
}

export function usePicks() {
  return usePicksForLeague(NHL_STORAGE_KEY, "/api/picks", NHL_RESOLVE_ENDPOINT, APP_TIME_ZONE);
}

export function useNBAPicks() {
  return usePicksForLeague(NBA_STORAGE_KEY, "/api/nba/picks", NBA_RESOLVE_ENDPOINT, NBA_TIME_ZONE);
}

export function useMLBPicks() {
  return usePicksForLeague(MLB_STORAGE_KEY, "/api/mlb/picks", NBA_RESOLVE_ENDPOINT, MLB_TIME_ZONE);
}

export function useGolfPicks() {
  const result = usePicksForLeague(GOLF_STORAGE_KEY, "/api/golf/picks", null, APP_TIME_ZONE);

  // Golf picks are tournament-scoped: they may be stored under the tournament start date
  // (e.g. Thursday) rather than today's date. If todayPicks is empty, find the most recent
  // pick slate in the store (which is the active tournament's picks).
  const todayPicks = result.todayPicks.length > 0
    ? result.todayPicks
    : (() => {
        const dates = Object.keys(result.allPicks).sort().reverse();
        for (const date of dates) {
          const picks = result.allPicks[date];
          if (picks && picks.length > 0) return picks;
        }
        return [];
      })();

  return { ...result, todayPicks };
}
