"use client";

import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <Sidebar />
      <MobileNav />
      <main className="lg:pl-64 pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
