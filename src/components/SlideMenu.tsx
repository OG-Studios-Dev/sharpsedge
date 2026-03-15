"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-client";
import { useLeague } from "@/hooks/useLeague";
import { APP_NAV_GROUPS, APP_NAV_ITEMS, getNavItemById, type AppNavItem } from "@/lib/app-nav";
import { TIER_LABELS, canAccessFeature } from "@/lib/tier-access";
import { useAppChrome } from "@/components/AppChromeProvider";

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavRow({
  item,
  active,
  pinned,
  onNavigate,
  onToggleShortcut,
}: {
  item: AppNavItem;
  active: boolean;
  pinned: boolean;
  onNavigate: (item: AppNavItem) => void;
  onToggleShortcut: (id: AppNavItem["id"]) => void;
}) {
  const timerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function startLongPress() {
    clearTimer();
    longPressTriggeredRef.current = false;
    timerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onToggleShortcut(item.id);
    }, 450);
  }

  function endLongPress() {
    clearTimer();
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-3 ${
        active
          ? "border-accent-blue/30 bg-accent-blue/10 text-white"
          : "border-dark-border bg-dark-surface/70 text-gray-300"
      }`}
      onMouseDown={startLongPress}
      onMouseUp={endLongPress}
      onMouseLeave={endLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={endLongPress}
    >
      <button
        type="button"
        onClick={() => {
          if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
          }
          onNavigate(item);
        }}
        className="tap-button flex min-h-[44px] flex-1 items-center gap-3 text-left"
      >
        <span className="text-lg">{item.emoji}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="card-title truncate">{item.label}</span>
            {item.badge && (
              <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {item.badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Hold to {pinned ? "unpin" : "pin"} shortcut
          </p>
        </div>
      </button>

      {item.shortcutEligible && (
        <button
          type="button"
          aria-label={pinned ? `Remove ${item.label} shortcut` : `Pin ${item.label} shortcut`}
          onClick={() => onToggleShortcut(item.id)}
          className={`tap-button inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
            pinned
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-dark-border bg-dark-bg/60 text-gray-500"
          }`}
        >
          {pinned ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}

export default function SlideMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [league, setLeague] = useLeague();
  const {
    viewer,
    isMenuOpen,
    closeMenu,
    shortcuts,
    isShortcutPinned,
    toggleShortcut,
  } = useAppChrome();

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    closeMenu();
    router.replace("/login");
    router.refresh();
  }

  function handleNavigate(item: AppNavItem) {
    if (item.leagueOverride && league !== item.leagueOverride) {
      setLeague(item.leagueOverride);
    }

    closeMenu();
    router.push(item.href);
  }

  const pinnedItems = shortcuts
    .map((id) => getNavItemById(id))
    .filter((item): item is AppNavItem => Boolean(item));

  return (
    <>
      <div
        className={`fixed inset-0 z-[70] bg-black/60 transition-opacity duration-200 lg:hidden ${
          isMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMenu}
        aria-hidden={!isMenuOpen}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-[80] w-[88vw] max-w-sm overflow-y-auto border-r border-dark-border bg-[linear-gradient(180deg,#121924_0%,#0d1118_100%)] px-4 pb-6 pt-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] transition-transform duration-200 lg:hidden ${
          isMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!isMenuOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <img src="/logo.jpg" alt="Goosalytics" className="h-12 w-auto rounded-2xl" />
            <p className="mt-3 text-sm font-semibold text-white">
              {viewer.profile?.name || viewer.user?.email || "Goosalytics"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Tier: {TIER_LABELS[viewer.tier]}
            </p>
          </div>
          <button
            type="button"
            onClick={closeMenu}
            className="tap-button inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface text-white"
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        <div className="mt-6">
          <p className="section-heading">⭐ Quick Shortcuts</p>
          {pinnedItems.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-dark-border bg-dark-surface/50 p-3 text-sm text-gray-500">
              Star or long-press a menu item to pin up to five shortcuts.
            </p>
          ) : (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {pinnedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item)}
                  className="tap-button inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border border-dark-border bg-dark-surface px-3 text-sm font-semibold text-white"
                >
                  <span>{item.emoji}</span>
                  <span>{item.shortLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-6">
          {APP_NAV_GROUPS.map((group) => {
            const items = APP_NAV_ITEMS.filter((item) => {
              if (item.group !== group.id) return false;
              if (item.adminOnly && viewer.profile?.role !== "admin") return false;
              return true;
            });

            if (items.length === 0) return null;

            return (
              <section key={group.id} className="space-y-2.5">
                <p className="section-heading">{group.label}</p>
                {items.map((item) => {
                  const locked = item.tierFeature && !canAccessFeature(item.tierFeature, viewer.profile, viewer.tier);
                  return (
                    <div key={item.id} className="space-y-1">
                      <NavRow
                        item={item}
                        active={isActivePath(pathname, item.href)}
                        pinned={isShortcutPinned(item.id)}
                        onNavigate={handleNavigate}
                        onToggleShortcut={toggleShortcut}
                      />
                      {locked && (
                        <p className="px-1 text-[11px] text-amber-300">
                          {item.badge === "pro" ? "Upgrade to Pro" : "Upgrade to Sharp"} to open this page.
                        </p>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        <div className="mt-8 rounded-3xl border border-dark-border bg-dark-surface/60 p-4">
          <p className="section-heading">🚪 Logout</p>
          <button
            type="button"
            onClick={handleLogout}
            className="tap-button mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-dark-border bg-dark-bg px-4 text-sm font-semibold text-white"
          >
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
