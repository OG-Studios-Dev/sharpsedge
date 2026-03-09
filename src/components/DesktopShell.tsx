"use client";
import { usePathname } from "next/navigation";

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-6 lg:pt-6">
      <aside className="hidden lg:block">
        <nav className="sticky top-6 rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-1">
          {[
            { href: "/", label: "Home" },
            { href: "/schedule", label: "Schedule" },
            { href: "/props", label: "Live Props" },
            { href: "/trends", label: "Trends" },
            { href: "/leagues", label: "Leagues" },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-gray-400 hover:text-white hover:bg-dark-bg"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
