"use client";

import { useState, useEffect, useCallback } from "react";
import { League } from "@/lib/types";

const STORAGE_KEY = "goosalytics_active_league";
const DEFAULT_LEAGUE: League = "All";

function readLeague(): League {
  if (typeof window === "undefined") return DEFAULT_LEAGUE;
  return (localStorage.getItem(STORAGE_KEY) as League) || DEFAULT_LEAGUE;
}

export function useLeague(): [League, (l: League) => void] {
  const [league, setLeagueState] = useState<League>(DEFAULT_LEAGUE);

  // Read from localStorage on mount
  useEffect(() => {
    setLeagueState(readLeague());
  }, []);

  // Listen for changes from other pages/tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setLeagueState(e.newValue as League);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setLeague = useCallback((l: League) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLeagueState(l);
    // Dispatch so other tabs pick it up too
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: l }));
  }, []);

  return [league, setLeague];
}
