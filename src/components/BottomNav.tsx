"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Activity, CheckSquare, TrendingUp, Menu } from "lucide-react";
import { useState } from "react";
import MobileMoreSheet from "./MobileMoreSheet";

const tabs = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Props", href: "/props", icon: Activity },
  { label: "Picks", href: "/picks", icon: CheckSquare },
  { label: "Trends", href: "/trends", icon: TrendingUp },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const isHidden = pathname === "/" || pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");

  if (isHidden) {
    return null;
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-dark-card/70 backdrop-blur-xl border-t border-dark-border lg:hidden pb-safe">
        <div className="flex items-center justify-around h-20 px-2 pb-2">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link key={tab.href} href={tab.href} className="group relative flex flex-col items-center justify-center w-full h-full">
                <div className="relative flex items-center justify-center w-12 h-10 transition-transform duration-[400ms] group-active:scale-[1.15] cubic-bezier-spring">
                  {isActive && (
                    <div className="absolute inset-0 bg-accent-blue/15 rounded-xl transition-all duration-300"></div>
                  )}
                  <tab.icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-accent-blue" : "text-text-platinum/50"} />
                </div>
                <span className={`text-[10px] font-sans font-medium transition-colors ${isActive ? "text-accent-blue" : "text-text-platinum/50"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
          
          {/* More Tab */}
          <button onClick={() => setIsSheetOpen(true)} className="group relative flex flex-col items-center justify-center w-full h-full">
            <div className="relative flex items-center justify-center w-12 h-10 transition-transform duration-[400ms] group-active:scale-[1.15] cubic-bezier-spring">
              <Menu size={22} strokeWidth={2} className="text-text-platinum/50" />
            </div>
            <span className="text-[10px] font-sans font-medium text-text-platinum/50 transition-colors">
              More
            </span>
          </button>
        </div>
      </nav>

      <MobileMoreSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
    </>
  );
}
