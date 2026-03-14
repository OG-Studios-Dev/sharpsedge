"use client";

import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import DesktopShell from "@/components/DesktopShell";

const AUTH_ROUTES = new Set(["/login", "/signup"]);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAuthRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (isAdminRoute) {
    return <main className="min-h-screen max-w-7xl mx-auto px-4 py-6 lg:px-6">{children}</main>;
  }

  return (
    <>
      <main className="min-h-screen max-w-lg mx-auto px-0 pb-20 lg:max-w-5xl lg:px-6 lg:pb-8">
        <DesktopShell>
          {children}
        </DesktopShell>
      </main>
      <BottomNav />
    </>
  );
}
