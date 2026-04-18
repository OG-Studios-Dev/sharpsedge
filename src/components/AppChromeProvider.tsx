"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthUser,
  BrowserSession,
  ProfileRecord,
} from "@/lib/supabase-types";
import type { AppNavItemId } from "@/lib/app-nav";
import type { MyPickDraft, MyPickEntry, MyPickResult } from "@/lib/my-picks";
import { useUserPicks } from "@/hooks/useUserPicks";
import type { UserPickRecord } from "@/lib/supabase-types";
import type { ProfileTier } from "@/lib/tier-access";
import { createBrowserClient } from "@/lib/supabase-client";
import {
  createParlayPick,
  createPickFromDraft,
  readMyPicks,
  syncParlayResults,
  writeMyPicks,
} from "@/lib/my-picks";
import { getEffectiveTier } from "@/lib/tier-access";

const SHORTCUTS_STORAGE_KEY = "goosalytics_menu_shortcuts_v1";

type ViewerState = {
  loading: boolean;
  session: BrowserSession | null;
  user: AuthUser | null;
  profile: ProfileRecord | null;
  tier: ProfileTier;
};

type AppChromeContextValue = {
  viewer: ViewerState;
  isMenuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  shortcuts: AppNavItemId[];
  isShortcutPinned: (id: AppNavItemId) => boolean;
  toggleShortcut: (id: AppNavItemId) => void;
  pickDraft: MyPickDraft | null;
  openAddPickModal: (draft: MyPickDraft) => void;
  closeAddPickModal: () => void;
  myPicks: MyPickEntry[];
  addPickFromDraft: (draft: MyPickDraft, units: number) => Promise<{ ok: boolean; error?: string }>;
  buildParlay: (pickIds: string[], units?: number) => void;
  setMyPickResult: (id: string, result: MyPickResult) => void;
  removeMyPick: (id: string) => void;
};

const AppChromeContext = createContext<AppChromeContextValue | null>(null);

function readShortcuts(): AppNavItemId[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeShortcuts(next: AppNavItemId[]) {
  if (typeof window === "undefined") return;

  const serialized = JSON.stringify(next.slice(0, 5));
  window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, serialized);
  window.dispatchEvent(new StorageEvent("storage", {
    key: SHORTCUTS_STORAGE_KEY,
    newValue: serialized,
  }));
}

function syncMyPicks(next: MyPickEntry[]) {
  const synced = syncParlayResults(next);
  writeMyPicks(synced);
  return synced;
}

