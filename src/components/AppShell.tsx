"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import DesktopSidebar from "@/components/DesktopSidebar";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideShell = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/admin");

  if (hideShell) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen">
      <DesktopSidebar />
      <div className="min-h-screen lg:ml-[240px]">
        <div className="mx-auto min-w-0 max-w-7xl px-0 pb-20 lg:px-8 lg:pb-8 lg:pt-8">
          {children}
        </div>
      </div>
    </div>
  );
}
