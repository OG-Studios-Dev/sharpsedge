"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-client";
import { useLeague } from "@/hooks/useLeague";
import { APP_NAV_GROUPS, APP_NAV_ITEMS, getNavItemById } from "@/lib/app-nav";
import { TIER_LABELS, canAccessFeature } from "@/lib/tier-access";
import { useAppChrome } from "@/components/AppChromeProvider";

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [league, setLeague] = useLeague();
  const {
    viewer,
    shortcuts,
  } = useAppChrome();

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const pinnedItems = shortcuts
    .map((id) => getNavItemById(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] border-r border-dark-border bg-dark-surface lg:flex">
      <div className="flex h-full w-full flex-col px-5 py-6">
        <Link
          href="/"
          className="tap-button rounded-3xl border border-dark-border/80 bg-dark-bg/60 p-3"
        >
          <img src="/logo.jpg" alt="Goosalytics" className="h-12 w-auto rounded-xl" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Goosalytics</p>
          <p className="mt-1 text-xs text-gray-500">
            {viewer.profile?.name || viewer.user?.email || "Today's edge, locked in."}
          </p>
          <p className="mt-2 text-[11px] text-gray-400">Tier {TIER_LABELS[viewer.tier]}</p>
        </Link>

        {pinnedItems.length > 0 && (
          <div className="mt-6">
            <p className="section-heading">Quick Shortcuts</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {pinnedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.leagueOverride && league !== item.leagueOverride) {
                      setLeague(item.leagueOverride);
                    }
                    router.push(item.href);
                  }}
                  className="tap-button rounded-full border border-dark-border bg-dark-bg/70 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {item.shortLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-6 overflow-y-auto pr-1">
          {APP_NAV_GROUPS.map((group) => {
            const items = APP_NAV_ITEMS.filter((item) => {
              if (item.group !== group.id) return false;
              if (item.adminOnly && viewer.profile?.role !== "admin") return false;
              return true;
            });

            if (items.length === 0) return null;

            return (
              <section key={group.id}>
                <p className="section-heading">{group.label}</p>
                <div className="mt-2 space-y-1.5">
                  {items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const locked = item.tierFeature && !canAccessFeature(item.tierFeature, viewer.profile, viewer.tier);

                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          if (item.leagueOverride && league !== item.leagueOverride) {
                            setLeague(item.leagueOverride);
                          }
                          router.push(item.href);
                        }}
                        className={`tap-button flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium transition-all ${
                          active
                            ? "border-accent-blue/30 bg-accent-blue/10 text-white shadow-[0_0_0_1px_rgba(74,158,255,0.15)]"
                            : "border-transparent text-gray-400 hover:border-dark-border hover:bg-dark-bg/70 hover:text-white"
                        }`}
                      >
                        <span className="text-base">{item.emoji}</span>
                        <span className="flex-1">{item.shortLabel}</span>
                        {item.badge && (
                          <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            {item.badge}
                          </span>
                        )}
                        {locked && <span className="text-[11px] text-amber-300">Locked</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-auto rounded-3xl border border-dark-border/80 bg-dark-bg/60 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-blue/15 text-sm font-bold text-accent-blue">
              {(viewer.profile?.name || viewer.user?.email || "G").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{viewer.profile?.name || "Goosalytics User"}</p>
              <p className="truncate text-xs text-gray-500">{viewer.user?.email || "Signed in"}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              href="/settings"
              className="tap-button inline-flex min-h-[40px] flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface px-3 text-xs font-semibold text-white"
            >
              Settings
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="tap-button inline-flex min-h-[40px] flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface px-3 text-xs font-semibold text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