function mapUserPickToMyPickEntry(pick: UserPickRecord): MyPickEntry {
  return {
    id: pick.id,
    kind: pick.kind === "parlay" ? "parlay" : "single",
    createdAt: pick.placed_at,
    updatedAt: pick.updated_at,
    settledAt: pick.result_settled_at,
    sourceKind: pick.source_type === "team_trend" ? "team_trend" : pick.source_type === "prop" ? "prop" : "ai_pick",
    league: pick.league,
    team: pick.team || "Pick",
    teamColor: "#4a9eff",
    opponent: pick.opponent || "TBD",
    isAway: false,
    playerName: pick.player_name || undefined,
    summary: pick.pick_label,
    detail: pick.detail || "",
    odds: pick.odds || -110,
    book: pick.book || undefined,
    line: pick.line || undefined,
    gameId: pick.game_id || undefined,
    gameDate: pick.game_date || undefined,
    units: pick.units,
    result: pick.status === "cancelled" || pick.status === "void" ? "push" : pick.status,
    legs: [],
  };
}

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pickDraft, setPickDraft] = useState<MyPickDraft | null>(null);
  const [shortcuts, setShortcuts] = useState<AppNavItemId[]>([]);
  const [myPicks, setMyPicks] = useState<MyPickEntry[]>([]);
  const [viewer, setViewer] = useState<ViewerState>({
    loading: true,
    session: null,
    user: null,
    profile: null,
    tier: "free",
  });

  const userPicksState = useUserPicks(Boolean(viewer.user?.id));

  useEffect(() => {
    setShortcuts(readShortcuts());
    setMyPicks(readMyPicks());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadViewer() {
      const supabase = createBrowserClient();
      const result = await supabase.auth.getSession();
      if (cancelled) return;

      const profile = result.data.profile;
      setViewer({
        loading: false,
        session: result.data.session,
        user: result.data.user,
        profile,
        tier: getEffectiveTier(profile),
      });
    }

    void loadViewer();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === SHORTCUTS_STORAGE_KEY) {
        setShortcuts(readShortcuts());
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === "goosalytics_my_picks_v1") {
        setMyPicks(readMyPicks());
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    if (!viewer.user?.id) return;
    if (userPicksState.loading) return;
    setMyPicks(userPicksState.picks.map(mapUserPickToMyPickEntry));
  }, [userPicksState.loading, userPicksState.picks, viewer.user?.id]);

  const value = useMemo<AppChromeContextValue>(() => ({
    viewer,
    isMenuOpen,
    openMenu: () => setIsMenuOpen(true),
    closeMenu: () => setIsMenuOpen(false),
    shortcuts,
    isShortcutPinned: (id) => shortcuts.includes(id),
    toggleShortcut: (id) => {
      setShortcuts((current) => {
        const next = current.includes(id)
          ? current.filter((item) => item !== id)
          : [id, ...current].slice(0, 5);
        writeShortcuts(next);
        return next;
      });
    },
    pickDraft,
    openAddPickModal: (draft) => setPickDraft(draft),
    closeAddPickModal: () => setPickDraft(null),
    myPicks,
    addPickFromDraft: async (draft, units) => {
      if (viewer.user?.id) {
        try {
          await userPicksState.createPick({
            source_type: draft.sourceKind === "team_trend" ? "team_trend" : draft.sourceKind === "prop" ? "prop" : "ai_pick",
            kind: "single",
            status: "pending",
            source_id: draft.sourceId,
            league: draft.league,
            game_date: draft.gameDate,
            game_id: draft.gameId,
            team: draft.team,
            opponent: draft.opponent,
            player_name: draft.playerName,
            pick_label: draft.summary,
            detail: draft.detail,
            line: draft.line,
            odds: draft.odds,
            book: draft.book,
            units,
            metadata: { is_away: !!draft.isAway, type: draft.type },
            locked_snapshot: draft,
          });
          setPickDraft(null);
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Failed to save pick",
          };
        }
      }

      setMyPicks((current) => {
        const next = syncMyPicks([createPickFromDraft(draft, units), ...current]);
        return next;
      });
      setPickDraft(null);
      return { ok: true };
    },
    buildParlay: (pickIds, units = 1) => {
      setMyPicks((current) => {
        const selected = current.filter((pick) => pickIds.includes(pick.id)).slice(0, 4);
        if (selected.length < 2) return current;
        return syncMyPicks([createParlayPick(selected, units), ...current]);
      });
    },
    setMyPickResult: (id, result) => {
      if (viewer.user?.id) return;

      setMyPicks((current) => {
        const next = current.map((pick) => {
          if (pick.id !== id) return pick;

          return {
            ...pick,
            result,
            updatedAt: new Date().toISOString(),
            settledAt: result === "pending" ? null : new Date().toISOString(),
            legs: pick.kind === "single"
              ? pick.legs.map((leg) => ({ ...leg, result }))
              : pick.legs,
          };
        });

        return syncMyPicks(next);
      });
    },
    removeMyPick: (id) => {
      if (viewer.user?.id) return;
      setMyPicks((current) => syncMyPicks(current.filter((pick) => pick.id !== id)));
    },
  }), [isMenuOpen, myPicks, pickDraft, shortcuts, userPicksState, viewer]);

  return (
    <AppChromeContext.Provider value={value}>
      {children}
    </AppChromeContext.Provider>
  );
}

export function useAppChrome() {
  const context = useContext(AppChromeContext);

  if (!context) {
    throw new Error("useAppChrome must be used inside AppChromeProvider");
  }

  return context;
}
