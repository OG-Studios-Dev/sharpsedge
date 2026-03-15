"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Home, Calendar, Activity, CheckSquare, TrendingUp, Layers, Users, Settings, LogOut } from "lucide-react";
import TopBar from "./TopBar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/props", label: "Props", icon: Activity },
  { href: "/picks", label: "Picks", icon: CheckSquare },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/parlays", label: "Parlays", icon: Layers },
  { href: "/teams", label: "Teams", icon: Users },
];

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);

  const hideShell = pathname === "/" || pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");

  if (hideShell) {
    return <div className="min-w-0">{children}</div>;
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile Top Bar */}
      <TopBar />

      {/* Desktop Sidebar (The Command Bar) */}
      <aside 
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-dark-card border-r border-dark-border z-40 transition-all duration-300 ${isExpanded ? "w-[240px]" : "w-[72px]"}`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className="h-20 flex items-center px-5 border-b border-dark-border/50 overflow-hidden">
          <div className="flex items-center w-full min-w-[200px]">
            {isExpanded ? (
              <span className="font-drama text-2xl tracking-tight text-text-platinum font-bold italic block">
                Goosa<span className="font-heading not-italic font-black text-accent-blue">lytics</span>
              </span>
            ) : (
              <span className="font-drama text-3xl text-text-platinum font-bold italic w-8 text-center ml-[-2px]">G</span>
            )}
          </div>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-2 px-3 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center h-12 rounded-xl transition-all duration-300 relative group truncate ${
                  isActive ? "text-accent-blue bg-accent-blue/5" : "text-text-platinum/60 hover:text-text-platinum hover:bg-dark-surface"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-accent-blue rounded-r-md"></div>
                )}
                <div className="w-[48px] h-full flex items-center justify-center shrink-0">
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`font-sans font-medium text-[15px] whitespace-nowrap transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-dark-border/50 flex flex-col gap-2">
          <Link
            href="/settings"
            className={`flex items-center h-12 rounded-xl transition-all relative truncate text-text-platinum/60 hover:text-text-platinum hover:bg-dark-surface ${pathname.startsWith("/settings") ? "text-accent-blue bg-accent-blue/5" : ""}`}
          >
            {pathname.startsWith("/settings") && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-accent-blue rounded-r-md"></div>
            )}
            <div className="w-[48px] h-full flex items-center justify-center shrink-0">
              <Settings size={22} />
            </div>
            <span className={`font-sans font-medium text-[15px] whitespace-nowrap transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0"}`}>
              Settings
            </span>
          </Link>
          
          <button className="flex items-center h-12 rounded-xl transition-all truncate text-text-platinum/60 hover:text-accent-red hover:bg-accent-red/5">
            <div className="w-[48px] h-full flex items-center justify-center shrink-0 relative">
              <div className="w-8 h-8 rounded-full bg-dark-bg border border-dark-border flex items-center justify-center text-xs font-bold font-mono text-text-platinum group-hover:hidden">U</div>
              <LogOut size={22} className="hidden group-hover:block" />
            </div>
            <span className={`font-sans font-medium text-[15px] whitespace-nowrap transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0"}`}>
              Logout
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 transition-all duration-300 min-w-0 lg:pl-[72px] pt-[72px] lg:pt-0`}>
        <div className="max-w-6xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
