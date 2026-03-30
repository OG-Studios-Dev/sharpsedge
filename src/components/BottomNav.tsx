"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV_ITEM_IDS, getNavItemById } from "@/lib/app-nav";
import { NavIcon } from "@/components/NavIcon";

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function BottomNav() {
  const pathname = usePathname();
  const isHidden = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");

  if (isHidden) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom border-t border-dark-border bg-dark-bg/95 backdrop-blur-sm lg:hidden">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {BOTTOM_NAV_ITEM_IDS.map((itemId) => {
          const item = getNavItemById(itemId);
          if (!item) return null;

          const isActive = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="tap-button flex flex-col items-center justify-center gap-0.5"
            >
              <NavIcon id={item.id} size={20} className={isActive ? "text-accent-blue" : "text-gray-500"} />
              <span className={`text-[10px] ${isActive ? "font-medium text-accent-blue" : "text-gray-500"}`}>{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
