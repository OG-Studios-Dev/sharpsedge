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
  addPickFromDraft: (draft: MyPickDraft, units: number) => void;
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
    addPickFromDraft: (draft, units) => {
      setMyPicks((current) => {
        const next = syncMyPicks([createPickFromDraft(draft, units), ...current]);
        return next;
      });
      setPickDraft(null);
    },
    buildParlay: (pickIds, units = 1) => {
      setMyPicks((current) => {
        const selected = current.filter((pick) => pickIds.includes(pick.id)).slice(0, 4);
        if (selected.length < 2) return current;
        return syncMyPicks([createParlayPick(selected, units), ...current]);
      });
    },
    setMyPickResult: (id, result) => {
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
      setMyPicks((current) => syncMyPicks(current.filter((pick) => pick.id !== id)));
    },
  }), [isMenuOpen, myPicks, pickDraft, shortcuts, viewer]);

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
