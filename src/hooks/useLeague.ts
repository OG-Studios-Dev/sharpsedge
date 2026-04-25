"use client";

import { useState, useEffect, useCallback } from "react";
import { League } from "@/lib/types";
import {
  ACTIVE_LEAGUE_STORAGE_KEY,
  DEFAULT_LEAGUE,
  DEFAULT_LEAGUE_STORAGE_KEY,
  normalizeLeague,
  readActiveLeague,
  writeActiveLeague,
} from "@/lib/league-storage";

export function useLeague(): [League, (l: League) => void] {
  const [league, setLeagueState] = useState<League>(DEFAULT_LEAGUE);

  // Read from localStorage on mount, falling back to the saved default league.
  useEffect(() => {
    setLeagueState(readActiveLeague());
  }, []);

  // Listen for active/default changes from other pages/tabs.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === ACTIVE_LEAGUE_STORAGE_KEY && e.newValue) {
        setLeagueState(normalizeLeague(e.newValue));
      }

      if (e.key === DEFAULT_LEAGUE_STORAGE_KEY && e.newValue && !localStorage.getItem(ACTIVE_LEAGUE_STORAGE_KEY)) {
        setLeagueState(normalizeLeague(e.newValue));
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setLeague = useCallback((l: League) => {
    writeActiveLeague(l);
    setLeagueState(l);
  }, []);

  return [league, setLeague];
}
