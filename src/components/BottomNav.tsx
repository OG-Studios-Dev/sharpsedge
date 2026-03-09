"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Search", href: "/search", icon: "⌕" },
  { label: "Trends", href: "/trends", icon: "↗" },
  { label: "Props", href: "/props", icon: "▥" },
  { label: "Leagues", href: "/leagues", icon: "◔" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-dark-bg border-t border-dark-border lg:hidden">
      <div className="max-w-lg mx-auto grid grid-cols-5 h-16">
        {tabs.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} className="flex flex-col items-center justify-center gap-0.5">
              <span className={`text-lg ${isActive ? "text-white" : "text-gray-500"}`}>{tab.icon}</span>
              <span className={`text-[10px] ${isActive ? "text-white" : "text-gray-500"}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
