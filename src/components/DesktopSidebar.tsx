"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createBrowserClient } from "@/lib/supabase-client";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/props",
    label: "Props",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M5 19V9M12 19V5M19 19v-8" />
      </svg>
    ),
  },
  {
    href: "/picks",
    label: "Picks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    href: "/trends",
    label: "Trends",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M4 16l5-5 4 4 7-8" />
        <path d="M16 7h4v4" />
      </svg>
    ),
  },
  {
    href: "/odds",
    label: "Lines",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
        <path d="M12 3v18M17 6H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 1 1 0 7H7" />
      </svg>
    ),
  },
];

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  const [viewerName, setViewerName] = useState("Goosalytics User");

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const supabase = createBrowserClient();
      const result = await supabase.auth.getSession();
      if (cancelled) return;

      const name = result.data.profile?.name || result.data.user?.name || result.data.user?.email || "Goosalytics User";
      setViewerName(name);
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const viewerInitial = viewerName.charAt(0).toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] border-r border-dark-border bg-dark-surface lg:flex">
      <div className="flex h-full w-full flex-col px-5 py-6">
        <Link href="/" className="rounded-2xl border border-dark-border/80 bg-dark-bg/60 p-3 transition-colors hover:border-accent-blue/30">
          <img src="/logo.jpg" alt="Goosalytics" className="h-12 w-auto rounded-xl" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Goosalytics</p>
          <p className="mt-1 text-xs text-gray-500">Today&apos;s edge, built for desktop.</p>
        </Link>

        <nav className="mt-8 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium transition-all ${
                  active
                    ? "border-accent-blue/30 bg-accent-blue/10 text-white shadow-[0_0_0_1px_rgba(74,158,255,0.15)]"
                    : "border-transparent text-gray-400 hover:border-dark-border hover:bg-dark-bg/70 hover:text-white"
                }`}
              >
                <span className={active ? "text-accent-blue" : "text-gray-500"}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-dark-border/80 bg-dark-bg/60 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-blue/15 text-sm font-bold text-accent-blue">
              {viewerInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{viewerName}</p>
              <Link href="/settings" className="text-xs text-gray-500 transition-colors hover:text-accent-blue">
                Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
