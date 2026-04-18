"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV_ITEM_IDS, getNavItemById } from "@/lib/app-nav";
import { NavIcon } from "@/components/NavIcon";
import { useAppChrome } from "@/components/AppChromeProvider";

function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const { isAddPickModalOpen } = useAppChrome();
  const isHidden = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");

  useEffect(() => {
    setMounted(true);
  }, []);

  if (isHidden || isAddPickModalOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  const gridColsClass = BOTTOM_NAV_ITEM_IDS.length === 6 ? "grid-cols-6" : "grid-cols-5";

  return createPortal(
    <nav className="fixed inset-x-0 bottom-0 z-[100] h-16 w-full translate-y-0 transform-gpu safe-bottom border-t border-dark-border bg-dark-bg/95 backdrop-blur-sm [will-change:transform] [backface-visibility:hidden] lg:hidden">
      <div className={`mx-auto grid h-16 w-full max-w-lg ${gridColsClass}`}>
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
    </nav>,
    document.body,
  );
}
