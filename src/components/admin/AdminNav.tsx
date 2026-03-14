"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/picks", label: "Picks" },
  { href: "/admin/system", label: "System" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto scrollbar-hide">
      <div className="flex min-w-max gap-2 rounded-2xl border border-dark-border bg-dark-surface/80 p-2">
        {tabs.map((tab) => {
          const isActive = tab.href === "/admin" ? pathname === tab.href : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-accent-blue/15 text-accent-blue"
                  : "text-gray-400 hover:bg-dark-bg hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
